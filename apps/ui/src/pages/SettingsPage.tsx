import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useTheme } from "../hooks/useTheme";
import { NextStep, PageHeader } from "../components/PageChrome";

type AiSettings = {
  enabled: boolean;
  provider: string;
  modelDigest: string | null;
  modelDraft: string | null;
  localOnly: boolean;
  ollamaBaseUrl: string | null;
  privateNotesEgress: boolean;
  meetingSummaryEgress: boolean;
  documentExtractEgress: boolean;
  hasApiKey: boolean;
};

export function SettingsPage() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { theme, setTheme } = useTheme();

  async function load() {
    try {
      setSettings(await api<AiSettings>("/api/ai/settings"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (error && !settings) {
    return (
      <div className="stack">
        <PageHeader title="Settings" job="Configure AI co-pilot keys and private-tier egress." />
        <NextStep
          tone="warn"
          label="Could not load settings"
          detail={error}
          action={<button className="btn" type="button" onClick={() => void load()}>Retry</button>}
        />
      </div>
    );
  }

  if (!settings) return <p>Loading…</p>;

  const needsKey = settings.enabled && !settings.localOnly && settings.provider !== "ollama" && !settings.hasApiKey && !apiKey;

  return (
    <div className="stack">
      <PageHeader
        title="Settings"
        job="Appearance, AI co-pilot keys, and private-tier egress. Keys stay encrypted with the workspace secret."
        primary={<button className="btn" form="ai-settings-form" type="submit">Save AI settings</button>}
        secondary={
          <button
            type="button"
            className="btn secondary"
            onClick={async () => {
              const res = await api<{ ok: boolean; error?: string; model?: string }>("/api/ai/test", {
                method: "POST",
                body: "{}",
              });
              setMsg(res.ok ? `Connection OK (${res.model})` : `Failed: ${res.error}`);
            }}
          >
            Test connection
          </button>
        }
      />

      <div className="panel">
        <h2>Appearance</h2>
        <p className="muted">Theme preference is stored in this browser and defaults to dark.</p>
        <div className="field">
          <label htmlFor="theme-select">Color theme</label>
          <select
            id="theme-select"
            value={theme}
            onChange={(e) => setTheme(e.target.value === "light" ? "light" : "dark")}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>
      </div>

      {needsKey ? (
        <NextStep
          tone="warn"
          label="Add an API key to use cloud drafting"
          detail="AI is enabled but no key is on file. Paste a key below, Save, then Test connection — or switch to Ollama / local-only."
          action={<button className="btn" form="ai-settings-form" type="submit">Save AI settings</button>}
        />
      ) : settings.enabled ? (
        <NextStep
          tone="ok"
          label="AI ready for writing desk"
          detail="Digest and section drafts pull from dossier + imports. Private notes stay off cloud unless you opt in below."
          action={
            <button
              type="button"
              className="btn"
              onClick={async () => {
                const res = await api<{ ok: boolean; error?: string; model?: string }>("/api/ai/test", {
                  method: "POST",
                  body: "{}",
                });
                setMsg(res.ok ? `Connection OK (${res.model})` : `Failed: ${res.error}`);
              }}
            >
              Test connection
            </button>
          }
        />
      ) : (
        <NextStep
          tone="brand"
          label="Enable AI when you want grounded drafts"
          detail="Without AI, writing desk still works — you draft from packet evidence manually."
          action={<button className="btn" form="ai-settings-form" type="submit">Save AI settings</button>}
        />
      )}

      <form
        id="ai-settings-form"
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          await api("/api/ai/settings", {
            method: "PUT",
            body: JSON.stringify({
              ...settings,
              apiKey: apiKey ? apiKey : undefined,
            }),
          });
          setApiKey("");
          setMsg("Saved");
          await load();
        }}
      >
        <h2>AI</h2>
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
            />{" "}
            Enable AI features
          </label>
        </div>
        <div className="field">
          <label>Provider</label>
          <select
            value={settings.provider}
            onChange={(e) => setSettings({ ...settings, provider: e.target.value })}
          >
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
            <option value="ollama">Ollama</option>
          </select>
        </div>
        <div className="field">
          <label>API key {settings.hasApiKey ? "(on file — enter to replace)" : ""}</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings.hasApiKey ? "••••••••" : "sk-…"}
          />
        </div>
        <div className="field">
          <label>Digest model</label>
          <input
            value={settings.modelDigest ?? ""}
            onChange={(e) => setSettings({ ...settings, modelDigest: e.target.value })}
          />
        </div>
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={settings.localOnly}
              onChange={(e) => setSettings({ ...settings, localOnly: e.target.checked })}
            />{" "}
            Local-only (block cloud)
          </label>
        </div>
        <h3>Private-tier cloud egress</h3>
        <p className="muted">Default deny. Enabling sends that class to the cloud provider under your API key contract.</p>
        {(
          [
            ["privateNotesEgress", "Private notes"],
            ["meetingSummaryEgress", "Meeting summaries"],
            ["documentExtractEgress", "Document extracts"],
          ] as const
        ).map(([key, label]) => (
          <div className="field" key={key}>
            <label>
              <input
                type="checkbox"
                checked={settings[key]}
                onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })}
              />{" "}
              {label}
            </label>
          </div>
        ))}
        <div className="cta-primary-row">
          <button className="btn">Save AI settings</button>
          <button
            type="button"
            className="btn secondary"
            onClick={async () => {
              const res = await api<{ ok: boolean; error?: string; model?: string }>("/api/ai/test", {
                method: "POST",
                body: "{}",
              });
              setMsg(res.ok ? `Connection OK (${res.model})` : `Failed: ${res.error}`);
            }}
          >
            Test connection
          </button>
        </div>
        {msg && <p className="muted">{msg}</p>}
      </form>
    </div>
  );
}
