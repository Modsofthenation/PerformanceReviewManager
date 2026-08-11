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

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[i]));
      i += 1;
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

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

  it("streams assistant text via SSE and archives", async () => {
    const progress: Array<{ type: string; detail?: string }> = [];
    const calls: Array<{ url: string; method: string }> = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method });

      if (method === "POST" && url.endsWith("/agents")) {
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
      if (method === "GET" && url.endsWith("/stream")) {
        return sseResponse([
          'event: status\ndata: {"runId":"run-1","status":"RUNNING"}\n\n',
          'id: 1\nevent: assistant\ndata: {"text":"Hello "}\n\n',
          'id: 2\nevent: assistant\ndata: {"text":"from stream"}\n\n',
          'id: 3\nevent: result\ndata: {"runId":"run-1","status":"FINISHED","text":"Hello from stream","durationMs":1200}\n\n',
          "id: 4\nevent: done\ndata: {}\n\n",
        ]);
      }
      if (method === "POST" && url.endsWith("/archive")) {
        return new Response(JSON.stringify({ id: "bc-1", status: "ARCHIVED" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("unexpected", { status: 500 });
    };

    const result = await runCursorCloudAgent(
      {
        apiKey: "crsr_test",
        messages: [{ role: "user", content: "ping" }],
        feature: "chat_dossier",
        model: "composer-2",
        pollMs: 1,
        timeoutMs: 5_000,
        onProgress: (p) => {
          if (p.type === "status") progress.push({ type: "status", detail: p.status });
          if (p.type === "text") progress.push({ type: "text", detail: p.cumulative });
        },
      },
      { fetchFn, sleep: async () => undefined, now: () => 1 },
    );

    assert.equal(result.text, "Hello from stream");
    assert.equal(result.model, "cursor-cloud:composer-2");
    assert.equal(result.agentId, "bc-1");
    assert.ok(progress.some((p) => p.type === "text" && p.detail === "Hello from stream"));
    assert.ok(calls.some((c) => c.method === "POST" && c.url.endsWith("/archive")));
  });

  it("uses streamed assistant deltas when result text is empty", async () => {
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();

      if (method === "POST" && url.endsWith("/agents")) {
        return new Response(
          JSON.stringify({
            agent: { id: "bc-2", url: "https://cursor.com/agents/bc-2" },
            run: { id: "run-2", agentId: "bc-2", status: "RUNNING" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (method === "GET" && url.endsWith("/stream")) {
        return sseResponse([
          'event: assistant\ndata: {"text":"Recovered answer"}\n\n',
          'event: result\ndata: {"runId":"run-2","status":"FINISHED","durationMs":800}\n\n',
          "event: done\ndata: {}\n\n",
        ]);
      }
      if (method === "GET" && url.includes("/runs/run-2") && !url.endsWith("/stream")) {
        return new Response(
          JSON.stringify({
            id: "run-2",
            agentId: "bc-2",
            status: "FINISHED",
            result: "",
            durationMs: 800,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (method === "POST" && url.endsWith("/archive")) {
        return new Response("{}", { status: 200 });
      }
      return new Response("unexpected", { status: 500 });
    };

    const result = await runCursorCloudAgent(
      {
        apiKey: "crsr_test",
        messages: [{ role: "user", content: "ping" }],
        feature: "chat_dossier",
        pollMs: 1,
        timeoutMs: 5_000,
      },
      { fetchFn, sleep: async () => undefined, now: () => 1 },
    );
    assert.equal(result.text, "Recovered answer");
  });

  it("reports agent url and ids on truly empty FINISHED runs", async () => {
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();

      if (method === "POST" && url.endsWith("/agents")) {
        return new Response(
          JSON.stringify({
            agent: { id: "bc-3", url: "https://cursor.com/agents/bc-3" },
            run: { id: "run-3", agentId: "bc-3", status: "RUNNING" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (method === "GET" && url.endsWith("/stream")) {
        return sseResponse([
          'event: result\ndata: {"runId":"run-3","status":"FINISHED","durationMs":500}\n\n',
          "event: done\ndata: {}\n\n",
        ]);
      }
      if (method === "GET" && url.includes("/runs/run-3") && !url.endsWith("/stream")) {
        return new Response(
          JSON.stringify({
            id: "run-3",
            agentId: "bc-3",
            status: "FINISHED",
            result: null,
            durationMs: 500,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (method === "POST" && url.endsWith("/archive")) {
        return new Response("{}", { status: 200 });
      }
      return new Response("unexpected", { status: 500 });
    };

    await assert.rejects(
      () =>
        runCursorCloudAgent(
          {
            apiKey: "crsr_test",
            messages: [{ role: "user", content: "ping" }],
            feature: "chat_dossier",
            pollMs: 1,
            timeoutMs: 5_000,
          },
          { fetchFn, sleep: async () => undefined, now: () => 1 },
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /empty result/);
        assert.match(err.message, /agent bc-3/);
        assert.match(err.message, /run run-3/);
        assert.match(err.message, /https:\/\/cursor\.com\/agents\/bc-3/);
        return true;
      },
    );
  });

  it("falls back to polling when stream endpoint is unavailable", async () => {
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
      if (method === "GET" && url.endsWith("/stream")) {
        return new Response("gone", { status: 410 });
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
