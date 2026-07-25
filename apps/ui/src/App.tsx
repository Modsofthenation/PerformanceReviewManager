import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import type { WorkspaceStatus } from "@prm/shared";
import { api, getToken, setToken } from "./lib/api";
import { UnlockPage } from "./pages/UnlockPage";
import { HomePage } from "./pages/HomePage";
import { TeamPage } from "./pages/TeamPage";
import { PersonPage } from "./pages/PersonPage";
import { RolesPage } from "./pages/RolesPage";
import { CyclesPage } from "./pages/CyclesPage";
import { WritingDeskPage } from "./pages/WritingDeskPage";
import { SettingsPage } from "./pages/SettingsPage";

export function App() {
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const s = await api<WorkspaceStatus>("/api/workspace/status");
      setStatus(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "API unavailable");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  if (error) {
    return (
      <div className="unlock-screen">
        <div className="panel unlock-card">
          <h1>API offline</h1>
          <p>Start the API on port 8787 (`pnpm dev:api`), then refresh.</p>
          <p className="mono">{error}</p>
          <button className="btn" onClick={refresh}>Retry</button>
        </div>
      </div>
    );
  }

  if (!status) return <div className="unlock-screen"><p>Loading…</p></div>;

  const unlocked = Boolean(getToken()) && status.unlocked;

  if (!status.initialized || !unlocked) {
    return <UnlockPage status={status} onUnlocked={async (token) => { setToken(token); await refresh(); }} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1 className="brand">PRM</h1>
        <div className="brand-sub">{status.name} · solo EM workbench</div>
        <nav className="nav">
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/team">Team</NavLink>
          <NavLink to="/roles">Roles</NavLink>
          <NavLink to="/cycles">Cycles</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <div style={{ marginTop: "2rem" }}>
          <button
            className="btn ghost"
            onClick={async () => {
              await api("/api/workspace/lock", { method: "POST", body: "{}" });
              setToken(null);
              await refresh();
            }}
          >
            Lock workspace
          </button>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/team/:id" element={<PersonPage />} />
          <Route path="/roles" element={<RolesPage />} />
          <Route path="/cycles" element={<CyclesPage />} />
          <Route path="/cycles/:cycleId/write/:personId" element={<WritingDeskPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
