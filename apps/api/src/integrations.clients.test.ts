import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { jiraSearchIssuesForAssignee, jiraTestConnection } from "../src/jira.js";
import { bitbucketTestConnection } from "../src/bitbucket.js";

describe("jira client", () => {
  it("parses search issues from Cloud REST payload", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () => {
      return new Response(
        JSON.stringify({
          issues: [
            {
              id: "10001",
              key: "ENG-42",
              fields: {
                summary: "Ship reliability fix",
                status: { name: "Done" },
                issuetype: { name: "Story" },
                priority: { name: "High" },
                project: { key: "ENG", name: "Engineering" },
                updated: "2026-07-01T12:00:00.000Z",
                resolutiondate: "2026-06-28T09:00:00.000Z",
                assignee: { accountId: "abc" },
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const issues = await jiraSearchIssuesForAssignee(
      { baseUrl: "https://acme.atlassian.net", email: "em@acme.com", apiToken: "tok" },
      "abc",
    );
    assert.equal(issues.length, 1);
    assert.equal(issues[0]!.key, "ENG-42");
    assert.equal(issues[0]!.url, "https://acme.atlassian.net/browse/ENG-42");
    assert.equal(issues[0]!.resolved, "2026-06-28");
    fetchMock.mock.restore();
  });

  it("surfaces myself on test connection", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () => {
      return new Response(JSON.stringify({ displayName: "EM User", accountId: "acc1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const res = await jiraTestConnection({
      baseUrl: "https://acme.atlassian.net/",
      email: "em@acme.com",
      apiToken: "tok",
    });
    assert.equal(res.ok, true);
    assert.equal(res.displayName, "EM User");
    fetchMock.mock.restore();
  });
});

describe("bitbucket client", () => {
  it("tests connection against user + workspace", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/user")) {
        return new Response(JSON.stringify({ display_name: "Dev", uuid: "{u1}", username: "dev" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ name: "Acme", slug: "acme" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const res = await bitbucketTestConnection({
      workspace: "acme",
      username: "dev",
      appPassword: "pw",
    });
    assert.equal(res.ok, true);
    assert.equal(res.workspaceName, "Acme");
    assert.equal(res.username, "dev");
    fetchMock.mock.restore();
  });
});
