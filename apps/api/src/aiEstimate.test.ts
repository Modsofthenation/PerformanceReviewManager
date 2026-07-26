import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateCostUsd, estimateTokensFromText, maxOutputTokensForFeature } from "../src/aiEstimate.js";

describe("ai estimate helpers", () => {
  it("estimates tokens from text length", () => {
    assert.equal(estimateTokensFromText("abcd"), 1);
    assert.ok(estimateTokensFromText("x".repeat(40)) >= 10);
  });

  it("returns null cost for cursor/ollama", () => {
    assert.equal(estimateCostUsd({ provider: "cursor", inputTokens: 1000, outputTokens: 1000 }), null);
    assert.equal(estimateCostUsd({ provider: "ollama", inputTokens: 1000, outputTokens: 1000 }), null);
  });

  it("estimates anthropic cost", () => {
    const cost = estimateCostUsd({ provider: "anthropic", inputTokens: 1_000_000, outputTokens: 0 });
    assert.equal(cost, 3);
  });

  it("caps output tokens by feature", () => {
    assert.equal(maxOutputTokensForFeature("framework_extract"), 4096);
    assert.equal(maxOutputTokensForFeature("evidence_digest"), 1600);
  });
});
