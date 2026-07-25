import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTeamPerformance } from "./teamPerformance.js";

describe("buildTeamPerformance", () => {
  it("aggregates distribution, competency averages, themes, and writing buckets", () => {
    const result = buildTeamPerformance({
      cycleId: "c1",
      cycleName: "H1",
      priorCycle: { cycleId: "c0", cycleName: "H0" },
      people: [
        {
          personId: "p1",
          personName: "Ada",
          levelKey: "L4",
          overall: 4,
          priorOverall: 3,
          competencies: { execution: 4, ownership: 5 },
          promoReadiness: "ready",
          writingSeconds: 20 * 60,
          evidenceCount: 5,
          linkedSources: 2,
          thin: false,
          managerStatus: "draft",
          coverageHits: 2,
          coverageNeed: 2,
          themes: ["career", "Career", "delivery"],
          openConcerns: 0,
        },
        {
          personId: "p2",
          personName: "Ben",
          levelKey: "L4",
          overall: 4,
          priorOverall: null,
          competencies: { execution: 3, ownership: 3 },
          promoReadiness: null,
          writingSeconds: 0,
          evidenceCount: 0,
          linkedSources: 0,
          thin: true,
          managerStatus: "not_started",
          coverageHits: 0,
          coverageNeed: 0,
          themes: ["delivery"],
          openConcerns: 1,
        },
        {
          personId: "p3",
          personName: "Cara",
          levelKey: null,
          overall: null,
          priorOverall: 4,
          competencies: {},
          promoReadiness: "not_yet",
          writingSeconds: 60 * 60,
          evidenceCount: 3,
          linkedSources: 1,
          thin: false,
          managerStatus: "draft",
          coverageHits: 0,
          coverageNeed: 1,
          themes: [],
          openConcerns: 0,
        },
      ],
    });

    assert.equal(result.participantCount, 3);
    assert.equal(result.ratedCount, 2);
    assert.equal(result.avgOverall, 4);
    assert.equal(result.distribution["4"], 2);
    assert.equal(result.distribution.unset, 1);
    assert.equal(result.promoReadiness.ready, 1);
    assert.equal(result.promoReadiness.unset, 1);
    assert.equal(result.promoReadiness.not_yet, 1);
    assert.equal(result.writingBuckets.find((b) => b.id === "none")?.count, 1);
    assert.equal(result.writingBuckets.find((b) => b.id === "under45")?.count, 1);
    assert.equal(result.writingBuckets.find((b) => b.id === "over45")?.count, 1);
    assert.equal(result.evidence.thinDossierCount, 1);
    assert.equal(result.evidence.coveragePct, 67); // 2/3
    assert.equal(result.openConcerns, 1);
    assert.equal(result.levels.find((l) => l.levelKey === "L4")?.count, 2);
    assert.equal(result.levels.find((l) => l.levelKey === "Unleveled")?.count, 1);
    assert.deepEqual(
      result.themes.map((t) => t.theme),
      ["career", "delivery"],
    );
    assert.equal(result.themes.find((t) => t.theme === "career")?.count, 2);
    assert.equal(result.themes.find((t) => t.theme === "delivery")?.count, 2);
    const exec = result.competencies.find((c) => c.key === "execution");
    assert.equal(exec?.avg, 3.5);
    assert.equal(result.people[0].personName, "Ada");
    assert.equal(result.people[0].priorOverall, 3);
    assert.equal(result.priorCycle?.cycleId, "c0");
  });

  it("returns empty-safe defaults when there are no people", () => {
    const result = buildTeamPerformance({
      cycleId: "c1",
      cycleName: "Empty",
      priorCycle: null,
      people: [],
    });
    assert.equal(result.avgOverall, null);
    assert.equal(result.evidence.coveragePct, 100);
    assert.equal(result.participantCount, 0);
    assert.deepEqual(result.themes, []);
  });
});
