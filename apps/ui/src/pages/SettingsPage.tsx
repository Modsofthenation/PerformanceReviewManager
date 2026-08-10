import { useEffect, useState } from "react";
import type { AuditVerifyResult } from "@prm/shared";
import { api } from "../lib/api";
import { useTheme } from "../hooks/useTheme";
import { ACCENTS, type Accent, type ColorMode } from "../lib/theme";
import { NextStep, PageHeader, Section } from "../components/PageChrome";
import { PageSectionsLayout, type SectionNavItem } from "../components/PageSectionsLayout";
import { IntegrationsPanel } from "../components/IntegrationsPanel";
import { RetentionPanel } from "../components/RetentionPanel";

const SETTINGS_SECTIONS: SectionNavItem[] = [
  { id: "settings-appearance", label: "Appearance" },
  { id: "settings-retention", label: "Retention" },
  { id: "settings-integrations", label: "Integrations" },
  { id: "settings-audit", label: "Audit" },
  { id: "settings-backup", label: "Backup" },
  { id: "settings-ai", label: "AI" },
  { id: "settings-danger", label: "Danger zone" },
  { id: "settings-desktop", label: "Desktop" },
];

type AiSettings = {
  enabled: boolean;
  provider: string;
  modelDigest: string | null;
  modelDraft: string | null;
  localOnly: boolean;
  ollamaBaseUrl: string | null;
  cursorBaseUrl?: string | null;
  privateNotesEgress: boolean;
  meetingSummaryEgress: boolean;
  documentExtractEgress: boolean;
  hasApiKey: boolean;
  apiKeyFromEnv?: boolean;
};

