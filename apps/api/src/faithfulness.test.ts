import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeLintFindings, runFaithfulnessLint } from "../src/faithfulness.js";

describe("faithfulness lint", () => {
  it("flags unknown citations", () => {
    const findings = runFaithfulnessLint("Shipped [ach_real] and [ach_fake].", ["ach_real"]);
    assert.ok(findings.some((f) => f.category === "invention" && /ach_fake/.test(f.message)));
  });

  it("flags ungrounded long sentences", () => {
    const text = [
      "They completely transformed the platform architecture across every squad this half.",
      "Customer satisfaction improved dramatically while latency dropped for all regions.",
      "See [ach_1] for the migration they led.",
    ].join(" ");
    const findings = runFaithfulnessLint(text, ["ach_1"]);
    assert.ok(findings.some((f) => f.id === "ungrounded_claims"));
  });

  it("flags bare metrics", () => {
    const findings = runFaithfulnessLint("Reduced p99 latency by 40% across checkout.", []);
    assert.ok(findings.some((f) => f.category === "invention" && /40%/.test(f.message)));
  });

  it("merges findings without dupes", () => {
    const a = runFaithfulnessLint("Reduced cost by 25% somehow.", []);
    const merged = mergeLintFindings(a, a);
    assert.equal(merged.length, a.length);
  });
});
