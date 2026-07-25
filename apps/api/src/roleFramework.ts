import type { ExpectationKind, Track } from "@prm/shared";

export type RoleDraftExpectation = {
  kind: ExpectationKind;
  text: string;
};

export type RoleDraft = {
  key: string;
  title: string;
  track: Track;
  levelKey: string | null;
  summary: string | null;
  nextRoleKeys: string[];
  expectations: RoleDraftExpectation[];
};

const LEVEL_RE = /\b(IC[1-8]|M[1-5]|L[1-8]|E[1-8]|P[1-8])\b/i;

export function slugifyRoleKey(title: string, levelKey?: string | null): string {
  const base = `${levelKey ?? ""} ${title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  return base || `role_${Date.now().toString(36)}`;
}

export function normalizeTrack(raw: string | undefined | null): Track {
  const t = (raw ?? "").toLowerCase();
  if (t.includes("manager") || t === "m" || t.startsWith("m")) return "manager";
  if (t.includes("other")) return "other";
  return "ic";
}

export function normalizeExpectationKind(raw: string | undefined | null): ExpectationKind {
  const t = (raw ?? "").toLowerCase();
  if (t.includes("expect")) return "expectation";
  return "responsibility";
}

/** Pull printable text from an uploaded buffer (best-effort for txt/md; binary PDFs stay thin). */
export function textFromUpload(buf: Buffer, filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const raw = buf.toString("utf8");
  if (["txt", "md", "csv", "json"].includes(ext)) {
    return raw.replace(/^\uFEFF/, "");
  }
  // Strip obvious binary noise; keep long printable runs.
  const cleaned = raw.replace(/[^\x09\x0a\x0d\x20-\x7e]/g, " ").replace(/ {2,}/g, " ");
  const compact = cleaned.replace(/\s+/g, " ").trim();
  if (compact.length < 80) {
    throw new Error(
      "Could not extract readable text from that file. Upload .txt/.md, or paste the framework text.",
    );
  }
  return cleaned.slice(0, 120_000);
}

function inferLevel(title: string, heading: string): string | null {
  const m = `${heading} ${title}`.match(LEVEL_RE);
  return m ? m[1]!.toUpperCase() : null;
}

/**
 * Local heuristic parser for career-framework markdown / outline text.
 * Recognizes `# Title`, `## IC4 — Senior…`, and bullet lists under Responsibilities / Expectations.
 */
export function parseFrameworkTextLocal(text: string): RoleDraft[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const roles: RoleDraft[] = [];
  let current: RoleDraft | null = null;
  let section: "none" | "responsibility" | "expectation" | "summary" = "none";

  const pushCurrent = () => {
    if (!current) return;
    if (!current.expectations.length && current.summary) {
      current.expectations.push({ kind: "responsibility", text: current.summary });
    }
    if (current.title.trim()) roles.push(current);
    current = null;
    section = "none";
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      const titleLine = heading[1]!.replace(/^Role:\s*/i, "").trim();
      const levelish = titleLine.match(LEVEL_RE);
      // New role heading if it looks like a role/level, not a subsection label
      const subsection = /^(responsibilit|expectation|summary|next|competenc|about)/i.test(titleLine);
      if (!subsection) {
        pushCurrent();
        const levelKey = inferLevel(titleLine, titleLine);
        const title = titleLine
          .replace(LEVEL_RE, "")
          .replace(/^[\s—\-–|:]+|[\s—\-–|:]+$/g, "")
          .trim() || titleLine;
        current = {
          key: slugifyRoleKey(title, levelKey),
          title,
          track: /manager|m[1-5]/i.test(titleLine) ? "manager" : "ic",
          levelKey: levelKey ?? (levelish ? levelish[1]!.toUpperCase() : null),
          summary: null,
          nextRoleKeys: [],
          expectations: [],
        };
        section = "summary";
        continue;
      }
      if (/responsibilit/i.test(titleLine)) section = "responsibility";
      else if (/expectation/i.test(titleLine)) section = "expectation";
      else if (/summary/i.test(titleLine)) section = "summary";
      continue;
    }

    if (/^responsibilit/i.test(line)) {
      section = "responsibility";
      continue;
    }
    if (/^expectation/i.test(line)) {
      section = "expectation";
      continue;
    }

    const bullet = line.match(/^[-*•]\s+(.+)$/) || line.match(/^\d+[.)]\s+(.+)$/);
    if (current && bullet) {
      const textItem = bullet[1]!.trim();
      if (!textItem) continue;
      const kind: ExpectationKind =
        section === "expectation" ? "expectation" : section === "responsibility" ? "responsibility" : "responsibility";
      current.expectations.push({ kind, text: textItem });
      continue;
    }

    if (current && section === "summary" && !current.summary && !bullet) {
      current.summary = line.slice(0, 400);
    }
  }
  pushCurrent();

  // CSV-ish fallback: Level,Title,Track,Summary
  if (!roles.length) {
    const csvLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (csvLines.length >= 2 && /level|title/i.test(csvLines[0]!)) {
      const header = csvLines[0]!.toLowerCase().split(",").map((h) => h.trim());
      const li = header.findIndex((h) => h.includes("level"));
      const ti = header.findIndex((h) => h.includes("title") || h === "role" || h === "name");
      const trackI = header.findIndex((h) => h.includes("track"));
      const sumI = header.findIndex((h) => h.includes("summary") || h.includes("desc"));
      if (ti >= 0) {
        for (const row of csvLines.slice(1)) {
          const cols = row.split(",").map((c) => c.trim());
          const title = cols[ti] ?? "";
          if (!title) continue;
          const levelKey = li >= 0 ? cols[li] || null : inferLevel(title, title);
          roles.push({
            key: slugifyRoleKey(title, levelKey),
            title,
            track: normalizeTrack(trackI >= 0 ? cols[trackI] : levelKey),
            levelKey,
            summary: sumI >= 0 ? cols[sumI] || null : null,
            nextRoleKeys: [],
            expectations: sumI >= 0 && cols[sumI] ? [{ kind: "responsibility", text: cols[sumI]! }] : [],
          });
        }
      }
    }
  }

  // Wire nextRoleKeys by ascending level order when possible
  const withLevels = roles.filter((r) => r.levelKey);
  withLevels.sort((a, b) => String(a.levelKey).localeCompare(String(b.levelKey)));
  for (let i = 0; i < withLevels.length - 1; i++) {
    const cur = withLevels[i]!;
    const nxt = withLevels[i + 1]!;
    if (!cur.nextRoleKeys.length) cur.nextRoleKeys = [nxt.key];
  }

  return roles.slice(0, 40);
}

