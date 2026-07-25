import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyFaithfulnessFix,
  mergeLintFindings,
  runFaithfulnessLint,
} from "../src/faithfulness.js";

/** Golden drafts with known invention patterns — regression set for faithfulness depth. */
const GOLDEN = {
  clean: {
    text: "Led the checkout migration [ach_1] and coached two engineers through the rollout [fb_2].",
    allowlist: ["ach_1", "fb_2"],
    expectInvention: false,
  },
  inventedCite: {
    text: "Shipped the migration [ach_real] and invented support [ach_fake].",
    allowlist: ["ach_real"],
    expectIds: ["unknown_cite_ach_fake"],
  },
  ungroundedAbsolutes: {
    text: [
      "They completely transformed the platform architecture across every squad this half.",
      "Customer satisfaction improved dramatically while latency dropped for all regions.",
      "See [ach_1] for the migration they led.",
    ].join(" "),
    allowlist: ["ach_1"],
    expectIds: ["ungrounded_claims"],
  },
  bareMetric: {
    text: "Reduced p99 latency by 40% across checkout.",
    allowlist: [] as string[],
    expectMetric: "40%",
  },
  metricWithCite: {
    text: "Reduced p99 latency by 40% across checkout [ach_1].",
    allowlist: ["ach_1"],
    expectInvention: false,
  },
};

describe("faithfulness lint", () => {
  it("flags unknown citations", () => {
    const findings = runFaithfulnessLint(GOLDEN.inventedCite.text, GOLDEN.inventedCite.allowlist);
    assert.ok(findings.some((f) => f.category === "invention" && /ach_fake/.test(f.message)));
    assert.equal(findings.find((f) => f.id.startsWith("unknown_cite_"))?.suggestedFix?.action, "strip_cite");
  });

  it("flags ungrounded long sentences", () => {
    const findings = runFaithfulnessLint(
      GOLDEN.ungroundedAbsolutes.text,
      GOLDEN.ungroundedAbsolutes.allowlist,
    );
    assert.ok(findings.some((f) => f.id === "ungrounded_claims"));
    assert.ok(findings.find((f) => f.id === "ungrounded_claims")?.suggestedFix);
  });

  it("flags bare metrics", () => {
    const findings = runFaithfulnessLint(GOLDEN.bareMetric.text, GOLDEN.bareMetric.allowlist);
    assert.ok(findings.some((f) => f.category === "invention" && /40%/.test(f.message)));
  });

  it("accepts clean cited prose", () => {
    const findings = runFaithfulnessLint(GOLDEN.clean.text, GOLDEN.clean.allowlist);
    assert.equal(
      findings.filter((f) => f.category === "invention" && f.severity === "warn").length,
      0,
    );
  });

  it("does not flag metrics next to a citation", () => {
    const findings = runFaithfulnessLint(GOLDEN.metricWithCite.text, GOLDEN.metricWithCite.allowlist);
    assert.ok(!findings.some((f) => f.id.startsWith("metric_")));
  });

  it("merges findings without dupes", () => {
    const a = runFaithfulnessLint("Reduced cost by 25% somehow.", []);
    const merged = mergeLintFindings(a, a);
    assert.equal(merged.length, a.length);
  });

  it("applies soften and cite fixes", () => {
    const findings = runFaithfulnessLint(GOLDEN.bareMetric.text, ["ach_1"]);
    const metric = findings.find((f) => f.id.startsWith("metric_"));
    assert.ok(metric?.suggestedFix);
    const next = applyFaithfulnessFix(GOLDEN.bareMetric.text, metric!);
    assert.ok(next);
    assert.match(next!, /\[ach_1\]/);
  });

  it("strips unknown cites via suggested fix", () => {
    const findings = runFaithfulnessLint(GOLDEN.inventedCite.text, GOLDEN.inventedCite.allowlist);
    const bad = findings.find((f) => f.id === "unknown_cite_ach_fake");
    assert.ok(bad);
    const next = applyFaithfulnessFix(GOLDEN.inventedCite.text, bad!);
    assert.ok(next);
    assert.ok(!next!.includes("[ach_fake]"));
    assert.ok(next!.includes("[ach_real]"));
  });
});

describe("faithfulness golden eval set", () => {
  it("scores known invention drafts", () => {
    const cases = [
      GOLDEN.inventedCite,
      GOLDEN.ungroundedAbsolutes,
      GOLDEN.bareMetric,
    ];
    for (const c of cases) {
      const findings = runFaithfulnessLint(c.text, c.allowlist);
      assert.ok(
        findings.some((f) => f.category === "invention"),
        `expected invention in: ${c.text.slice(0, 60)}`,
      );
    }
  });
});
