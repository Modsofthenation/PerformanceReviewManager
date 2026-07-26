import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import type { WorkspaceStatus } from "@prm/shared";
import { api, getToken, setToken, waitForApi } from "./lib/api";
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
import { SearchPage } from "./pages/SearchPage";
import { BackfillPage } from "./pages/BackfillPage";

const NAV = [
  {
    label: "Work",
    links: [
      { to: "/", end: true, label: "Home" },
      { to: "/team", label: "Team" },
      { to: "/roles", label: "Roles" },
      { to: "/cycles", label: "Cycles" },
      { to: "/promotions", label: "Promotions" },
    ],
  },
  {
    label: "Review",
    links: [
      { to: "/consistency", label: "Consistency" },
      { to: "/team-performance", label: "Team performance" },
      { to: "/sprint-pulse", label: "Sprint pulse" },
      { to: "/search", label: "Search" },
      { to: "/backfill", label: "Backfill" },
    ],
  },
  {
    label: "Tools",
    links: [
      { to: "/chat", label: "AI Chat" },
      { to: "/settings", label: "Settings" },
    ],
  },
] as const;

export function App() {
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const { resolved, toggle } = useTheme();
  const location = useLocation();

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!navOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setNavOpen(false);
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [navOpen]);

  async function refresh() {
    try {
      await waitForApi();
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
      aria-label={resolved === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={resolved === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {resolved === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );

  if (error) {
    const desktop = typeof window !== "undefined" && Boolean(window.__PRM_DESKTOP__ || window.__PRM_API_BASE_URL__);
    const logPath = typeof window !== "undefined" ? window.__PRM_DESKTOP_LOG__ : undefined;
    const apiBase = typeof window !== "undefined" ? window.__PRM_API_BASE_URL__ : undefined;
    async function retryDesktop() {
      const base = (apiBase || "http://127.0.0.1:8787").replace(/\/$/, "");
      try {
        const res = await fetch(`${base}/api/health`);
        if (res.ok) {
          window.location.href = `${base}/`;
          return;
        }
      } catch {
        /* fall through */
      }
      await refresh();
    }
    return (
      <div className="unlock-screen">
        <div className="panel unlock-card">
          <h1>API offline</h1>
          {desktop ? (
            <>
              <p>
                The desktop API sidecar did not become ready. Retry in a moment. If this persists, check the
                sidecar log and reinstall from the latest CI artifact.
              </p>
              {apiBase ? <p className="mono">Expected API: {apiBase}</p> : null}
              {logPath ? <p className="mono">Log: {logPath}</p> : (
                <p className="mono">Log: %APPDATA%\com.prm.workbench\desktop-api.log (Windows)</p>
              )}
            </>
          ) : (
            <p>Start the API on port 8787 (`pnpm dev:api`), then refresh.</p>
          )}
          <p className="mono">{error}</p>
          <button className="btn" onClick={desktop ? retryDesktop : refresh}>Retry</button>
          <div className="unlock-actions">{themeToggle}</div>
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
    <div className={`app-shell${navOpen ? " nav-open" : ""}`}>
      <header className="topbar">
        <button
          type="button"
          className="nav-toggle"
          aria-label="Open navigation"
          aria-expanded={navOpen}
          onClick={() => setNavOpen(true)}
        >
          <span className="nav-toggle-bars" aria-hidden />
        </button>
        <div className="topbar-brand">PRM</div>
        <button
          type="button"
          className="btn ghost"
          onClick={toggle}
          aria-label={resolved === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {resolved === "dark" ? "Light" : "Dark"}
        </button>
      </header>

      <div
        className="nav-backdrop"
        role="presentation"
        onClick={() => setNavOpen(false)}
      />

      <aside className="sidebar" aria-label="Primary">
        <div className="sidebar-header">
          <div>
            <h1 className="brand">PRM</h1>
            <div className="brand-sub">
              {status.name} · solo EM workbench
              {status.encryptedAtRest ? " · vault sealed" : " · vault open"}
            </div>
          </div>
          <button
            type="button"
            className="nav-close"
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
          >
            ✕
          </button>
        </div>
        <nav className="nav">
          {NAV.map((section) => (
            <div key={section.label}>
              <div className="nav-section">{section.label}</div>
              {section.links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={"end" in link ? link.end : undefined}
                  onClick={() => setNavOpen(false)}
                >
                  {link.label}
                </NavLink>
              ))}
            </div>
          ))}
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
          <Route path="/search" element={<SearchPage />} />
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
