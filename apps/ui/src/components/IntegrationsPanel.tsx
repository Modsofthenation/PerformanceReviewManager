import { useEffect, useState } from "react";
import type { IntegrationSettingsDTO, IntegrationSyncResult } from "@prm/shared";
import { api } from "../lib/api";

type IntegrationsState = {
  jira: IntegrationSettingsDTO;
  bitbucket: IntegrationSettingsDTO;
  github: IntegrationSettingsDTO;
  linear: IntegrationSettingsDTO;
};

export function IntegrationsPanel() {
  const [state, setState] = useState<IntegrationsState | null>(null);
  const [jiraToken, setJiraToken] = useState("");
  const [bbToken, setBbToken] = useState("");
  const [ghToken, setGhToken] = useState("");
  const [linearToken, setLinearToken] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const raw = await api<Partial<IntegrationsState> & IntegrationsState>("/api/integrations");
    setState({
      jira: raw.jira,
      bitbucket: raw.bitbucket,
      github: raw.github,
      linear: raw.linear ?? {
        id: "linear",
        enabled: false,
        baseUrl: "https://api.linear.app/graphql",
        workspaceSlug: null,
        authEmail: null,
        authUsername: null,
        hasToken: false,
        extra: {},
        lastSyncAt: null,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  useEffect(() => {
    load().catch((e) => setMsg(e instanceof Error ? e.message : "Failed to load integrations"));
  }, []);

  if (!state) return <p className="muted">Loading integrations…</p>;

  const jiraExtra = state.jira.extra ?? {};

  return (
    <div className="panel stack">
      <h2>Integrations</h2>
      <p className="muted">
        Pull cycle-scoped Jira / Linear issues and merged Bitbucket / GitHub PRs into each person’s dossier as
        achievements (citable on the writing desk). Tokens are encrypted with the workspace secret.
        Sync is explicit egress — no leaderboards, LOC scores, or Slack mining.
      </p>

      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const next = await api<IntegrationSettingsDTO>("/api/integrations/jira", {
              method: "PUT",
              body: JSON.stringify({
                enabled: state.jira.enabled,
                baseUrl: state.jira.baseUrl,
                authEmail: state.jira.authEmail,
                token: jiraToken || undefined,
                extra: {
                  ...jiraExtra,
                  includeComments: Boolean(jiraExtra.includeComments),
                },
              }),
            });
            setState((s) => (s ? { ...s, jira: next } : s));
            setJiraToken("");
            setMsg("Jira settings saved");
          } catch (err) {
            setMsg(err instanceof Error ? err.message : "Save failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <h3>Jira Cloud</h3>
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={state.jira.enabled}
              onChange={(e) =>
                setState({ ...state, jira: { ...state.jira, enabled: e.target.checked } })
              }
            />{" "}
            Enabled
          </label>
        </div>
        <div className="field">
          <label>Site URL</label>
          <input
            value={state.jira.baseUrl ?? ""}
            onChange={(e) => setState({ ...state, jira: { ...state.jira, baseUrl: e.target.value } })}
            placeholder="https://your-domain.atlassian.net"
          />
        </div>
        <div className="field">
          <label>Atlassian account email</label>
          <input
            value={state.jira.authEmail ?? ""}
            onChange={(e) => setState({ ...state, jira: { ...state.jira, authEmail: e.target.value } })}
            placeholder="you@company.com"
          />
        </div>
        <div className="field">
          <label>API token {state.jira.hasToken ? "(on file — enter to replace)" : ""}</label>
          <input
            type="password"
            value={jiraToken}
            onChange={(e) => setJiraToken(e.target.value)}
            placeholder={state.jira.hasToken ? "••••••••" : "Atlassian API token"}
          />
        </div>
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={Boolean(jiraExtra.includeComments)}
              onChange={(e) =>
                setState({
                  ...state,
                  jira: {
                    ...state.jira,
                    extra: { ...jiraExtra, includeComments: e.target.checked },
                  },
                })
              }
            />{" "}
            Include comment highlights on sync (opt-in; extra egress)
          </label>
        </div>
        <div className="cta-primary-row">
          <button className="btn" disabled={busy}>
            Save Jira
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await api<{ displayName?: string }>("/api/integrations/jira/test", {
                  method: "POST",
                  body: "{}",
                });
                setMsg(`Jira OK${res.displayName ? ` — ${res.displayName}` : ""}`);
              } catch (err) {
                setMsg(err instanceof Error ? err.message : "Jira test failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Test Jira
          </button>
        </div>
        {state.jira.lastSyncAt && (
          <p className="muted">Last sync: {state.jira.lastSyncAt}</p>
        )}
      </form>

      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const next = await api<IntegrationSettingsDTO>("/api/integrations/bitbucket", {
              method: "PUT",
              body: JSON.stringify({
                enabled: state.bitbucket.enabled,
                workspaceSlug: state.bitbucket.workspaceSlug,
                authUsername: state.bitbucket.authUsername,
                token: bbToken || undefined,
              }),
            });
            setState((s) => (s ? { ...s, bitbucket: next } : s));
            setBbToken("");
            setMsg("Bitbucket settings saved");
          } catch (err) {
            setMsg(err instanceof Error ? err.message : "Save failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <h3>Bitbucket Cloud</h3>
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={state.bitbucket.enabled}
              onChange={(e) =>
                setState({
                  ...state,
                  bitbucket: { ...state.bitbucket, enabled: e.target.checked },
                })
              }
            />{" "}
            Enabled
          </label>
        </div>
        <div className="field">
          <label>Workspace slug</label>
          <input
            value={state.bitbucket.workspaceSlug ?? ""}
            onChange={(e) =>
              setState({
                ...state,
                bitbucket: { ...state.bitbucket, workspaceSlug: e.target.value },
              })
            }
            placeholder="my-workspace"
          />
        </div>
        <div className="field">
          <label>Bitbucket username</label>
          <input
            value={state.bitbucket.authUsername ?? ""}
            onChange={(e) =>
              setState({
                ...state,
                bitbucket: { ...state.bitbucket, authUsername: e.target.value },
              })
            }
            placeholder="bb-username"
          />
        </div>
        <div className="field">
          <label>App password {state.bitbucket.hasToken ? "(on file — enter to replace)" : ""}</label>
          <input
            type="password"
            value={bbToken}
            onChange={(e) => setBbToken(e.target.value)}
            placeholder={state.bitbucket.hasToken ? "••••••••" : "App password"}
          />
        </div>
        <div className="cta-primary-row">
          <button className="btn" disabled={busy}>
            Save Bitbucket
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await api<{ displayName?: string; workspaceName?: string }>(
                  "/api/integrations/bitbucket/test",
                  { method: "POST", body: "{}" },
                );
                setMsg(
                  `Bitbucket OK${res.workspaceName ? ` — ${res.workspaceName}` : ""}${
                    res.displayName ? ` (${res.displayName})` : ""
                  }`,
                );
              } catch (err) {
                setMsg(err instanceof Error ? err.message : "Bitbucket test failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Test Bitbucket
          </button>
        </div>
        {state.bitbucket.lastSyncAt && (
          <p className="muted">Last sync: {state.bitbucket.lastSyncAt}</p>
        )}
      </form>

      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const next = await api<IntegrationSettingsDTO>("/api/integrations/github", {
              method: "PUT",
              body: JSON.stringify({
                enabled: state.github.enabled,
                baseUrl: state.github.baseUrl || "https://api.github.com",
                workspaceSlug: state.github.workspaceSlug,
                token: ghToken || undefined,
                extra: {
                  ...(state.github.extra ?? {}),
                  org: state.github.workspaceSlug || state.github.extra?.org || null,
                },
              }),
            });
            setState((s) => (s ? { ...s, github: next } : s));
            setGhToken("");
            setMsg("GitHub settings saved");
          } catch (err) {
            setMsg(err instanceof Error ? err.message : "Save failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <h3>GitHub</h3>
        <p className="muted" style={{ margin: 0 }}>
          Same pattern as Bitbucket for orgs that aren’t on BB — merged PRs + reviews in the active cycle window.
        </p>
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={state.github.enabled}
              onChange={(e) =>
                setState({ ...state, github: { ...state.github, enabled: e.target.checked } })
              }
            />{" "}
            Enabled
          </label>
        </div>
        <div className="field">
          <label>Organization (optional)</label>
          <input
            value={state.github.workspaceSlug ?? ""}
            onChange={(e) =>
              setState({ ...state, github: { ...state.github, workspaceSlug: e.target.value } })
            }
            placeholder="my-org"
          />
        </div>
        <div className="field">
          <label>API base</label>
          <input
            value={state.github.baseUrl ?? "https://api.github.com"}
            onChange={(e) => setState({ ...state, github: { ...state.github, baseUrl: e.target.value } })}
            placeholder="https://api.github.com"
          />
        </div>
        <div className="field">
          <label>Personal access token {state.github.hasToken ? "(on file — enter to replace)" : ""}</label>
          <input
            type="password"
            value={ghToken}
            onChange={(e) => setGhToken(e.target.value)}
            placeholder={state.github.hasToken ? "••••••••" : "ghp_…"}
          />
        </div>
        <div className="cta-primary-row">
          <button className="btn" disabled={busy}>
            Save GitHub
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await api<{ login?: string; name?: string }>("/api/integrations/github/test", {
                  method: "POST",
                  body: "{}",
                });
                setMsg(`GitHub OK${res.login ? ` — @${res.login}` : ""}${res.name ? ` (${res.name})` : ""}`);
              } catch (err) {
                setMsg(err instanceof Error ? err.message : "GitHub test failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Test GitHub
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await api<{ count: number; results: IntegrationSyncResult[] }>(
                  "/api/integrations/sync-all",
                  { method: "POST", body: "{}" },
                );
                const imported = res.results.reduce(
                  (n, r) =>
                    n +
                    r.jira.imported +
                    r.bitbucket.imported +
                    r.github.imported +
                    (r.linear?.imported ?? 0),
                  0,
                );
                setMsg(`Synced ${res.count} linked people (${imported} new achievements)`);
                await load();
              } catch (err) {
                setMsg(err instanceof Error ? err.message : "Sync-all failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Sync all linked people
          </button>
        </div>
        {state.github.lastSyncAt && (
          <p className="muted">Last sync: {state.github.lastSyncAt}</p>
        )}
      </form>

      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const next = await api<IntegrationSettingsDTO>("/api/integrations/linear", {
              method: "PUT",
              body: JSON.stringify({
                enabled: state.linear.enabled,
                baseUrl: state.linear.baseUrl || "https://api.linear.app/graphql",
                token: linearToken || undefined,
              }),
            });
            setState((s) => (s ? { ...s, linear: next } : s));
            setLinearToken("");
            setMsg("Linear settings saved");
          } catch (err) {
            setMsg(err instanceof Error ? err.message : "Save failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <h3>Linear</h3>
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={Boolean(state.linear?.enabled)}
              onChange={(e) =>
                setState({
                  ...state,
                  linear: {
                    ...(state.linear ?? {
                      id: "linear",
                      enabled: false,
                      baseUrl: "https://api.linear.app/graphql",
                      workspaceSlug: null,
                      authEmail: null,
                      authUsername: null,
                      hasToken: false,
                      extra: {},
                      lastSyncAt: null,
                      updatedAt: "",
                    }),
                    enabled: e.target.checked,
                  },
                })
              }
            />{" "}
            Enabled
          </label>
        </div>
        <div className="field">
          <label>GraphQL endpoint</label>
          <input
            value={state.linear.baseUrl ?? "https://api.linear.app/graphql"}
            onChange={(e) => setState({ ...state, linear: { ...state.linear, baseUrl: e.target.value } })}
          />
        </div>
        <div className="field">
          <label>API key {state.linear.hasToken ? "(on file — enter to replace)" : ""}</label>
          <input
            type="password"
            value={linearToken}
            onChange={(e) => setLinearToken(e.target.value)}
            placeholder={state.linear.hasToken ? "••••••••" : "lin_api_…"}
          />
        </div>
        <div className="cta-primary-row">
          <button className="btn" disabled={busy}>
            Save Linear
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await api<{ displayName?: string }>("/api/integrations/linear/test", {
                  method: "POST",
                  body: "{}",
                });
                setMsg(`Linear OK${res.displayName ? ` — ${res.displayName}` : ""}`);
              } catch (err) {
                setMsg(err instanceof Error ? err.message : "Linear test failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Test Linear
          </button>
        </div>
        {state.linear.lastSyncAt && <p className="muted">Last sync: {state.linear.lastSyncAt}</p>}
      </form>

      <p className="muted">
        Link each direct’s Jira / Bitbucket / GitHub / Linear account on their person page, then sync there or use Sync
        all above. Sync uses the active review cycle window.
      </p>
      {msg && <p className="muted">{msg}</p>}
    </div>
  );
}
