import type Database from "better-sqlite3";

/** Upsert finalized/shared manager review text into FTS for workspace search. */
export function indexReviewFts(
  sqlite: Database.Database,
  row: {
    reviewId: string;
    personName: string;
    cycleName: string;
    body: string;
  },
) {
  sqlite.prepare("DELETE FROM reviews_fts WHERE review_id = ?").run(row.reviewId);
  sqlite
    .prepare(
      "INSERT INTO reviews_fts (review_id, person_name, cycle_name, body) VALUES (?, ?, ?, ?)",
    )
    .run(row.reviewId, row.personName, row.cycleName, row.body);
}

export function searchReviewsFts(
  sqlite: Database.Database,
  query: string,
  limit = 40,
): Array<{ reviewId: string; personName: string; cycleName: string; snippet: string }> {
  const q = query.trim();
  if (!q) return [];
  // Escape FTS5 special chars lightly; treat as phrase + prefix tokens
  const safe = q.replace(/["']/g, " ").replace(/\s+/g, " ").trim();
  if (!safe) return [];
  const match = safe
    .split(" ")
    .filter(Boolean)
    .map((t) => `"${t}"*`)
    .join(" AND ");
  try {
    return sqlite
      .prepare(
        `SELECT review_id as reviewId, person_name as personName, cycle_name as cycleName,
                snippet(reviews_fts, 3, '', '', '…', 12) as snippet
         FROM reviews_fts
         WHERE reviews_fts MATCH ?
         LIMIT ?`,
      )
      .all(match, limit) as Array<{
      reviewId: string;
      personName: string;
      cycleName: string;
      snippet: string;
    }>;
  } catch {
    // Fallback: LIKE over body if MATCH parse fails
    return sqlite
      .prepare(
        `SELECT review_id as reviewId, person_name as personName, cycle_name as cycleName,
                substr(body, 1, 160) as snippet
         FROM reviews_fts
         WHERE body LIKE ? OR person_name LIKE ? OR cycle_name LIKE ?
         LIMIT ?`,
      )
      .all(`%${safe}%`, `%${safe}%`, `%${safe}%`, limit) as Array<{
      reviewId: string;
      personName: string;
      cycleName: string;
      snippet: string;
    }>;
  }
}

export function rebuildReviewsFts(
  sqlite: Database.Database,
  rows: Array<{ reviewId: string; personName: string; cycleName: string; body: string }>,
) {
  sqlite.exec("DELETE FROM reviews_fts");
  const ins = sqlite.prepare(
    "INSERT INTO reviews_fts (review_id, person_name, cycle_name, body) VALUES (?, ?, ?, ?)",
  );
  const tx = sqlite.transaction((items: typeof rows) => {
    for (const r of items) ins.run(r.reviewId, r.personName, r.cycleName, r.body);
  });
  tx(rows);
}