export function SettingsPage({
  onWorkspaceDestroyed,
}: {
  onWorkspaceDestroyed: () => Promise<void>;
}) {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [msgTone, setMsgTone] = useState<"ok" | "danger" | "muted">("muted");
  const [testBusy, setTestBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditVerifyResult | null>(null);
  const [auditBusy, setAuditBusy] = useState(false);
  const [backups, setBackups] = useState<
    Array<{ filename: string; byteSize: number; modifiedAt: string }>
  >([]);
  const [backupBusy, setBackupBusy] = useState(false);
  const [destroyOpen, setDestroyOpen] = useState(false);
  const [destroyPassword, setDestroyPassword] = useState("");
  const [destroyConfirm, setDestroyConfirm] = useState("");
  const [destroyBusy, setDestroyBusy] = useState(false);
  const [destroyError, setDestroyError] = useState<string | null>(null);
  const { colorMode, setColorMode, accent, setAccent, resolved } = useTheme();

  async function load() {
    try {
      setSettings(await api<AiSettings>("/api/ai/settings"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    }
  }

  async function loadBackups() {
    try {
      const res = await api<{ backups: Array<{ filename: string; byteSize: number; modifiedAt: string }> }>(
        "/api/workspace/backups",
      );
      setBackups(res.backups);
    } catch {
      setBackups([]);
    }
  }

  useEffect(() => {
    load();
    loadBackups();
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

  const needsKey =
    settings.enabled &&
    !settings.localOnly &&
    settings.provider !== "ollama" &&
    !settings.hasApiKey &&
    !apiKey;

  async function testAiConnection() {
    if (!settings) return;
    setTestBusy(true);
    setMsg("Saving settings, then testing…");
    setMsgTone("muted");
    try {
      await api("/api/ai/settings", {
        method: "PUT",
        body: JSON.stringify({
          ...settings,
          ollamaBaseUrl:
            settings.provider === "cursor"
              ? "http://127.0.0.1:11434"
              : settings.ollamaBaseUrl,
          apiKey: apiKey ? apiKey : undefined,
        }),
      });
      setApiKey("");
      const res = await api<{
        ok: boolean;
        error?: string;
        model?: string;
        provider?: string;
        baseUrlTried?: string | null;
        sample?: string;
      }>("/api/ai/test", {
        method: "POST",
        body: "{}",
      });
      if (res.ok) {
        setMsgTone("ok");
        setMsg(
          `Connection OK (${res.model ?? "unknown"})${
            res.sample ? ` — ${res.sample}` : ""
          }${res.baseUrlTried ? ` via ${res.baseUrlTried}` : ""}`,
        );
      } else {
        setMsgTone("danger");
        setMsg(res.error ?? "Test failed");
      }
      await load();
    } catch (err) {
      setMsgTone("danger");
      setMsg(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTestBusy(false);
    }
  }

  return (
    <div className="stack">
      <PageHeader
        title="Settings"
        job="Appearance, AI, integrations, and private-tier egress. Keys stay encrypted with the workspace secret."
        primary={<button className="btn" form="ai-settings-form" type="submit">Save AI settings</button>}
        secondary={
          <button
            type="button"
            className="btn secondary"
            disabled={testBusy}
            onClick={() => void testAiConnection()}
          >
            {testBusy ? "Testing…" : "Test AI connection"}
          </button>
        }
      />

      {msg && (
        <p
          role="status"
          style={{
            margin: 0,
            color:
              msgTone === "ok"
                ? "var(--ok)"
                : msgTone === "danger"
                  ? "var(--danger)"
                  : "var(--muted)",
          }}
        >
          {msg}
        </p>
      )}

      <PageSectionsLayout sections={SETTINGS_SECTIONS}>
      <Section
        id="settings-appearance"
        title="Appearance"
        when="Change color mode or accent whenever the UI feels too bright, too dark, or hard to scan."
        how={`Pick a mode and accent below. Eight accents (Teal, Ocean, Forest, Slate, Coral, Amber, Magenta, Citrus) × dark/light. Preferences stay in this browser; System follows your OS (${resolved} right now).`}
      >
        <div className="field">
          <label htmlFor="theme-select">Color mode</label>
          <select
            id="theme-select"
            value={colorMode}
            onChange={(e) => setColorMode(e.target.value as ColorMode)}
          >
            <option value="system">System</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>
        <div className="field">
          <label>Accent</label>
          <div className="accent-swatches" role="radiogroup" aria-label="Accent color">
            {ACCENTS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`accent-swatch${accent === item.id ? " on" : ""}`}
                role="radio"
                aria-checked={accent === item.id}
                onClick={() => setAccent(item.id as Accent)}
              >
                <span className="accent-dot" style={{ ["--swatch" as string]: item.swatch }} />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <RetentionPanel />

      <IntegrationsPanel />

      <Section
        id="settings-audit"
        title="Activity audit"
        when="Use when you want to check that the local activity log has not been tampered with on this machine."
        how="Verify recomputes the hash chain; export downloads a pack signed with the unlocked workspace key."
        action={
          <>
            <button
              type="button"
              className="btn"
              disabled={auditBusy}
              onClick={async () => {
                setAuditBusy(true);
                try {
                  const result = await api<AuditVerifyResult>("/api/activity/verify");
                  setAudit(result);
                  setMsg(result.ok ? `Chain OK (${result.count} events)` : `Chain broken: ${result.error}`);
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : "Verify failed");
                } finally {
                  setAuditBusy(false);
                }
              }}
            >
              Verify audit chain
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={auditBusy}
              onClick={async () => {
                setAuditBusy(true);
                try {
                  const pack = await api<Record<string, unknown>>("/api/activity/export", {
                    method: "POST",
                    body: "{}",
                  });
                  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `prm-audit-${new Date().toISOString().slice(0, 10)}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                  const v = pack.verification as AuditVerifyResult | undefined;
                  if (v) setAudit(v);
                  setMsg("Audit pack downloaded");
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : "Export failed");
                } finally {
                  setAuditBusy(false);
                }
              }}
            >
              Export signed audit pack
            </button>
          </>
        }
      >
        <p className="muted" style={{ margin: 0 }}>
          Append-only SQLite triggers keep a local chain. Tamper-evident for this machine — not external legal
          custody (anyone with the vault password can re-sign).
        </p>
        {audit && (
          <p className="muted" style={{ marginBottom: 0 }}>
            {audit.ok ? "Intact" : "Broken"} · {audit.count} events
            {audit.tipHash ? ` · tip ${audit.tipHash.slice(0, 12)}…` : ""}
            {audit.error ? ` · ${audit.error}` : ""}
          </p>
        )}
      </Section>

      <Section
        id="settings-backup"
        title="Backup & restore"
        when="Snapshot before a risky restore, purge, or workspace change; restore only when you intend to replace the live DB."
        how="Create an encrypted snapshot under data/backups, then restore a listed file if you need to roll back."
        action={
          <button
            type="button"
            className="btn"
            disabled={backupBusy}
            onClick={async () => {
              setBackupBusy(true);
              try {
                await api("/api/workspace/backup", {
                  method: "POST",
                  body: JSON.stringify({ label: "manual" }),
                });
                setMsg("Backup created");
                await loadBackups();
              } catch (e) {
                setMsg(e instanceof Error ? e.message : "Backup failed");
              } finally {
                setBackupBusy(false);
              }
            }}
          >
            Create encrypted backup
          </button>
        }
      >
        {backups.length === 0 ? (
          <p className="muted">No backups yet.</p>
        ) : (
          <ul>
            {backups.map((b) => (
              <li key={b.filename} className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                <span>
                  <strong>{b.filename}</strong>{" "}
                  <span className="muted">
                    · {(b.byteSize / 1024).toFixed(1)} KB · {b.modifiedAt.slice(0, 19)}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={backupBusy}
                  onClick={async () => {
                    const ok = window.confirm(
                      `Restore ${b.filename}? This replaces the live database. Continue?`,
                    );
                    if (!ok) return;
                    setBackupBusy(true);
                    try {
                      await api("/api/workspace/restore", {
                        method: "POST",
                        body: JSON.stringify({ filename: b.filename, confirm: true }),
                      });
                      setMsg(`Restored ${b.filename}`);
                      await loadBackups();
                    } catch (e) {
                      setMsg(e instanceof Error ? e.message : "Restore failed");
                    } finally {
                      setBackupBusy(false);
                    }
                  }}
                >
                  Restore this backup
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {needsKey ? (
        <NextStep
          tone="warn"
          label="Add an API key to use cloud drafting"
          detail="AI is enabled but no key is on file. Paste a provider key below, Save, then Test — or switch to Ollama / local-only."
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
              disabled={testBusy}
              onClick={() => void testAiConnection()}
            >
              {testBusy ? "Testing…" : "Test AI connection"}
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

      <Section
        id="settings-ai"
        title="AI"
        when="Enable when you want grounded digests and section drafts on the writing desk; leave off to draft from packet evidence only."
        how="Choose a provider, paste a key if needed, set models and private-tier egress, then save and test the connection."
        action={<button className="btn" form="ai-settings-form" type="submit">Save AI settings</button>}
      >
      <form
        id="ai-settings-form"
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          await api("/api/ai/settings", {
            method: "PUT",
            body: JSON.stringify({
              ...settings,
              // Avoid legacy cursor+gateway mis-detection when choosing Cloud Agents.
              ollamaBaseUrl:
                settings.provider === "cursor"
                  ? "http://127.0.0.1:11434"
                  : settings.ollamaBaseUrl,
              apiKey: apiKey ? apiKey : undefined,
            }),
          });
          setApiKey("");
          setMsg("Saved");
          setMsgTone("ok");
          await load();
        }}
      >
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
            onChange={(e) => {
              const provider = e.target.value;
              setSettings({
                ...settings,
                provider,
                ...(provider === "openai_compatible"
                  ? {
                      modelDigest: settings.modelDigest || "gpt-4o-mini",
                      modelDraft: settings.modelDraft || "gpt-4o-mini",
                      ollamaBaseUrl:
                        settings.ollamaBaseUrl && settings.ollamaBaseUrl !== "http://127.0.0.1:11434"
                          ? settings.ollamaBaseUrl
                          : settings.cursorBaseUrl || "",
                    }
                  : provider === "cursor"
                    ? {
                        modelDigest: settings.modelDigest || "",
                        modelDraft: settings.modelDraft || "",
                      }
                    : provider === "ollama"
                      ? {
                          ollamaBaseUrl: settings.ollamaBaseUrl || "http://127.0.0.1:11434",
                        }
                      : {}),
              });
            }}
          >
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
            <option value="cursor">Cursor Cloud Agents</option>
            <option value="openai_compatible">OpenAI-compatible (custom URL)</option>
            <option value="ollama">Ollama</option>
          </select>
        </div>
        {settings.provider === "cursor" && (
          <p className="muted">
            Uses your Cursor dashboard API key (<code>crsr_…</code>) with the{" "}
            <a href="https://cursor.com/docs/cloud-agent/api/endpoints" target="_blank" rel="noreferrer">
              Cloud Agents API
            </a>
            . Digests and drafts launch a short-lived <strong>no-repo</strong> cloud agent (slower than
            Anthropic/OpenAI chat). Get a key at{" "}
            <a href="https://cursor.com/dashboard/api" target="_blank" rel="noreferrer">
              cursor.com/dashboard/api
            </a>
            . Optional env: <code>CURSOR_API_KEY</code>. Leave model fields blank to use your Cursor default.
          </p>
        )}
        {settings.provider === "openai_compatible" && (
          <p className="muted">
            For a local or third-party gateway that speaks OpenAI <code>/v1/chat/completions</code>. This is{" "}
            <em>not</em> Cursor Cloud Agents — use the Cursor Cloud Agents provider for <code>crsr_…</code>{" "}
            keys. Optional env: <code>CURSOR_API_BASE_URL</code> / <code>CURSOR_API_KEY</code>.
          </p>
        )}
        <div className="field">
          <label>
            API key{" "}
            {settings.hasApiKey
              ? settings.apiKeyFromEnv
                ? "(from CURSOR_API_KEY env)"
                : "(on file — enter to replace)"
              : ""}
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              settings.hasApiKey
                ? "••••••••"
                : settings.provider === "cursor"
                  ? "crsr_…"
                  : settings.provider === "openai_compatible"
                    ? "gateway key…"
                    : "sk-…"
            }
          />
        </div>
        {(settings.provider === "ollama" || settings.provider === "openai_compatible") && (
          <div className="field">
            <label>
              {settings.provider === "openai_compatible" ? "OpenAI-compatible base URL" : "Ollama base URL"}
            </label>
            <input
              value={settings.ollamaBaseUrl ?? ""}
              onChange={(e) => setSettings({ ...settings, ollamaBaseUrl: e.target.value })}
              placeholder={
                settings.provider === "openai_compatible"
                  ? "https://your-gateway.example/v1"
                  : "http://127.0.0.1:11434"
              }
              required={settings.provider === "openai_compatible"}
            />
          </div>
        )}
        <div className="field">
          <label>Digest model</label>
          <input
            value={settings.modelDigest ?? ""}
            onChange={(e) => setSettings({ ...settings, modelDigest: e.target.value })}
            placeholder={
              settings.provider === "cursor"
                ? "(account default)"
                : settings.provider === "openai_compatible"
                  ? "gpt-4o-mini"
                  : undefined
            }
          />
        </div>
        <div className="field">
          <label>Draft model</label>
          <input
            value={settings.modelDraft ?? ""}
            onChange={(e) => setSettings({ ...settings, modelDraft: e.target.value })}
            placeholder={
              settings.provider === "cursor"
                ? "(account default)"
                : settings.provider === "openai_compatible"
                  ? "gpt-4o-mini"
                  : undefined
            }
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
        <p className="muted">
          Default deny on cloud providers. Local-only / Ollama ignore these and may still use local context.
          Unticked classes are held back from digests, drafts, and chat.
        </p>
        {(
          [
            ["privateNotesEgress", "Private notes & em_only feedback/docs"],
            ["meetingSummaryEgress", "Meeting / 1:1 / transcript-like documents"],
            ["documentExtractEgress", "Text document body extracts"],
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
            disabled={testBusy}
            onClick={() => void testAiConnection()}
          >
            {testBusy ? "Testing…" : "Test AI connection"}
          </button>
        </div>
        {msg && (
          <p
            role="status"
            style={{
              color:
                msgTone === "ok"
                  ? "var(--ok)"
                  : msgTone === "danger"
                    ? "var(--danger)"
                    : undefined,
            }}
          >
            {msg}
          </p>
        )}
      </form>
      </Section>

      <Section
        id="settings-danger"
        title="Danger zone"
        when="Only when you intend to wipe this local workspace and start over (empty or demo)."
        how="Open the form, enter the workspace password, type DELETE, then erase permanently — legal hold must be off."
        action={
          !destroyOpen ? (
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                setDestroyOpen(true);
                setDestroyError(null);
                setDestroyPassword("");
                setDestroyConfirm("");
              }}
            >
              Delete workspace…
            </button>
          ) : undefined
        }
      >
        <p className="muted" style={{ margin: 0 }}>
          Permanently erase this local workspace (database, vault, uploads, and backups), then create a
          new empty or demo workspace. This cannot be undone.
        </p>
        {destroyOpen ? (
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setDestroyBusy(true);
              setDestroyError(null);
              try {
                if (destroyConfirm !== "DELETE") {
                  setDestroyError('Type DELETE to confirm.');
                  setDestroyBusy(false);
                  return;
                }
                await api("/api/workspace/destroy", {
                  method: "POST",
                  body: JSON.stringify({ password: destroyPassword, confirm: "DELETE" }),
                });
                await onWorkspaceDestroyed();
              } catch (err) {
                setDestroyError(err instanceof Error ? err.message : "Delete failed");
              } finally {
                setDestroyBusy(false);
              }
            }}
          >
            <div className="field">
              <label htmlFor="destroy-password">Workspace password</label>
              <input
                id="destroy-password"
                type="password"
                value={destroyPassword}
                onChange={(e) => setDestroyPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="destroy-confirm">Type DELETE to confirm</label>
              <input
                id="destroy-confirm"
                value={destroyConfirm}
                onChange={(e) => setDestroyConfirm(e.target.value)}
                autoComplete="off"
                placeholder="DELETE"
                required
              />
            </div>
            {destroyError && <p style={{ color: "var(--danger)" }}>{destroyError}</p>}
            <div className="cta-primary-row">
              <button className="btn danger" type="submit" disabled={destroyBusy}>
                {destroyBusy ? "…" : "Erase workspace permanently"}
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={destroyBusy}
                onClick={() => {
                  setDestroyOpen(false);
                  setDestroyError(null);
                }}
              >
                Cancel delete
              </button>
            </div>
          </form>
        ) : null}
      </Section>

      <Section
        id="settings-desktop"
        title="Desktop updates"
        when="Use on packaged desktop builds when you want to know if a newer installer is available."
        how="Compares your installed version to the latest GitHub Release tag. This is a manual check only — signed silent auto-update needs Tauri updater keys in CI."
        action={
          <button
            type="button"
            className="btn secondary"
            onClick={async () => {
              try {
                let localVersion = "0.1.0-alpha.1";
                const invoke = (window as unknown as {
                  __TAURI__?: { core?: { invoke?: (cmd: string) => Promise<string> } };
                }).__TAURI__?.core?.invoke;
                if (invoke) {
                  try {
                    localVersion = await invoke("get_app_version");
                  } catch {
                    /* browser / unsigned */
                  }
                }
                const res = await fetch(
                  "https://api.github.com/repos/Modsofthenation/PerformanceReviewManager/releases/latest",
                  { headers: { Accept: "application/vnd.github+json" } },
                );
                if (res.status === 404) {
                  setMsg(
                    `Installed app version ${localVersion}. No public GitHub Release yet — maintainers can publish one via Actions → Release, or build unsigned installers via Actions → Desktop Installers.`,
                  );
                  return;
                }
                if (!res.ok) {
                  setMsg(
                    `Could not reach GitHub Releases (${res.status}). Try again later, or download unsigned installers from Actions → Desktop Installers / Release.`,
                  );
                  return;
                }
                const json = (await res.json()) as {
                  tag_name?: string;
                  html_url?: string;
                  name?: string;
                  prerelease?: boolean;
                };
                const tag = json.tag_name ?? json.name ?? "unknown";
                const pre = json.prerelease ? " (pre-release)" : "";
                setMsg(
                  `Installed app version ${localVersion}. Latest GitHub release: ${tag}${pre}. ${json.html_url ?? ""} — download the installer for your OS; installs are not auto-applied.`,
                );
              } catch (e) {
                setMsg(
                  e instanceof Error
                    ? `${e.message} — use Actions artifacts desktop-windows-x86_64 / desktop-linux-x86_64 / desktop-macos-aarch64`
                    : "Update check failed",
                );
              }
            }}
          >
            Check for desktop updates
          </button>
        }
      >
        <p className="muted" style={{ margin: 0 }}>
          Packaged builds serve the UI from the local API (same-origin) to avoid WebView “Failed to fetch”.
          Releases are unsigned until code signing lands — verify checksums yourself.
        </p>
      </Section>
      </PageSectionsLayout>
    </div>
  );
}
