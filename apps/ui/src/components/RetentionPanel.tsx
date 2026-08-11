import { useEffect, useState } from "react";
import type { WorkspaceSettingsDTO } from "@prm/shared";
import { api } from "../lib/api";
import { Section } from "./PageChrome";
import { AppSelect } from "./AppSelect";

export function RetentionPanel() {
  const [settings, setSettings] = useState<WorkspaceSettingsDTO | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setSettings(await api<WorkspaceSettingsDTO>("/api/workspace/settings"));
  }

  useEffect(() => {
    load().catch((e) => setMsg(e instanceof Error ? e.message : "Failed to load retention"));
  }, []);

  if (!settings) return <p className="muted">Loading retention…</p>;

  return (
    <Section
      id="settings-retention"
      title="Retention & legal hold"
      when="Set policy when you start keeping multiple cycles, before a purge, or when legal hold is required."
      how="Choose how many cycles to keep, toggle legal hold if needed, save, then purge older closed cycles only when hold is off."
      action={
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const next = await api<WorkspaceSettingsDTO>("/api/workspace/settings", {
                method: "PUT",
                body: JSON.stringify({
                  retention: settings.retention,
                  legalHold: settings.legalHold,
                }),
              });
              setSettings({ ...settings, ...next });
              setMsg("Retention settings saved");
              await load();
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Save failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          Save retention settings
        </button>
      }
    >
      <p className="muted" style={{ marginTop: 0 }}>
        Default policy keeps the <strong>current + previous</strong> cycle. Purge marks cycles as purged
        (audit trail kept) — it does not shred the vault.
      </p>
      <div className="field">
        <label htmlFor="retention-select">Retention policy</label>
        <AppSelect
          id="retention-select"
          value={settings.retention}
          onChange={(v) =>
            setSettings({
              ...settings,
              retention: v as WorkspaceSettingsDTO["retention"],
            })
          }
          isSearchable={false}
          options={[
            { value: "current_plus_previous", label: "Current + previous cycle" },
            { value: "current_only", label: "Current cycle only" },
            { value: "keep_all", label: "Keep all cycles" },
          ]}
        />
      </div>
      <div className="field">
        <label>
          <input
            type="checkbox"
            checked={settings.legalHold}
            onChange={(e) => setSettings({ ...settings, legalHold: e.target.checked })}
          />{" "}
          Legal hold — block purge and destructive retention actions
        </label>
      </div>
      <div className="cta-primary-row">
        <button
          type="button"
          className="btn secondary"
          disabled={busy || settings.legalHold || !(settings.purgeEligible?.length)}
          onClick={async () => {
            if (
              !window.confirm(
                `Purge ${settings.purgeEligible?.length ?? 0} older closed cycle(s)? Legal hold must stay off.`,
              )
            ) {
              return;
            }
            setBusy(true);
            try {
              const res = await api<{ purged: string[] }>("/api/workspace/purge-old-cycles", {
                method: "POST",
                body: "{}",
              });
              setMsg(`Purged ${res.purged.length} cycle(s)`);
              await load();
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Purge failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          Purge eligible cycles
          {settings.purgeEligible?.length ? ` (${settings.purgeEligible.length})` : ""}
        </button>
      </div>
      {settings.legalHold ? (
        <p className="muted">Legal hold is on — purge is blocked.</p>
      ) : settings.purgeEligible?.length ? (
        <ul>
          {settings.purgeEligible.map((c) => (
            <li key={c.id}>
              {c.name} <span className="muted">· ended {c.windowEnd.slice(0, 10)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No cycles eligible for purge under the current policy.</p>
      )}
      {msg && <p className="muted">{msg}</p>}
    </Section>
  );
}
