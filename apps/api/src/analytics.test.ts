import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDays,
  buildCycleCompare,
  buildPersonTimeline,
  buildRatingTrends,
  buildSprintPulse,
  inRange,
  resolvePulseWindow,
} from "./analytics.js";

describe("pulse window helpers", () => {
  it("defaults to last 14 days", () => {
    const w = resolvePulseWindow({ today: "2026-07-25" });
    assert.equal(w.from, "2026-07-12");
    assert.equal(w.to, "2026-07-25");
    assert.equal(w.preset, "last_14");
  });

  it("honors custom from/to", () => {
    const w = resolvePulseWindow({ from: "2026-03-01", to: "2026-03-14", today: "2026-07-25" });
    assert.equal(w.preset, "custom");
    assert.equal(w.from, "2026-03-01");
  });

  it("addDays and inRange work on ISO dates", () => {
    assert.equal(addDays("2026-07-01", 10), "2026-07-11");
    assert.equal(inRange("2026-07-10", "2026-07-01", "2026-07-15"), true);
    assert.equal(inRange("2026-06-30", "2026-07-01", "2026-07-15"), false);
  });
});

describe("buildSprintPulse", () => {
  it("counts window activity, themes, and stale cites", () => {
    const result = buildSprintPulse({
      from: "2026-07-01",
      to: "2026-07-14",
      preset: "custom",
      people: [
        {
          personId: "p1",
          personName: "Ada",
          levelKey: "IC4",
          achievements: [
            { occurredAt: "2026-07-05", sourceProvider: "jira" },
            { occurredAt: "2026-07-08", sourceProvider: "bitbucket" },
            { occurredAt: "2026-01-01", sourceProvider: null },
          ],
          feedback: [{ occurredAt: "2026-07-06", themes: ["Delivery", "career"] }],
          documents: [{ occurredAt: "2025-12-01" }],
          openConcernsInWindow: 1,
          linkedSources: [{ occurredAt: "2026-01-01" }, { occurredAt: "2025-06-01" }],
        },
        {
          personId: "p2",
          personName: "Ben",
          levelKey: "IC3",
          achievements: [],
          feedback: [],
          documents: [],
          openConcernsInWindow: 0,
          linkedSources: [{ occurredAt: "2026-07-03" }],
        },
      ],
    });
    assert.equal(result.summary.achievements, 2);
    assert.equal(result.summary.jira, 1);
    assert.equal(result.summary.bitbucket, 1);
    assert.equal(result.summary.feedback, 1);
    assert.equal(result.summary.openConcerns, 1);
    assert.equal(result.summary.staleCitePeople, 1);
    assert.equal(result.people[0].personName, "Ada");
    assert.equal(result.people[0].staleOnlyCites, true);
    assert.equal(result.people[1].staleOnlyCites, false);
    assert.ok(result.themes.some((t) => t.theme === "delivery"));
  });
});

describe("buildPersonTimeline", () => {
  it("sorts newest first", () => {
    const result = buildPersonTimeline({
      personId: "p1",
      personName: "Ada",
      entries: [
        { at: "2026-01-01", kind: "goal", title: "Old" },
        { at: "2026-07-01", kind: "achievement", title: "New" },
      ],
    });
    assert.equal(result.entries[0].title, "New");
  });
});

describe("buildRatingTrends", () => {
  it("computes team averages across cycles", () => {
    const trends = buildRatingTrends([
      {
        cycleId: "c1",
        cycleName: "H2",
        windowEnd: "2025-12-31",
        people: [
          { personId: "p1", personName: "Ada", overall: 3, competencies: { execution: 3 }, thin: false, themes: [] },
          { personId: "p2", personName: "Ben", overall: 4, competencies: { execution: 4 }, thin: false, themes: [] },
        ],
      },
      {
        cycleId: "c2",
        cycleName: "H1",
        windowEnd: "2026-06-30",
        people: [
          { personId: "p1", personName: "Ada", overall: 4, competencies: { execution: 5 }, thin: false, themes: [] },
          { personId: "p2", personName: "Ben", overall: 4, competencies: { execution: 4 }, thin: true, themes: [] },
        ],
      },
    ]);
    const overall = trends.team.find((t) => t.key === "overall");
    assert.equal(overall?.points[0].value, 3.5);
    assert.equal(overall?.points[1].value, 4);
    assert.equal(trends.people[0].overall[1].value, 4);
  });
});

describe("buildCycleCompare", () => {
  it("flags movers, repeat thin, and theme drift", () => {
    const compare = buildCycleCompare({
      prior: {
        cycleId: "c1",
        cycleName: "H2",
        windowEnd: "2025-12-31",
        people: [
          { personId: "p1", personName: "Ada", overall: 3, competencies: {}, thin: true, themes: ["focus"] },
          { personId: "p2", personName: "Ben", overall: 4, competencies: {}, thin: false, themes: ["focus"] },
        ],
      },
      current: {
        cycleId: "c2",
        cycleName: "H1",
        windowEnd: "2026-06-30",
        people: [
          { personId: "p1", personName: "Ada", overall: 4, competencies: {}, thin: true, themes: ["career"] },
          { personId: "p2", personName: "Ben", overall: 4, competencies: {}, thin: false, themes: ["career"] },
        ],
      },
    });
    assert.equal(compare.movers[0].personName, "Ada");
    assert.equal(compare.movers[0].delta, 1);
    assert.equal(compare.repeatThin.length, 1);
    assert.deepEqual(compare.themeDrift.appeared, ["career"]);
    assert.deepEqual(compare.themeDrift.disappeared, ["focus"]);
  });
});
