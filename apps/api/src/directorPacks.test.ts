import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCitedBullets, bumpDistribution, emptyDistribution, renderDirectorBriefingHtml } from "./directorPacks.js";
import { sealReadonlyBundle } from "./readonlyBundle.js";
import { decryptBytes } from "./store.js";
import { createHash, scryptSync } from "node:crypto";

describe("director packs", () => {
  it("builds cited bullets with forced ach ids", () => {
    const bullets = buildCitedBullets({
      summary: "Shipped the billing migration on time with strong ownership across squads.",
      strengths: "Coached two engineers through on-call readiness this half.",
      citeIds: ["ach_1", "ach_2"],
      max: 4,
    });
    assert.ok(bullets.length >= 1);
    assert.ok(bullets.every((b) => b.text.length > 10));
    assert.ok(bullets.some((b) => b.citeId === "ach_1" || b.citeId === "ach_2"));
  });

  it("renders director briefing html without private notes leakage", () => {
    const html = renderDirectorBriefingHtml({
      cycleId: "c1",
      cycleName: "H1 2026",
      windowStart: "2026-01-01",
      windowEnd: "2026-06-30",
      exportedAt: "2026-07-01T00:00:00.000Z",
      notice: "Director briefing test notice.",
      distribution: { "1": 0, "2": 0, "3": 1, "4": 1, "5": 0, unset: 0 },
      people: [
        {
          personId: "p1",
          personName: "Ada",
          title: "Engineer",
          roleTitle: "IC4",
          overall: 4,
          priorOverall: 3,
          delta: 1,
          competencies: { execution: 4 },
          promoReadiness: "not_yet",
          citedBullets: [{ text: "Led migration", citeId: "ach_1" }],
          delivery: { issuesDone: 3, prsMerged: 2, storyPointsDone: 8, reviewsGiven: 1 },
          flags: ["thin_dossier"],
          openConcernCount: 1,
          managerStatus: "draft",
        },
      ],
    });
    assert.match(html, /Director briefing/);
    assert.match(html, /Ada/);
    assert.match(html, /\[ach_1\]/);
    assert.doesNotMatch(html, /private_notes/i);
  });

  it("bumps distribution buckets", () => {
    const d = emptyDistribution();
    bumpDistribution(d, 4);
    bumpDistribution(d, null);
    assert.equal(d["4"], 1);
    assert.equal(d.unset, 1);
  });
});

describe("readonly bundle seal", () => {
  it("encrypts with passphrase and recovers plaintext checksum", () => {
    const plain = Buffer.from(JSON.stringify({ hello: "director" }), "utf8");
    const sealed = sealReadonlyBundle(plain, "test-pass-phrase");
    assert.ok(sealed.subarray(0, 6).equals(Buffer.from("PRM1RB")));
    const salt = sealed.subarray(6, 22);
    const checksum = sealed.subarray(22, 30);
    const enc = sealed.subarray(30);
    const key = scryptSync("test-pass-phrase", Buffer.concat([Buffer.from("prm-readonly:"), salt]), 32);
    const round = decryptBytes(enc, key);
    assert.equal(round.toString("utf8"), plain.toString("utf8"));
    assert.ok(checksum.equals(createHash("sha256").update(plain).digest().subarray(0, 8)));
  });
});
