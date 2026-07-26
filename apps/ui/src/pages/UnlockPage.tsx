import { useState } from "react";
import type { WorkspaceStatus } from "@prm/shared";
import { api } from "../lib/api";

type SetupMode = "empty" | "demo";

export function UnlockPage({
  status,
  onUnlocked,
}: {
  status: WorkspaceStatus;
  onUnlocked: (token: string) => Promise<void>;
}) {
  const [setupMode, setSetupMode] = useState<SetupMode>("empty");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("My team");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectMode(mode: SetupMode) {
    setSetupMode(mode);
    setError(null);
    if (mode === "demo" && !password) setPassword("workbench");
    if (mode === "empty" && password === "workbench") setPassword("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!status.initialized) {
        if (password.trim().length < 4) {
          setError("Choose a password with at least 4 characters.");
          setBusy(false);
          return;
        }
        const res = await api<{ token: string }>("/api/workspace/init", {
          method: "POST",
          body: JSON.stringify({
            name: name.trim() || "My team",
            password,
            seed: setupMode === "demo",
          }),
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

  const primaryLabel = status.initialized
    ? "Unlock workbench"
    : setupMode === "demo"
      ? "Create & seed demo team"
      : "Create empty workspace";

  return (
    <div className="unlock-screen">
      <form className="panel unlock-card" onSubmit={submit}>
        <h1>{status.initialized ? "Unlock workbench" : "Create workbench"}</h1>
        <p className="page-job" style={{ marginBottom: "1rem" }}>
          {status.initialized
            ? "Enter your password to open the encrypted vault and continue reviews."
            : "Local encrypted vault for solo EM reviews. Self/peer input arrives via import bundles — ICs do not log in."}
        </p>

        {!status.initialized && (
          <div className="choice-grid" role="radiogroup" aria-label="Workspace setup">
            <button
              type="button"
              className={`choice-card${setupMode === "empty" ? " on" : ""}`}
              role="radio"
              aria-checked={setupMode === "empty"}
              onClick={() => selectMode("empty")}
            >
              <strong>Empty workspace</strong>
              <span>Start clean. Add your people, roles, and cycle when you are ready.</span>
            </button>
            <button
              type="button"
              className={`choice-card${setupMode === "demo" ? " on" : ""}`}
              role="radio"
              aria-checked={setupMode === "demo"}
              onClick={() => selectMode("demo")}
            >
              <strong>Demo team</strong>
              <span>Seed an 8-person sample org (password default: workbench).</span>
            </button>
          </div>
        )}

        {status.encryptedAtRest ? (
          <p>Vault is currently sealed on disk.</p>
        ) : !status.initialized ? (
          <p className="muted">
            {setupMode === "demo"
              ? "Demo data is for exploring the product. You can lock and re-create later by deleting the local data folder."
              : "No sample people or reviews. You will add the roster from Team."}
          </p>
        ) : null}

        {!status.initialized && (
          <div className="field">
            <label htmlFor="ws-name">Workspace name</label>
            <input
              id="ws-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Platform Engineering"
              autoComplete="organization"
            />
          </div>
        )}
        <div className="field">
          <label htmlFor="ws-password">
            Password
            {!status.initialized && setupMode === "demo" ? " (demo default: workbench)" : ""}
          </label>
          <input
            id="ws-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            autoComplete={status.initialized ? "current-password" : "new-password"}
            placeholder={setupMode === "demo" && !status.initialized ? "workbench" : "Choose a password"}
          />
        </div>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        <button className="btn" disabled={busy}>
          {busy ? "…" : primaryLabel}
        </button>
      </form>
    </div>
  );
}
