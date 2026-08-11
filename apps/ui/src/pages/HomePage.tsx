import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { CycleDTO, CycleStatsDTO, DeadlineNudge, DirectorAttentionDTO, DueThisWeekItem, WorkspaceStatus } from "@prm/shared";
import { api } from "../lib/api";
import { NextStep, PageHeader, Section } from "../components/PageChrome";
import { PageSectionsLayout } from "../components/PageSectionsLayout";
import { OnboardingWizard } from "../components/OnboardingWizard";
import { AppSelect } from "../components/AppSelect";

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

  useEffect(() => {
    api<CycleDTO[]>("/api/cycles").then((c) => {
      setCycles(c);
      const preferred =
        c.find((x) => x.status === "manager_open") ||
        c.find((x) => x.status !== "closed") ||
        c[0];
      if (preferred) setCycleId(preferred.id);
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

    return () => undefined;
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
    // OnboardingWizard owns the empty / first-cycle path — avoid duplicate banners.
    if (setupActive || personCount === 0 || !cycleId) return null;
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

  const showSetupOnly = personCount === 0 || (!cycleId && (setupActive || cycles.length === 0));

  return (
    <div className="stack">
      <PageHeader
        title={showSetupOnly ? "Welcome" : "Command center"}
        job={
          showSetupOnly
            ? "Set up your team and first cycle — then this page becomes your review pipeline."
            : "Unblock the next person in your review pipeline — roles, bundles, then writing."
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

      {next}

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
