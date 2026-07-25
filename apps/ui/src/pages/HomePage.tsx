import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { CycleDTO } from "@prm/shared";
import { api } from "../lib/api";
import { NextStep, PageHeader } from "../components/PageChrome";

type CommandItem = {
  person: { id: string; name: string; roleTitle: string | null } | null;
  hasSelf: boolean;
  peerCount: number;
  managerStatus: string;
  phaseStatus: Record<string, string>;
};

function managerLabel(status: string) {
  if (status === "finalized" || status === "shared") return status;
  if (status === "draft") return "draft";
  return "not started";
}

export function HomePage() {
  const [cycles, setCycles] = useState<CycleDTO[]>([]);
  const [items, setItems] = useState<CommandItem[]>([]);
  const [cycleId, setCycleId] = useState<string | null>(null);

  useEffect(() => {
    api<CycleDTO[]>("/api/cycles").then((c) => {
      setCycles(c);
      if (c[0]) setCycleId(c[0].id);
    });
  }, []);

  useEffect(() => {
    if (!cycleId) return;
    api<{ items: CommandItem[] }>(`/api/cycles/${cycleId}/command-center`).then((r) => setItems(r.items));
  }, [cycleId]);

  const active = cycles.find((c) => c.id === cycleId);

  const stats = useMemo(() => {
    const unassigned = items.filter((i) => i.person && !i.person.roleTitle);
    const needSelf = items.filter((i) => i.person && !i.hasSelf);
    const readyToWrite = items.filter(
      (i) => i.person && i.hasSelf && i.managerStatus !== "finalized" && i.managerStatus !== "shared",
    );
    const drafting = items.filter((i) => i.managerStatus === "draft");
    const done = items.filter((i) => i.managerStatus === "finalized" || i.managerStatus === "shared");
    return { unassigned, needSelf, readyToWrite, drafting, done };
  }, [items]);

  const next = (() => {
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
                <th>Peers</th>
                <th>Manager</th>
                <th>Your move</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const person = item.person;
                if (!person || !cycleId) return null;
                const needsRole = !person.roleTitle;
                const needsSelf = !item.hasSelf;
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
                    <td>{item.peerCount}</td>
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
