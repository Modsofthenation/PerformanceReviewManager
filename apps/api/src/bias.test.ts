import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runBiasToneLint } from "../src/bias.js";

describe("bias tone lint", () => {
  it("flags absolutist language", () => {
    const findings = runBiasToneLint("They always ship and never miss.");
    assert.ok(findings.some((f) => f.id === "absolutes"));
  });

  it("flags dense superlatives", () => {
    const findings = runBiasToneLint("A brilliant genius and amazing rockstar ninja.");
    assert.ok(findings.some((f) => f.id === "praise_density"));
  });

  it("flags stereotype-risk phrasing", () => {
    const findings = runBiasToneLint("Can be abrasive and a cultural fit concern in meetings.");
    assert.ok(findings.some((f) => f.id === "stereotype_risk"));
  });

  it("notes missing citations", () => {
    const findings = runBiasToneLint("Solid contributor across the board this cycle.");
    assert.ok(findings.some((f) => f.id === "no_citations"));
  });
});
