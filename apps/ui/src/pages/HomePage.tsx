import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { CycleDTO, CycleStatsDTO, DeadlineNudge, DirectorAttentionDTO, DueThisWeekItem, WorkspaceStatus } from "@prm/shared";
import { api } from "../lib/api";
import { NextStep, PageHeader } from "../components/PageChrome";

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

  useEffect(() => {
    api<CycleDTO[]>("/api/cycles").then((c) => {
      setCycles(c);
      if (c[0]) setCycleId(c[0].id);
    });
    api<WorkspaceStatus>("/api/workspace/status").then((s) => {
      setThinEvidenceCount(s.thinEvidenceCount ?? 0);
      setPersonCount(s.personCount ?? 0);
    });
    api<{ items: DueThisWeekItem[] }>("/api/due-this-week?days=7")
      .then(async (r) => {
        setDueWeek(r.items);
        const actionable = r.items.filter((i) => i.missingSelf || i.managerStatus === "missing" || i.managerStatus === "draft");
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
      .catch(() => setDueWeek([]));

    // Scheduled integration sync while the app is open (session-scoped; mirrors deadline nudge UX).
    let lastSyncAt = 0;
    const runScheduledSync = () => {
      const now = Date.now();
      if (now - lastSyncAt < 30 * 60_000) return;
      lastSyncAt = now;
      api<{ count: number }>("/api/integrations/sync-all", { method: "POST", body: "{}" }).catch(
        () => undefined,
      );
    };
    const syncTimer = window.setTimeout(runScheduledSync, 45_000);
    const syncInterval = window.setInterval(runScheduledSync, 30 * 60_000);
    return () => {
      window.clearTimeout(syncTimer);
      window.clearInterval(syncInterval);
    };
  }, []);

  useEffect(() => {
    if (!cycleId) return;
    api<{ items: CommandItem[] }>(`/api/cycles/${cycleId}/command-center`).then((r) => setItems(r.items));
    api<{ nudges: DeadlineNudge[]; daysUntilDue: number }>(`/api/cycles/${cycleId}/nudges`)
      .then((r) => {
        setNudges(r.nudges);
        setNudgeDays(r.daysUntilDue);
      })
      .catch(() => {
        setNudges([]);
        setNudgeDays(null);
      });
    api<CycleStatsDTO>(`/api/cycles/${cycleId}/stats`)
      .then(setCycleStats)
      .catch(() => setCycleStats(null));
    api<DirectorAttentionDTO>(`/api/director-attention?cycleId=${encodeURIComponent(cycleId)}`)
      .then(setAttention)
      .catch(() => setAttention(null));
  }, [cycleId]);

  const active = cycles.find((c) => c.id === cycleId);

  const stats = useMemo(() => {
    const unassigned = items.filter((i) => i.person && !i.person.roleTitle);
    const needSelf = items.filter((i) => {
      if (!i.person) return false;
      const self = i.selfStatus ?? (i.hasSelf ? "returned" : "pending");
      return self !== "returned" && self !== "waived";
    });
    const readyToWrite = items.filter(
      (i) => i.person && i.hasSelf && i.managerStatus !== "finalized" && i.managerStatus !== "shared",
    );
    const drafting = items.filter((i) => i.managerStatus === "draft");
    const done = items.filter((i) => i.managerStatus === "finalized" || i.managerStatus === "shared");
    return { unassigned, needSelf, readyToWrite, drafting, done };
  }, [items]);

  const next = (() => {
    if (personCount === 0) {
      return (
        <NextStep
          tone="brand"
          label="Add your team"
          detail="This workspace has no people yet. Add yourself as EM and your directs on Team, then assign roles and open a cycle."
          action={<Link className="btn" to="/team">Open team</Link>}
        />
      );
    }
    if (!cycleId) {
      return (
        <NextStep
          tone="warn"
          label="Create a review cycle"
          detail="Open a cycle, then export self-review bundles and write manager drafts from Home."
          action={<Link className="btn" to="/cycles">Create cycle</Link>}
        />
      );
    }
    if (stats.unassigned[0]?.person) {
      const p = stats.unassigned[0].person;
      return (
        <NextStep
          tone="warn"
          label={`${stats.unassigned.length} without a role`}
          detail={`${p.name}${stats.unassigned.length > 1 ? ` and ${stats.unassigned.length - 1} more` : ""} need a RoleDefinition before fair ratings.`}
          action={<Link className="btn" to="/roles">Assign roles</Link>}
        />
      );
    }
    if (stats.needSelf[0]?.person) {
      const p = stats.needSelf[0].person;
      return (
        <NextStep
          tone="brand"
          label="Get self-reviews in"
          detail={`${p.name}${stats.needSelf.length > 1 ? ` (+${stats.needSelf.length - 1})` : ""} still missing a self bundle. Export JSON, send outside the app, then import.`}
          action={
            <>
              <Link className="btn" to="/cycles">Export / import bundles</Link>
              <Link className="btn secondary" to={`/cycles/${cycleId}/write/${p.id}`}>Write anyway</Link>
            </>
          }
        />
      );
    }
    if (thinEvidenceCount > 0) {
      return (
        <NextStep
          tone="brand"
          label={`Backfill ${thinEvidenceCount} thin dossier${thinEvidenceCount === 1 ? "" : "s"}`}
          detail="Cold-start dossiers block grounded reviews. Capture a few achievements/notes, or use MCP bulk load."
          action={
            <>
              <Link className="btn" to="/backfill">Open backfill wizard</Link>
              {stats.readyToWrite[0]?.person && (
                <Link className="btn secondary" to={`/cycles/${cycleId}/write/${stats.readyToWrite[0].person.id}`}>
                  Write anyway
                </Link>
              )}
            </>
          }
        />
      );
    }
    if (stats.readyToWrite[0]?.person) {
      const p = stats.readyToWrite[0].person;
      const verb = stats.drafting.length > 0 ? "Continue writing" : "Start writing";
      return (
        <NextStep
          tone="brand"
          label={`${verb}: ${p.name}`}
          detail={
            stats.drafting.length > 0
              ? `${stats.drafting.length} draft${stats.drafting.length === 1 ? "" : "s"} in progress · ${stats.done.length} finalized.`
              : "Self imports are in. Draft the manager review against the assigned role."
          }
          action={<Link className="btn" to={`/cycles/${cycleId}/write/${p.id}`}>{verb}</Link>}
        />
      );
    }
    if (items.length > 0 && stats.done.length === items.length) {
      return (
        <NextStep
          tone="ok"
          label="Cycle writing complete"
          detail="All manager reviews are finalized. Export subject packets from each writing desk, or open promotions where readiness is set."
          action={<Link className="btn" to="/promotions">Review promotions</Link>}
        />
      );
    }
    return (
      <NextStep
        tone="brand"
        label="Capture evidence year-round"
        detail="Between cycles, keep dossiers current — achievements, feedback, and documents make writing faster."
        action={<Link className="btn" to="/team">Open team</Link>}
      />
    );
  })();

  return (
    <div className="stack">
      <PageHeader
        title="Command center"
        job="Unblock the next person in your review pipeline — roles, bundles, then writing."
        primary={cycleId ? <Link className="btn secondary" to="/cycles">Manage cycles & bundles</Link> : undefined}
      />

      {next}

      <div className="panel row">
        <label className="muted">Cycle</label>
        <select value={cycleId ?? ""} onChange={(e) => setCycleId(e.target.value || null)}>
          {cycles.length === 0 && <option value="">No cycles yet</option>}
          {cycles.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {active && <span className="muted">{active.windowStart} → {active.windowEnd} · {active.status}</span>}
      </div>

      {attention && attention.items.length > 0 && (
        <div className="panel stack">
          <h2 style={{ margin: 0 }}>Needs director attention</h2>
          <p className="muted" style={{ margin: 0 }}>
            Flags only — stagnant ratings, thin evidence, promo-ready, open concern counts. No private note bodies.
          </p>
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
                <Link className="btn ghost" to={`/cycles/${attention.cycleId}/write/${item.personId}`}>
                  Desk
                </Link>
              </li>
            ))}
          </ul>
          <Link className="btn secondary" to={`/consistency?cycleId=${attention.cycleId}`}>
            Open consistency / director packs
          </Link>
        </div>
      )}

      {dueWeek.length > 0 && (
        <div className="panel stack" style={{ borderColor: "var(--warn, #c4a35a)" }}>
          <h2 style={{ margin: 0 }}>Due this week</h2>
          <p className="muted" style={{ margin: 0 }}>
            Sticky tray for cycle work ending within 7 days. OS notification fires once per session when permission is
            granted (app must be open).
          </p>
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
        </div>
      )}

      {cycleStats && (
        <div className="panel stack">
          <h2 style={{ margin: 0 }}>Cycle dashboard</h2>
          <p className="muted" style={{ margin: 0 }}>
            Writing time, evidence coverage, and thin dossiers for {cycleStats.cycleName}.
          </p>
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
                  <Link to="/backfill">Backfill</Link>
                </>
              ) : null}
            </div>
            <div>
              <div className="muted">Charts</div>
              <Link to={cycleId ? `/team-performance?cycleId=${cycleId}` : "/team-performance"}>
                Team performance
              </Link>
              {" · "}
              <Link to="/sprint-pulse">Sprint pulse</Link>
            </div>
          </div>
        </div>
      )}

      {cycleId && nudges.length > 0 && (
        <div className="panel stack">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>Deadline nudges</h2>
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
              Copy all
            </button>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            {nudges.length} missing self-review
            {nudgeDays != null ? ` · ${nudgeDays} day(s) until window end` : ""}
          </p>
          <ul>
            {nudges.map((n) => (
              <li key={n.personId}>
                <strong>{n.personName}</strong>{" "}
                <span className="muted">({n.selfStatus})</span>{" "}
                <a href={n.mailtoHref}>mailto</a>
              </li>
            ))}
          </ul>
          {nudgeMsg && <p className="muted">{nudgeMsg}</p>}
        </div>
      )}

      <div className="panel">
        {items.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {cycleId ? "No participants in this cycle." : "Create a cycle to see your writing queue."}
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Self</th>
                <th>Self pipeline</th>
                <th>Peers</th>
                <th>Peer pipeline</th>
                <th>Manager</th>
                <th>Your move</th>
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
                  cta = <Link className="btn" to="/roles">Assign role</Link>;
                } else if (needsSelf) {
                  cta = (
                    <div className="row">
                      <Link className="btn" to="/cycles">Get self-review</Link>
                      <Link className="btn secondary" to={`/cycles/${cycleId}/write/${person.id}`}>Write</Link>
                    </div>
                  );
                } else if (finalized) {
                  cta = <Link className="btn secondary" to={`/cycles/${cycleId}/write/${person.id}`}>Open / export</Link>;
                } else if (item.managerStatus === "draft") {
                  cta = <Link className="btn" to={`/cycles/${cycleId}/write/${person.id}`}>Continue writing</Link>;
                } else {
                  cta = <Link className="btn" to={`/cycles/${cycleId}/write/${person.id}`}>Write review</Link>;
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
      </div>
    </div>
  );
}
