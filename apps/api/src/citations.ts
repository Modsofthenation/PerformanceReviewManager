/** Extract bracket citation ids like [ach_xxx] / [rexp_xxx] from model text. */
export function extractCitationIds(text: string): string[] {
  const found = new Set<string>();
  const re = /\[([a-z]{2,12}_[A-Za-z0-9_-]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    found.add(m[1]);
  }
  return [...found];
}

/**
 * Drop unknown citation ids from AI output (server-side allowlist).
 * Keeps prose; removes `[unknown_id]` entirely (do not leave bare ids that look real).
 */
export function filterCitationsAgainstAllowlist(text: string, allowlist: string[]) {
  const allowed = new Set(allowlist);
  const used: string[] = [];
  const dropped: string[] = [];
  const cleaned = text.replace(/\[([a-z]{2,12}_[A-Za-z0-9_-]+)\]/g, (full, id: string) => {
    if (allowed.has(id)) {
      if (!used.includes(id)) used.push(id);
      return full;
    }
    if (!dropped.includes(id)) dropped.push(id);
    return "";
  });
  return {
    text: cleaned.replace(/[ \t]{2,}/g, " ").replace(/ \./g, ".").trim(),
    citationsUsed: used,
    citationsDropped: dropped,
  };
}
