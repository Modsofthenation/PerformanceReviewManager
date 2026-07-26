import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { jiraSearchIssuesForAssignee, jiraTestConnection } from "./jira.js";
import { bitbucketTestConnection } from "./bitbucket.js";
import { githubMergedPrsForAuthor, githubTestConnection } from "./github.js";

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
                status: { name: "Done", statusCategory: { key: "done", name: "Done" } },
                issuetype: { name: "Story" },
                priority: { name: "High" },
                project: { key: "ENG", name: "Engineering" },
                updated: "2026-07-01T12:00:00.000Z",
                resolutiondate: "2026-06-28T09:00:00.000Z",
                assignee: { accountId: "abc" },
                reporter: { accountId: "rep", displayName: "Reporter" },
                labels: ["platform"],
                customfield_10016: 3,
              },
            },
            {
              id: "10002",
              key: "ENG-99",
              fields: {
                summary: "dependabot bump",
                status: { name: "Done" },
                issuetype: { name: "Sub-task" },
                project: { key: "ENG", name: "Engineering" },
                updated: "2026-07-01T12:00:00.000Z",
                assignee: { accountId: "abc" },
                labels: [],
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
    assert.equal(issues[0]!.isDone, true);
    assert.equal(issues[0]!.storyPoints, 3);
    assert.equal(issues[0]!.reporterName, "Reporter");
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

describe("github client", () => {
  it("tests connection against /user", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () => {
      return new Response(JSON.stringify({ login: "ada", name: "Ada", id: 42 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const res = await githubTestConnection({ token: "ghp_x" });
    assert.equal(res.ok, true);
    assert.equal(res.login, "ada");
    fetchMock.mock.restore();
  });

  it("maps merged PRs with size bands", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/search/issues")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 1,
                number: 12,
                title: "Ship feature",
                html_url: "https://github.com/acme/app/pull/12",
                repository_url: "https://api.github.com/repos/acme/app",
                created_at: "2026-06-01T00:00:00Z",
                updated_at: "2026-06-10T00:00:00Z",
                closed_at: "2026-06-10T00:00:00Z",
                pull_request: { merged_at: "2026-06-10T00:00:00Z" },
                user: { login: "ada" },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/pulls/12/reviews")) {
        return new Response(JSON.stringify([{ id: 1 }, { id: 2 }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/pulls/12")) {
        return new Response(
          JSON.stringify({ additions: 20, deletions: 5, changed_files: 3 }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("{}", { status: 404 });
    });
    const prs = await githubMergedPrsForAuthor(
      { token: "ghp_x", org: "acme" },
      "ada",
      { windowStart: "2026-06-01", windowEnd: "2026-06-30" },
    );
    assert.equal(prs.length, 1);
    assert.equal(prs[0]!.sizeBand, "S");
    assert.equal(prs[0]!.daysToMerge, 9);
    assert.equal(prs[0]!.reviewCount, 2);
    fetchMock.mock.restore();
  });
});
