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

  const primaryLabel = status.initialized ? "Unlock workbench" : "Create & seed demo team";

  return (
    <div className="unlock-screen">
      <form className="panel unlock-card" onSubmit={submit}>
        <h1>{status.initialized ? "Unlock workbench" : "Create workbench"}</h1>
        <p className="page-job" style={{ marginBottom: "1rem" }}>
          {status.initialized
            ? "Enter your password to open the encrypted vault and continue reviews."
            : "Create a local encrypted vault, seed a demo team, then assign roles and open a cycle."}
        </p>
        <p>
          Solo EM performance review manager. Self/peer input arrives via import bundles — ICs do not log in.
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
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </div>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        <button className="btn" disabled={busy}>
          {busy ? "…" : primaryLabel}
        </button>
      </form>
    </div>
  );
}
