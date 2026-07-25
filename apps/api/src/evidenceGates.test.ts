import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterCitationsAgainstAllowlist, extractCitationIds } from "../src/citations.js";
import {
  collectRatingChanges,
  evidenceDensityErrors,
  looksLikeMeetingDoc,
  redactSnapshotForSubject,
  uniqueEvidenceSources,
} from "../src/evidenceGates.js";
import { MIDDLE_BAND } from "@prm/shared";

describe("citations allowlist", () => {
  it("keeps allowed bracket ids and strips unknown ones entirely", () => {
    const { text, citationsUsed, citationsDropped } = filterCitationsAgainstAllowlist(
      "Shipped [ach_real] and invented [ach_fake_xyz].",
      ["ach_real"],
    );
    assert.ok(text.includes("[ach_real]"));
    assert.ok(!text.includes("ach_fake_xyz"));
    assert.deepEqual(citationsUsed, ["ach_real"]);
    assert.deepEqual(citationsDropped, ["ach_fake_xyz"]);
  });

  it("extracts citation ids", () => {
    assert.deepEqual(extractCitationIds("See [ach_a] and [rexp_b]"), ["ach_a", "rexp_b"]);
  });
});

describe("evidence density", () => {
  it("requires distinct sources for extreme overall", () => {
    const links = [
      { targetType: "competency", targetKey: "delivery", sourceType: "achievement", sourceId: "ach_1" },
      { targetType: "competency", targetKey: "delivery", sourceType: "achievement", sourceId: "ach_1" },
    ];
    assert.equal(uniqueEvidenceSources(links).size, 1);
    const missing = evidenceDensityErrors({ delivery: 5 }, 5, links, (k) => k);
    assert.ok(missing.some((m) => m.includes("distinct")));
  });

  it("allows middle-band without links", () => {
    const missing = evidenceDensityErrors({ delivery: MIDDLE_BAND }, MIDDLE_BAND, [], (k) => k);
    assert.deepEqual(missing, []);
  });
});

describe("decision reasons", () => {
  it("flags first non-middle overall set", () => {
    const changes = collectRatingChanges({
      prevOverall: null,
      nextOverall: 5,
      prevComps: {},
      nextComps: {},
      prevPromo: "",
      nextPromo: "not_applicable",
    });
    assert.equal(changes.length, 1);
    assert.equal(changes[0].field, "overall");
  });

  it("ignores staying at middle band", () => {
    const changes = collectRatingChanges({
      prevOverall: 3,
      nextOverall: 3,
      prevComps: { delivery: 3 },
      nextComps: { delivery: 3 },
      prevPromo: "not_applicable",
      nextPromo: "not_applicable",
    });
    assert.equal(changes.length, 0);
  });
});

describe("share redaction", () => {
  it("drops em_only snapshots", () => {
    assert.equal(
      redactSnapshotForSubject({
        title: "secret",
        excerpt: "x",
        checksum: null,
        sourceType: "feedback",
        sourceId: "fb_1",
        visibility: "em_only",
      }),
      null,
    );
  });

  it("scrubs fromName in feedback titles", () => {
    const r = redactSnapshotForSubject({
      title: "Feedback from Alex Peer (praise)",
      excerpt: "nice",
      checksum: null,
      sourceType: "feedback",
      sourceId: "fb_1",
      visibility: "em_and_subject",
      fromName: "Alex Peer",
    });
    assert.ok(r);
    assert.equal(r.title, "Feedback (praise)");
  });
});

describe("meeting heuristic", () => {
  it("detects meeting-like docs", () => {
    assert.equal(looksLikeMeetingDoc("1:1 notes", "file.md"), true);
    assert.equal(looksLikeMeetingDoc("Design doc", "spec.pdf"), false);
  });
});
