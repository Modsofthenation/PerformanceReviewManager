import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDeliveryRollup } from "./deliveryRollup.js";

describe("buildDeliveryRollup", () => {
  it("aggregates done issues, PRs, cites, and thin-evidence flags", () => {
    const rollup = buildDeliveryRollup({
      personId: "p1",
      cycleId: "c1",
      windowStart: "2026-01-01",
      windowEnd: "2026-06-30",
      dossierNonIntegrationCount: 0,
      achievements: [
        {
          id: "ach_1",
          title: "[Jira ENG-1] Ship it",
          description: null,
          occurredAt: "2026-03-01",
          sourceProvider: "jira",
          externalId: "ENG-1",
          externalUrl: "https://x/browse/ENG-1",
          externalPayloadJson: JSON.stringify({
            isDone: true,
            isInProgress: false,
            isBug: false,
            storyPoints: 5,
            labels: ["reliability"],
            epicName: "Platform",
          }),
        },
        {
          id: "ach_2",
          title: "[Jira ENG-2] WIP",
          description: null,
          occurredAt: "2026-03-10",
          sourceProvider: "jira",
          externalId: "ENG-2",
          externalUrl: null,
          externalPayloadJson: JSON.stringify({
            isDone: false,
            isInProgress: true,
            isBug: true,
          }),
        },
        {
          id: "ach_3",
          title: "[BB PR #9] Fix",
          description: null,
          occurredAt: "2026-04-01",
          sourceProvider: "bitbucket",
          externalId: "acme/repo#9",
          externalUrl: null,
          externalPayloadJson: JSON.stringify({ sizeBand: "S", looksLikeRevert: false }),
        },
        {
          id: "ach_4",
          title: "[GH review] Other",
          description: null,
          occurredAt: "2026-04-02",
          sourceProvider: "github",
          externalId: "review:org/r#1",
          externalUrl: null,
          externalPayloadJson: JSON.stringify({ kind: "review_given" }),
        },
        {
          id: "ach_old",
          title: "Old",
          description: null,
          occurredAt: "2025-01-01",
          sourceProvider: "jira",
          externalId: "ENG-0",
          externalUrl: null,
          externalPayloadJson: JSON.stringify({ isDone: true }),
        },
      ],
    });

    assert.equal(rollup.issuesDone, 1);
    assert.equal(rollup.issuesInProgress, 1);
    assert.equal(rollup.openBugs, 1);
    assert.equal(rollup.storyPointsDone, 5);
    assert.equal(rollup.prsMerged, 1);
    assert.equal(rollup.reviewsGiven, 1);
    assert.equal(rollup.sizeBands.S, 1);
    assert.ok(rollup.citeSuggestions.some((c) => c.citeToken === "[ach_1]"));
    assert.equal(rollup.flags.thinDeliveryEvidence, "jira_rich_dossier_thin");
  });

  it("flags dossier-rich empty window", () => {
    const rollup = buildDeliveryRollup({
      personId: "p1",
      cycleId: "c1",
      windowStart: "2026-01-01",
      windowEnd: "2026-06-30",
      dossierNonIntegrationCount: 5,
      achievements: [
        {
          id: "ach_old",
          title: "Old jira",
          description: null,
          occurredAt: "2024-01-01",
          sourceProvider: "jira",
          externalId: "ENG-9",
          externalUrl: null,
          externalPayloadJson: JSON.stringify({ isDone: true }),
        },
      ],
    });
    assert.equal(rollup.flags.thinDeliveryEvidence, "dossier_rich_integrations_empty_window");
  });
});
