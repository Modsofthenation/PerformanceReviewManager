import type { StagnationHint } from "@prm/shared";

/** Flag directs whose overall stayed flat (±0) across ≥minCycles finalized manager reviews, or thin evidence repeatedly. */
export function computeStagnationHints(
  rows: Array<{
    personId: string;
    personName: string;
    overall: number | null;
    evidenceLinkCount: number;
    cycleEnd: string;
  }>,
  opts?: { minCycles?: number; thinEvidenceMax?: number },
): StagnationHint[] {
  const minCycles = opts?.minCycles ?? 3;
  const thinMax = opts?.thinEvidenceMax ?? 1;
  const byPerson = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byPerson.get(row.personId) ?? [];
    list.push(row);
    byPerson.set(row.personId, list);
  }

  const hints: StagnationHint[] = [];
  for (const [personId, list] of byPerson) {
    const ordered = [...list].sort((a, b) => a.cycleEnd.localeCompare(b.cycleEnd));
    const overalls = ordered.map((r) => r.overall).filter((n): n is number => typeof n === "number");
    if (overalls.length >= minCycles) {
      const recent = overalls.slice(-minCycles);
      if (recent.every((n) => n === recent[0])) {
        hints.push({
          personId,
          personName: ordered[0]!.personName,
          kind: "flat_overall",
          detail: `Overall ${recent[0]} across last ${minCycles} cycles — check for stagnation or under-calibration.`,
          overalls: recent,
          cycleCount: overalls.length,
        });
      }
    }
    const thinStreak = ordered.slice(-minCycles).filter((r) => r.evidenceLinkCount <= thinMax);
    if (ordered.length >= minCycles && thinStreak.length >= minCycles) {
      hints.push({
        personId,
        personName: ordered[0]!.personName,
        kind: "thin_evidence",
        detail: `≤${thinMax} evidence link(s) in each of the last ${minCycles} cycles.`,
        overalls: overalls.slice(-minCycles),
        cycleCount: ordered.length,
      });
    }
  }
  return hints;
}
