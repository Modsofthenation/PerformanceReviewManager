import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultCursorBaseUrl, normalizeAiProvider, resolveCursorBaseUrl } from "../src/ai.js";
import { formatCloudAgentPrompt, runCursorCloudAgent } from "../src/cursorCloud.js";

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

describe("normalizeAiProvider", () => {
  it("maps bare cursor to Cloud Agents", () => {
    assert.equal(normalizeAiProvider("cursor", null), "cursor");
  });

  it("maps legacy cursor + gateway to openai_compatible", () => {
    assert.equal(normalizeAiProvider("cursor", "https://gw.example/v1"), "openai_compatible");
  });

  it("keeps explicit openai_compatible", () => {
    assert.equal(normalizeAiProvider("openai_compatible", "https://gw.example/v1"), "openai_compatible");
  });
});

describe("Cursor Cloud Agents client", () => {
  it("formats a grounded prompt", () => {
    const text = formatCloudAgentPrompt(
      [
        { role: "system", content: "Cite ids." },
        { role: "user", content: "Summarize [ach_1]." },
      ],
      "evidence_digest",
    );
    assert.match(text, /feature: evidence_digest/);
    assert.match(text, /=== SYSTEM ===/);
    assert.match(text, /Cite ids/);
    assert.match(text, /Summarize \[ach_1\]/);
  });

  it("creates a no-repo agent, polls to FINISHED, archives", async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    let poll = 0;
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method, body });

      if (method === "POST" && url.endsWith("/agents")) {
        assert.equal(body.prompt.text.includes("ping"), true);
        assert.equal(body.repos, undefined);
        return new Response(
          JSON.stringify({
            agent: {
              id: "bc-1",
              url: "https://cursor.com/agents/bc-1",
              latestRunId: "run-1",
            },
            run: { id: "run-1", agentId: "bc-1", status: "CREATING" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (method === "GET" && url.includes("/runs/run-1")) {
        poll += 1;
        const status = poll === 1 ? "RUNNING" : "FINISHED";
        return new Response(
          JSON.stringify({
            id: "run-1",
            agentId: "bc-1",
            status,
            result: status === "FINISHED" ? "OK from cloud" : null,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (method === "POST" && url.endsWith("/archive")) {
        return new Response(JSON.stringify({ id: "bc-1", status: "ARCHIVED" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("unexpected", { status: 500 });
    };

    let t = 0;
    const result = await runCursorCloudAgent(
      {
        apiKey: "crsr_test",
        messages: [{ role: "user", content: "ping" }],
        feature: "evidence_digest",
        model: "composer-2",
        pollMs: 1,
        timeoutMs: 5_000,
      },
      {
        fetchFn,
        sleep: async () => undefined,
        now: () => {
          t += 10;
          return t;
        },
      },
    );

    assert.equal(result.text, "OK from cloud");
    assert.equal(result.model, "cursor-cloud:composer-2");
    assert.equal(result.agentId, "bc-1");
    assert.ok(calls.some((c) => c.method === "POST" && c.url.endsWith("/archive")));
  });
});
