import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeTranscriptLocally } from "./meetingSummary.js";
import { computeStagnationHints } from "./stagnation.js";

describe("meeting summary local extract", () => {
  it("pulls bullets and themes from a transcript paste", () => {
    const raw = `
1:1 with Alex — private coaching notes (consent noted).
- Shipping checkout migration this sprint
- Coaching two engineers on design docs
- Concern about on-call load
Alex said reliability work is going well. We agreed to revisit promotion readiness next quarter.
`;
    const { summaryText, themes } = summarizeTranscriptLocally(raw);
    assert.match(summaryText, /checkout|coaching|on-call/i);
    assert.ok(themes.length >= 1);
  });
});

describe("stagnation hints", () => {
  it("flags flat overall across cycles", () => {
    const hints = computeStagnationHints([
      { personId: "p1", personName: "Ada", overall: 3, evidenceLinkCount: 5, cycleEnd: "2024-01" },
      { personId: "p1", personName: "Ada", overall: 3, evidenceLinkCount: 4, cycleEnd: "2024-06" },
      { personId: "p1", personName: "Ada", overall: 3, evidenceLinkCount: 6, cycleEnd: "2025-01" },
    ]);
    assert.ok(hints.some((h) => h.kind === "flat_overall"));
  });

  it("flags thin evidence streak", () => {
    const hints = computeStagnationHints([
      { personId: "p2", personName: "Bo", overall: 4, evidenceLinkCount: 0, cycleEnd: "2024-01" },
      { personId: "p2", personName: "Bo", overall: 5, evidenceLinkCount: 1, cycleEnd: "2024-06" },
      { personId: "p2", personName: "Bo", overall: 4, evidenceLinkCount: 0, cycleEnd: "2025-01" },
    ]);
    assert.ok(hints.some((h) => h.kind === "thin_evidence"));
  });
});
