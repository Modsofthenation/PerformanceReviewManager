import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultCursorBaseUrl, resolveCursorBaseUrl } from "../src/ai.js";

describe("cursor / openai-compatible provider base URL", () => {
  it("does not invent a silent local gateway when unset", () => {
    const prev = process.env.CURSOR_API_BASE_URL;
    delete process.env.CURSOR_API_BASE_URL;
    try {
      assert.equal(defaultCursorBaseUrl(), null);
      assert.equal(resolveCursorBaseUrl(null), null);
      assert.equal(resolveCursorBaseUrl(""), null);
      assert.equal(resolveCursorBaseUrl("http://127.0.0.1:11434"), null);
      assert.equal(resolveCursorBaseUrl("http://127.0.0.1:11434/"), null);
    } finally {
      if (prev === undefined) delete process.env.CURSOR_API_BASE_URL;
      else process.env.CURSOR_API_BASE_URL = prev;
    }
  });

  it("keeps an explicit gateway and honors CURSOR_API_BASE_URL", () => {
    assert.equal(
      resolveCursorBaseUrl("https://cursor-gateway.example.com/v1/"),
      "https://cursor-gateway.example.com/v1",
    );
    const prev = process.env.CURSOR_API_BASE_URL;
    process.env.CURSOR_API_BASE_URL = "http://127.0.0.1:18789/v1/";
    try {
      assert.equal(defaultCursorBaseUrl(), "http://127.0.0.1:18789/v1");
      assert.equal(resolveCursorBaseUrl(null), "http://127.0.0.1:18789/v1");
    } finally {
      if (prev === undefined) delete process.env.CURSOR_API_BASE_URL;
      else process.env.CURSOR_API_BASE_URL = prev;
    }
  });
});