export function parseExtractedRolesJson(raw: string): RoleDraft[] {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.indexOf("{");
  const startArr = candidate.indexOf("[");
  let jsonText = candidate;
  if (startArr >= 0 && (start < 0 || startArr < start)) {
    const end = candidate.lastIndexOf("]");
    jsonText = candidate.slice(startArr, end + 1);
  } else if (start >= 0) {
    const end = candidate.lastIndexOf("}");
    jsonText = candidate.slice(start, end + 1);
  }
  const parsed = JSON.parse(jsonText) as
    | { roles?: unknown[] }
    | unknown[];
  const list = Array.isArray(parsed) ? parsed : parsed.roles;
  if (!Array.isArray(list)) throw new Error("AI response missing roles array");

  const roles: RoleDraft[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const title = String(row.title ?? row.name ?? "").trim();
    if (!title) continue;
    const levelKey = row.levelKey
      ? String(row.levelKey)
      : row.level
        ? String(row.level)
        : inferLevel(title, title);
    const expectationsRaw = Array.isArray(row.expectations) ? row.expectations : [];
    const expectations: RoleDraftExpectation[] = expectationsRaw
      .map((e) => {
        if (typeof e === "string") return { kind: "responsibility" as const, text: e.trim() };
        if (e && typeof e === "object") {
          const o = e as Record<string, unknown>;
          const text = String(o.text ?? o.description ?? "").trim();
          if (!text) return null;
          return { kind: normalizeExpectationKind(String(o.kind ?? "")), text };
        }
        return null;
      })
      .filter((e): e is RoleDraftExpectation => Boolean(e))
      .slice(0, 24);

    const nextRaw = row.nextRoleKeys ?? row.next ?? [];
    const nextRoleKeys = Array.isArray(nextRaw)
      ? nextRaw.map((x) => String(x)).filter(Boolean).slice(0, 8)
      : [];

    roles.push({
      key: String(row.key ?? slugifyRoleKey(title, levelKey)).replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 64),
      title,
      track: normalizeTrack(String(row.track ?? levelKey ?? "")),
      levelKey: levelKey ? String(levelKey).toUpperCase() : null,
      summary: row.summary ? String(row.summary).slice(0, 600) : null,
      nextRoleKeys,
      expectations,
    });
  }
  return roles.slice(0, 40);
}

export const FRAMEWORK_EXTRACT_SYSTEM = `You extract engineering career framework RoleDefinitions from a document.
Return ONLY valid JSON (no markdown prose) with this shape:
{"roles":[{"key":"eng_ic4","title":"Senior Software Engineer","track":"ic","levelKey":"IC4","summary":"...","nextRoleKeys":["eng_ic5"],"expectations":[{"kind":"responsibility","text":"..."},{"kind":"expectation","text":"..."}]}]}
Rules:
- track is one of: ic, manager, other
- kind is responsibility or expectation
- Prefer stable snake_case keys including level when possible
- Include 3–8 expectations per role when the source supports it
- Do not invent company-specific people or private notes
- If the doc is thin, still return best-effort roles rather than an empty array`;
