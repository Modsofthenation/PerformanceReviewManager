import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHomeSuggestions } from "./homeSuggestions.js";

describe("buildHomeSuggestions", () => {
  it("returns empty when no cycle is selected", () => {
    assert.deepEqual(
      buildHomeSuggestions({
        cycleId: null,
        thinEvidenceCount: 2,
        items: [],
        nudgeCount: 0,
        nudgeDays: null,
        attentionCount: 0,
      }),
      [],
    );
  });

  it("prioritizes role assignment before self bundles and writing", () => {
    const suggestions = buildHomeSuggestions({
      cycleId: "cyc_1",
      thinEvidenceCount: 1,
      nudgeCount: 0,
      nudgeDays: null,
      attentionCount: 0,
      items: [
        {
          person: { id: "p1", name: "Alex", roleTitle: null },
          hasSelf: false,
          managerStatus: "missing",
        },
        {
          person: { id: "p2", name: "Blake", roleTitle: "IC3" },
          hasSelf: true,
          managerStatus: "draft",
          selfStatus: "returned",
        },
      ],
    });
    assert.equal(suggestions[0]?.id, "assign-roles");
    assert.ok(suggestions.some((s) => s.id === "self-bundles"));
    assert.ok(suggestions.some((s) => s.id === "write-p2"));
    assert.ok(suggestions.some((s) => s.id === "backfill"));
  });

  it("drops cleared items as pipeline advances", () => {
    const before = buildHomeSuggestions({
      cycleId: "cyc_1",
      thinEvidenceCount: 0,
      nudgeCount: 0,
      nudgeDays: null,
      attentionCount: 0,
      items: [
        {
          person: { id: "p1", name: "Alex", roleTitle: "IC3" },
          hasSelf: false,
          managerStatus: "missing",
          selfStatus: "pending",
        },
      ],
    });
    assert.equal(before[0]?.id, "self-bundles");

    const after = buildHomeSuggestions({
      cycleId: "cyc_1",
      thinEvidenceCount: 0,
      nudgeCount: 0,
      nudgeDays: null,
      attentionCount: 0,
      items: [
        {
          person: { id: "p1", name: "Alex", roleTitle: "IC3" },
          hasSelf: true,
          managerStatus: "missing",
          selfStatus: "returned",
        },
      ],
    });
    assert.equal(after[0]?.id, "write-p1");
    assert.equal(after.some((s) => s.id === "self-bundles"), false);
  });

  it("shows cycle-complete when everyone is finalized", () => {
    const suggestions = buildHomeSuggestions({
      cycleId: "cyc_1",
      thinEvidenceCount: 0,
      nudgeCount: 0,
      nudgeDays: null,
      attentionCount: 0,
      items: [
        {
          person: { id: "p1", name: "Alex", roleTitle: "IC3" },
          hasSelf: true,
          managerStatus: "finalized",
          selfStatus: "returned",
        },
      ],
    });
    assert.equal(suggestions[0]?.id, "cycle-complete");
  });

  it("falls back to year-round capture when the queue is idle", () => {
    const suggestions = buildHomeSuggestions({
      cycleId: "cyc_1",
      thinEvidenceCount: 0,
      nudgeCount: 0,
      nudgeDays: null,
      attentionCount: 0,
      items: [],
    });
    assert.equal(suggestions[0]?.id, "capture-evidence");
  });
});
