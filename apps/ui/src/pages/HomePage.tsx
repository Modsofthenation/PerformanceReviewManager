import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { CycleDTO, CycleStatsDTO, DeadlineNudge, DirectorAttentionDTO, DueThisWeekItem, WorkspaceStatus } from "@prm/shared";
import { api } from "../lib/api";
import { buildHomeSuggestions } from "../lib/homeSuggestions";
import { PageHeader, Section } from "../components/PageChrome";
import { PageSectionsLayout } from "../components/PageSectionsLayout";
import { OnboardingWizard } from "../components/OnboardingWizard";
import { AppSelect } from "../components/AppSelect";
import { HomeSuggestionQueue } from "../components/HomeSuggestionQueue";

type CommandItem = {
  person: { id: string; name: string; roleTitle: string | null } | null;
  hasSelf: boolean;
  peerCount: number;
  managerStatus: string;
  phaseStatus: Record<string, string>;
  selfStatus?: string;
  peerStatus?: string;
};

function managerLabel(status: string) {
  if (status === "finalized" || status === "shared") return status;
  if (status === "draft") return "draft";
  return "not started";
}

function pipelinePill(status: string | undefined) {
  const value = status || "pending";
  const tone =
    value === "returned" || value === "waived"
      ? "ok"
      : value === "exported"
        ? "warn"
        : "";
  return <span className={`status-pill ${tone}`.trim()}>{value}</span>;
}

