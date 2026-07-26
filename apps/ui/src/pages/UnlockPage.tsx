import { useState } from "react";
import type { WorkspaceStatus } from "@prm/shared";
import { api } from "../lib/api";

type SetupMode = "empty" | "demo";

export function UnlockPage({
  status,
  onUnlocked,
  onDestroyed,
}: {
  status: WorkspaceStatus;
  onUnlocked: (token: string) => Promise<void>;
  onDestroyed: () => Promise<void>;
}) {
  const [setupMode, setSetupMode] = useState<SetupMode>("empty");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("My team");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [erasePassword, setErasePassword] = useState("");
  const [eraseConfirm, setEraseConfirm] = useState("");

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

  async function eraseWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (eraseConfirm !== "DELETE") {
        setError('Type DELETE to confirm erasing this workspace.');
        setBusy(false);
        return;
      }
      await api("/api/workspace/destroy", {
        method: "POST",
        body: JSON.stringify({ password: erasePassword, confirm: "DELETE" }),
      });
      setEraseOpen(false);
      setErasePassword("");
      setEraseConfirm("");
      setPassword("");
      await onDestroyed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erase failed");
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
              ? "Demo data is for exploring the product. You can erase the workspace later from Unlock or Settings and create a new one."
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
        {error && !eraseOpen && <p style={{ color: "var(--danger)" }}>{error}</p>}
        <button className="btn" disabled={busy}>
          {busy ? "…" : primaryLabel}
        </button>
      </form>

      {status.initialized && (
        <div className="panel unlock-card unlock-erase">
          {!eraseOpen ? (
            <button
              type="button"
              className="btn ghost"
              disabled={busy}
              onClick={() => {
                setEraseOpen(true);
                setError(null);
              }}
            >
              Erase workspace &amp; start over…
            </button>
          ) : (
            <form className="stack" onSubmit={eraseWorkspace}>
              <h2>Erase workspace</h2>
              <p className="muted" style={{ margin: 0 }}>
                Permanently deletes the local vault, database, uploads, and backups on this machine.
                You can create a new empty or demo workspace afterward. This cannot be undone.
              </p>
              <div className="field">
                <label htmlFor="erase-password">Workspace password</label>
                <input
                  id="erase-password"
                  type="password"
                  value={erasePassword}
                  onChange={(e) => setErasePassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="erase-confirm">Type DELETE to confirm</label>
                <input
                  id="erase-confirm"
                  value={eraseConfirm}
                  onChange={(e) => setEraseConfirm(e.target.value)}
                  autoComplete="off"
                  placeholder="DELETE"
                  required
                />
              </div>
              {error && eraseOpen && <p style={{ color: "var(--danger)" }}>{error}</p>}
              <div className="cta-primary-row">
                <button className="btn danger" disabled={busy} type="submit">
                  {busy ? "…" : "Erase workspace"}
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => {
                    setEraseOpen(false);
                    setErasePassword("");
                    setEraseConfirm("");
                    setError(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
