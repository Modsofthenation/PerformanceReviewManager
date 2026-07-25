import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import type { WorkspaceStatus } from "@prm/shared";
import { api, getToken, setToken } from "./lib/api";
import { useTheme } from "./hooks/useTheme";
import { UnlockPage } from "./pages/UnlockPage";
import { HomePage } from "./pages/HomePage";
import { TeamPage } from "./pages/TeamPage";
import { PersonPage } from "./pages/PersonPage";
import { RolesPage } from "./pages/RolesPage";
import { CyclesPage } from "./pages/CyclesPage";
import { WritingDeskPage } from "./pages/WritingDeskPage";
import { SettingsPage } from "./pages/SettingsPage";
import { PromotionsPage } from "./pages/PromotionsPage";
import { PromotionDetailPage } from "./pages/PromotionDetailPage";
import { ChatPage } from "./pages/ChatPage";
import { ConsistencyPage } from "./pages/ConsistencyPage";
import { TeamPerformancePage } from "./pages/TeamPerformancePage";
import { SprintPulsePage } from "./pages/SprintPulsePage";
import { BackfillPage } from "./pages/BackfillPage";

export function App() {
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { theme, toggle } = useTheme();

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

  const themeToggle = (
    <button
      type="button"
      className="btn ghost theme-toggle"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );

  if (error) {
    return (
      <div className="unlock-screen">
        <div className="panel unlock-card">
          <h1>API offline</h1>
          <p>Start the API on port 8787 (`pnpm dev:api`), then refresh.</p>
          <p className="mono">{error}</p>
          <button className="btn" onClick={refresh}>Retry</button>
          <div style={{ marginTop: "0.75rem" }}>{themeToggle}</div>
        </div>
      </div>
    );
  }

  if (!status) return <div className="unlock-screen"><p>Loading…</p></div>;

  const unlocked = Boolean(getToken()) && status.unlocked;

  if (!status.initialized || !unlocked) {
    return (
      <>
        <UnlockPage status={status} onUnlocked={async (token) => { setToken(token); await refresh(); }} />
        <div className="theme-float">{themeToggle}</div>
      </>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1 className="brand">PRM</h1>
        <div className="brand-sub">
          {status.name} · solo EM workbench
          {status.encryptedAtRest ? " · vault sealed" : " · vault open"}
        </div>
        <nav className="nav">
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/team">Team</NavLink>
          <NavLink to="/roles">Roles</NavLink>
          <NavLink to="/cycles">Cycles</NavLink>
          <NavLink to="/promotions">Promotions</NavLink>
          <NavLink to="/consistency">Consistency</NavLink>
          <NavLink to="/team-performance">Team performance</NavLink>
          <NavLink to="/sprint-pulse">Sprint pulse</NavLink>
          <NavLink to="/backfill">Backfill</NavLink>
          <NavLink to="/chat">AI Chat</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <div className="sidebar-actions">
          {themeToggle}
          <button
            className="btn ghost"
            onClick={async () => {
              await api("/api/workspace/lock", { method: "POST", body: "{}" });
              setToken(null);
              await refresh();
            }}
          >
            Lock & encrypt
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
          <Route path="/promotions" element={<PromotionsPage />} />
          <Route path="/promotions/:id" element={<PromotionDetailPage />} />
          <Route path="/consistency" element={<ConsistencyPage />} />
          <Route path="/team-performance" element={<TeamPerformancePage />} />
          <Route path="/sprint-pulse" element={<SprintPulsePage />} />
          <Route path="/backfill" element={<BackfillPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
