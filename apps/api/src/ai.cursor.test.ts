import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultCursorBaseUrl, resolveCursorBaseUrl } from "../src/ai.js";

describe("cursor provider base URL", () => {
  it("defaults when stored empty or ollama leftover", () => {
    const fallback = defaultCursorBaseUrl();
    assert.equal(resolveCursorBaseUrl(null), fallback);
    assert.equal(resolveCursorBaseUrl(""), fallback);
    assert.equal(resolveCursorBaseUrl("http://127.0.0.1:11434"), fallback);
    assert.equal(resolveCursorBaseUrl("http://127.0.0.1:11434/"), fallback);
  });

  it("keeps an explicit Cursor gateway", () => {
    assert.equal(
      resolveCursorBaseUrl("http://127.0.0.1:18789/v1/"),
      "http://127.0.0.1:18789/v1",
    );
    assert.equal(
      resolveCursorBaseUrl("https://cursor-gateway.example.com/v1"),
      "https://cursor-gateway.example.com/v1",
    );
  });
});
