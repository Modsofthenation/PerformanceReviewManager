import { useEffect, useState } from "react";
import type { IntegrationSettingsDTO, IntegrationSyncResult } from "@prm/shared";
import { api } from "../lib/api";

type IntegrationsState = {
  jira: IntegrationSettingsDTO;
  bitbucket: IntegrationSettingsDTO;
};

export function IntegrationsPanel() {
  const [state, setState] = useState<IntegrationsState | null>(null);
  const [jiraToken, setJiraToken] = useState("");
  const [bbToken, setBbToken] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setState(await api<IntegrationsState>("/api/integrations"));
  }

  useEffect(() => {
    load().catch((e) => setMsg(e instanceof Error ? e.message : "Failed to load integrations"));
  }, []);

  if (!state) return <p className="muted">Loading integrations…</p>;

  return (
    <div className="panel stack">
      <h2>Integrations</h2>
      <p className="muted">
        Pull Jira issues and merged Bitbucket PRs into each person’s dossier as achievements (citable
        on the writing desk). Tokens are encrypted with the workspace secret — same pattern as AI keys.
        Sync is explicit egress to Atlassian cloud.
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
                  (n, r) => n + r.jira.imported + r.bitbucket.imported,
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
        {state.bitbucket.lastSyncAt && (
          <p className="muted">Last sync: {state.bitbucket.lastSyncAt}</p>
        )}
      </form>

      <p className="muted">
        Link each direct’s Jira / Bitbucket account on their person page, then sync there or use Sync
        all above.
      </p>
      {msg && <p className="muted">{msg}</p>}
    </div>
  );
}
