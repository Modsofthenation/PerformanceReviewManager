import { useState } from "react";
import type { WorkspaceStatus } from "@prm/shared";
import { api } from "../lib/api";

export function UnlockPage({
  status,
  onUnlocked,
}: {
  status: WorkspaceStatus;
  onUnlocked: (token: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("workbench");
  const [name, setName] = useState("Platform Engineering");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!status.initialized) {
        const res = await api<{ token: string }>("/api/workspace/init", {
          method: "POST",
          body: JSON.stringify({ name, password, seed: true }),
        });
        await onUnlocked(res.token);
      } else {
        const res = await api<{ token: string }>("/api/workspace/unlock", {
          method: "POST",
          body: JSON.stringify({ password }),
        });
        await onUnlocked(res.token);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="unlock-screen">
      <form className="panel unlock-card" onSubmit={submit}>
        <h1>{status.initialized ? "Unlock workbench" : "Create workbench"}</h1>
        <p>
          Solo EM performance review manager. Your password unlocks an encrypted vault
          (SQLite + files). Self/peer input arrives via import bundles — ICs do not log in.
          {status.encryptedAtRest ? " Vault is currently sealed on disk." : ""}
        </p>
        {!status.initialized && (
          <div className="field">
            <label>Workspace name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label>Password {status.initialized ? "" : "(default seed: workbench)"}</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        <button className="btn" disabled={busy}>
          {busy ? "…" : status.initialized ? "Unlock" : "Create & seed demo team"}
        </button>
      </form>
    </div>
  );
}