export function HomePage() {
  const [cycles, setCycles] = useState<CycleDTO[]>([]);
  const [items, setItems] = useState<CommandItem[]>([]);
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [thinEvidenceCount, setThinEvidenceCount] = useState(0);
  const [personCount, setPersonCount] = useState(0);
  const [nudges, setNudges] = useState<DeadlineNudge[]>([]);
  const [dueWeek, setDueWeek] = useState<DueThisWeekItem[]>([]);
  const [nudgeDays, setNudgeDays] = useState<number | null>(null);
  const [nudgeMsg, setNudgeMsg] = useState<string | null>(null);
  const [cycleStats, setCycleStats] = useState<CycleStatsDTO | null>(null);
  const [attention, setAttention] = useState<DirectorAttentionDTO | null>(null);
  const [setupActive, setSetupActive] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refreshWorkspace = useCallback(async () => {
    const [c, s, due] = await Promise.all([
      api<CycleDTO[]>("/api/cycles"),
      api<WorkspaceStatus>("/api/workspace/status"),
      api<{ items: DueThisWeekItem[] }>("/api/due-this-week?days=7").catch(() => ({ items: [] as DueThisWeekItem[] })),
    ]);
    setCycles(c);
    setThinEvidenceCount(s.thinEvidenceCount ?? 0);
    setPersonCount(s.personCount ?? 0);
    setDueWeek(due.items);
    setCycleId((prev) => {
      if (prev && c.some((x) => x.id === prev)) return prev;
      const preferred =
        c.find((x) => x.status === "manager_open") ||
        c.find((x) => x.status !== "closed") ||
        c[0];
      return preferred?.id ?? null;
    });
  }, []);

  const refreshCycleData = useCallback(async (id: string) => {
    const [command, nudgeRes, statsRes, attentionRes] = await Promise.all([
      api<{ items: CommandItem[] }>(`/api/cycles/${id}/command-center`),
      api<{ nudges: DeadlineNudge[]; daysUntilDue: number }>(`/api/cycles/${id}/nudges`).catch(() => ({
        nudges: [] as DeadlineNudge[],
        daysUntilDue: null as number | null,
      })),
      api<CycleStatsDTO>(`/api/cycles/${id}/stats`).catch(() => null),
      api<DirectorAttentionDTO>(`/api/director-attention?cycleId=${encodeURIComponent(id)}`).catch(() => null),
    ]);
    setItems(command.items);
    setNudges(nudgeRes.nudges);
    setNudgeDays(nudgeRes.daysUntilDue);
    setCycleStats(statsRes);
    setAttention(attentionRes);
  }, []);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const [c, s, due] = await Promise.all([
        api<CycleDTO[]>("/api/cycles"),
        api<WorkspaceStatus>("/api/workspace/status"),
        api<{ items: DueThisWeekItem[] }>("/api/due-this-week?days=7").catch(() => ({
          items: [] as DueThisWeekItem[],
        })),
      ]);
      setCycles(c);
      setThinEvidenceCount(s.thinEvidenceCount ?? 0);
      setPersonCount(s.personCount ?? 0);
      setDueWeek(due.items);

      let selected: string | null = null;
      setCycleId((prev) => {
        if (prev && c.some((x) => x.id === prev)) {
          selected = prev;
          return prev;
        }
        const preferred =
          c.find((x) => x.status === "manager_open") ||
          c.find((x) => x.status !== "closed") ||
          c[0];
        selected = preferred?.id ?? null;
        return selected;
      });
      if (selected) await refreshCycleData(selected);
      else {
        setItems([]);
        setNudges([]);
        setNudgeDays(null);
        setCycleStats(null);
        setAttention(null);
      }
    } finally {
      setRefreshing(false);
    }
  }, [refreshCycleData]);

  useEffect(() => {
    void refreshWorkspace()
      .then(async () => {
        const due = await api<{ items: DueThisWeekItem[] }>("/api/due-this-week?days=7").catch(() => ({
          items: [] as DueThisWeekItem[],
        }));
        const actionable = due.items.filter(
          (i) => i.missingSelf || i.managerStatus === "missing" || i.managerStatus === "draft",
        );
        if (actionable.length && typeof Notification !== "undefined") {
          const key = `prm_due_notify_${new Date().toISOString().slice(0, 10)}`;
          if (sessionStorage.getItem(key)) return;
          const show = () => {
            new Notification("PRM — due this week", {
              body: `${actionable.length} person(s) need attention before cycle window ends.`,
            });
            sessionStorage.setItem(key, "1");
          };
          if (Notification.permission === "granted") show();
          else if (Notification.permission !== "denied") {
            const perm = await Notification.requestPermission();
            if (perm === "granted") show();
          }
        }
      })
      .catch(() => undefined);
  }, [refreshWorkspace]);

  useEffect(() => {
    if (!cycleId) {
      setItems([]);
      setNudges([]);
      setNudgeDays(null);
      setCycleStats(null);
      setAttention(null);
      return;
    }
    void refreshCycleData(cycleId);
  }, [cycleId, refreshCycleData]);

  // Recompute suggestions when the EM returns from Roles / Cycles / Writing desk.
  useEffect(() => {
    const onFocus = () => {
      void refreshAll();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") onFocus();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshAll]);

  const active = cycles.find((c) => c.id === cycleId);

  const suggestions = useMemo(() => {
    if (setupActive || personCount === 0) return [];
    return buildHomeSuggestions({
      cycleId,
      thinEvidenceCount,
      items,
      nudgeCount: nudges.length,
      nudgeDays,
      attentionCount: attention?.items.length ?? 0,
    });
  }, [
    setupActive,
    personCount,
    cycleId,
    thinEvidenceCount,
    items,
    nudges.length,
    nudgeDays,
    attention?.items.length,
  ]);

  const showSetupOnly = personCount === 0 || (!cycleId && (setupActive || cycles.length === 0));

  return (
    <div className="stack">
      <PageHeader
        title={showSetupOnly ? "Welcome" : "Command center"}
        job={
          showSetupOnly
            ? "Set up your team and first cycle — then this page becomes your review pipeline."
            : "Suggested next actions update as you clear roles, bundles, and drafts."
        }
        primary={
          !showSetupOnly && cycleId ? (
            <Link className="btn secondary" to="/cycles">
              Manage cycles & bundles
            </Link>
          ) : undefined
        }
      />

      <OnboardingWizard onActiveChange={setSetupActive} />

      {!showSetupOnly ? (
        <HomeSuggestionQueue
          suggestions={suggestions}
          refreshing={refreshing}
          onRefresh={() => void refreshAll()}
        />
      ) : null}

      {showSetupOnly ? (
        <Section
          id="home-setup"
          title="What happens next"
          when="After empty workspace create — before the review command center is useful."
          how="Add people on Team (CSV or one-by-one), optionally assign roles, then create a cycle. Demo workspaces skip this."
        >
          <ol style={{ margin: 0, paddingLeft: "1.25rem" }}>
            <li>
              <Link to="/team">Team</Link> — add directs (you’re already EM if you entered your name at create)
            </li>
            <li>
              <Link to="/roles">Roles</Link> — PE career ladder is preloaded (Graduate → CTO); assign current (+ optional next)
            </li>
            <li>
              <Link to="/cycles">Cycles</Link> — open a review window and export self/peer bundles
            </li>
          </ol>
        </Section>
      ) : (
      <PageSectionsLayout
        sections={[
          { id: "home-cycle", label: "Cycle" },
          ...(attention && attention.items.length > 0
            ? [{ id: "home-attention", label: "Attention" }]
            : []),
          ...(dueWeek.length > 0 ? [{ id: "home-due", label: "Due" }] : []),
          ...(cycleStats ? [{ id: "home-dashboard", label: "Dashboard" }] : []),
          ...(cycleId && nudges.length > 0 ? [{ id: "home-nudges", label: "Nudges" }] : []),
          { id: "home-queue", label: "Queue" },
        ]}
      >
      <Section
        id="home-cycle"
        title="Active cycle"
        when="Switch cycles when you start a new review window or need to revisit a closed one."
        how="Pick the cycle below. The rest of this page filters to that window’s pipeline and flags."
      >
        <div className="row" style={{ flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <label className="muted" htmlFor="home-cycle-select">
            Cycle
          </label>
          <AppSelect
            id="home-cycle-select"
            value={cycleId ?? ""}
            onChange={(v) => setCycleId(v || null)}
            fullWidth={false}
            options={[
              ...(cycles.length === 0 ? [{ value: "", label: "No cycles yet" }] : []),
              ...cycles.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          {active && (
            <span className="muted">
              {active.windowStart} → {active.windowEnd} · {active.status}
            </span>
          )}
        </div>
      </Section>

      {attention && attention.items.length > 0 && (
        <Section
          id="home-attention"
          title="Needs director attention"
          when="Use before a skip-level or calibration conversation — flags only, no private note bodies."
          how="Scan reasons, open a writing desk to fix evidence, or jump to consistency / director packs."
          action={
            <Link className="btn secondary" to={`/consistency?cycleId=${attention.cycleId}`}>
              Open consistency packs
            </Link>
          }
        >
          <ul>
            {attention.items.slice(0, 10).map((item) => (
              <li key={item.personId}>
                <Link to={`/team/${item.personId}`}>
                  <strong>{item.personName}</strong>
                </Link>{" "}
                <span className="muted">
                  {item.reasons.join(" · ")}
                  {item.overall != null ? ` · overall ${item.overall}` : ""}
                </span>{" "}
                <Link
                  className="btn secondary"
                  to={`/cycles/${attention.cycleId}/write/${item.personId}`}
                >
                  Open writing desk
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {dueWeek.length > 0 && (
        <Section
          id="home-due"
          title="Due this week"
          when="Use in the last 7 days of a cycle window when drafts or self-reviews are still open."
          how="Open each person’s writing desk from the list. OS notifications fire once per session if permitted."
          className="section-due"
        >
          <ul>
            {dueWeek.slice(0, 12).map((d) => (
              <li key={`${d.cycleId}-${d.personId}`}>
                <Link to={`/cycles/${d.cycleId}/write/${d.personId}`}>
                  <strong>{d.personName}</strong>
                </Link>{" "}
                <span className="muted">
                  {d.cycleName} · {d.daysUntilDue}d · mgr {d.managerStatus}
                  {d.missingSelf ? " · missing self" : ""}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {cycleStats && (
        <Section
          id="home-dashboard"
          title="Cycle dashboard"
          when={`Use mid-cycle or before finalize to see whether ${cycleStats.cycleName} is on track.`}
          how="Check writing time, evidence coverage, and thin dossiers. Open charts when the shape looks off."
          action={
            <>
              <Link
                className="btn secondary"
                to={cycleId ? `/team-performance?cycleId=${cycleId}` : "/team-performance"}
              >
                Open team performance
              </Link>
              <Link className="btn secondary" to="/sprint-pulse">
                Open sprint pulse
              </Link>
            </>
          }
        >
          <div className="row" style={{ flexWrap: "wrap", gap: 16 }}>
            <div>
              <div className="muted">Avg writing time</div>
              <strong>
                {cycleStats.writing.peopleWithTime
                  ? `${Math.floor(cycleStats.writing.avgSeconds / 60)}m`
                  : "—"}
              </strong>
              <span className="muted">
                {" "}
                · {cycleStats.writing.under45MinPct}% ≤45 min
                {cycleStats.writing.peopleWithTime
                  ? ` (${cycleStats.writing.under45MinCount}/${cycleStats.writing.peopleWithTime})`
                  : ""}
              </span>
            </div>
            <div>
              <div className="muted">Evidence coverage</div>
              <strong>{cycleStats.evidence.coveragePct}%</strong>
              <span className="muted">
                {" "}
                · avg {cycleStats.evidence.avgLinkedSources} linked sources / draft
              </span>
            </div>
            <div>
              <div className="muted">Thin dossiers</div>
              <strong>{cycleStats.thinDossierCount}</strong>
              <span className="muted"> / {cycleStats.participantCount} people</span>
              {cycleStats.thinDossierCount > 0 ? (
                <>
                  {" "}
                  <Link className="btn secondary" to="/backfill">
                    Open backfill
                  </Link>
                </>
              ) : null}
            </div>
          </div>
        </Section>
      )}

      {cycleId && nudges.length > 0 && (
        <Section
          id="home-nudges"
          title="Deadline nudges"
          when="Use when self-reviews are still missing near the cycle deadline."
          how="Copy mailto links (or all at once) and send outside the app — ICs never log in here."
          action={
            <button
              type="button"
              className="btn secondary"
              onClick={async () => {
                const text = nudges
                  .map((n) => `${n.personName}${n.email ? ` <${n.email}>` : ""} — ${n.mailtoHref}`)
                  .join("\n");
                try {
                  await navigator.clipboard.writeText(text);
                  setNudgeMsg("Copied all nudge links");
                } catch {
                  setNudgeMsg("Could not copy — select mailto links below");
                }
              }}
            >
              Copy all nudge links
            </button>
          }
        >
          <p className="muted" style={{ margin: 0 }}>
            {nudges.length} missing self-review
            {nudgeDays != null ? ` · ${nudgeDays} day(s) until window end` : ""}
          </p>
          <ul>
            {nudges.map((n) => (
              <li key={n.personId}>
                <strong>{n.personName}</strong>{" "}
                <span className="muted">({n.selfStatus})</span>{" "}
                <a href={n.mailtoHref}>Email nudge</a>
              </li>
            ))}
          </ul>
          {nudgeMsg && <p className="muted">{nudgeMsg}</p>}
        </Section>
      )}

      <Section
        id="home-queue"
        title="Writing queue"
        when="Use throughout the cycle to see who still needs a role, self-review, or manager draft."
        how="Read each row’s status, then take the action in Your move — or open Cycles to export self-review packs."
        action={
          cycleId ? (
            <Link className="btn secondary" to="/cycles">
              Manage cycle roster
            </Link>
          ) : (
            <Link className="btn" to="/cycles">
              Create cycle
            </Link>
          )
        }
      >
        {items.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {cycleId ? "No participants in this cycle." : "Create a cycle to see your writing queue."}
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Role</th>
                <th scope="col">Self</th>
                <th scope="col">Self pipeline</th>
                <th scope="col">Peers</th>
                <th scope="col">Peer pipeline</th>
                <th scope="col">Manager</th>
                <th scope="col">Your move</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const person = item.person;
                if (!person || !cycleId) return null;
                const needsRole = !person.roleTitle;
                const selfStatus = item.selfStatus ?? (item.hasSelf ? "returned" : "pending");
                const needsSelf = selfStatus !== "returned" && selfStatus !== "waived";
                const finalized = item.managerStatus === "finalized" || item.managerStatus === "shared";
                let cta: ReactNode;
                if (needsRole) {
                  cta = <Link className="btn secondary" to="/roles">Assign role</Link>;
                } else if (needsSelf) {
                  cta = (
                    <div className="row">
                      <Link className="btn secondary" to="/cycles">Export self-review pack</Link>
                      <Link className="btn ghost" to={`/cycles/${cycleId}/write/${person.id}`}>
                        Open writing desk
                      </Link>
                    </div>
                  );
                } else if (finalized) {
                  cta = (
                    <Link className="btn secondary" to={`/cycles/${cycleId}/write/${person.id}`}>
                      Open or export draft
                    </Link>
                  );
                } else if (item.managerStatus === "draft") {
                  cta = (
                    <Link className="btn secondary" to={`/cycles/${cycleId}/write/${person.id}`}>
                      Continue writing
                    </Link>
                  );
                } else {
                  cta = (
                    <Link className="btn secondary" to={`/cycles/${cycleId}/write/${person.id}`}>
                      Start writing review
                    </Link>
                  );
                }
                return (
                  <tr key={person.id}>
                    <td><Link to={`/team/${person.id}`}>{person.name}</Link></td>
                    <td className="muted">{person.roleTitle ?? <span className="flag">unassigned</span>}</td>
                    <td>
                      {item.hasSelf
                        ? <span className="status-pill ok">imported</span>
                        : <span className="status-pill warn">missing</span>}
                    </td>
                    <td>{pipelinePill(selfStatus)}</td>
                    <td>{item.peerCount}</td>
                    <td>{pipelinePill(item.peerStatus)}</td>
                    <td>
                      <span className={`status-pill ${finalized ? "ok" : item.managerStatus === "draft" ? "warn" : ""}`}>
                        {managerLabel(item.managerStatus)}
                      </span>
                    </td>
                    <td>{cta}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>
      </PageSectionsLayout>
      )}
    </div>
  );
}
