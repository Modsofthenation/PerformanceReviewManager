import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { PersonDTO } from "@prm/shared";
import { api } from "../lib/api";
import { NextStep, PageHeader } from "../components/PageChrome";

type PromoRow = {
  id: string;
  status: string;
  personId: string;
  personName?: string;
  currentRole?: string;
  targetRole?: string;
  createdAt: string;
};

export function PromotionsPage() {
  const [rows, setRows] = useState<PromoRow[]>([]);
  const [people, setPeople] = useState<PersonDTO[]>([]);
  const [personId, setPersonId] = useState("");
  const [cycles, setCycles] = useState<Array<{ id: string; name: string }>>([]);
  const [cycleId, setCycleId] = useState("");
  const navigate = useNavigate();

  async function load() {
    const [p, peopleRows, c] = await Promise.all([
      api<PromoRow[]>("/api/promotions"),
      api<PersonDTO[]>("/api/people"),
      api<Array<{ id: string; name: string }>>("/api/cycles"),
    ]);
    setRows(p);
    const directs = peopleRows.filter((x) => x.managerId && x.targetNextRoleDefinitionId);
    setPeople(directs);
    if (!personId && directs[0]) setPersonId(directs[0].id);
    setCycles(c);
    if (!cycleId && c[0]) setCycleId(c[0].id);
  }

  useEffect(() => {
    load();
  }, []);

  const drafts = rows.filter((r) => r.status === "draft");

  return (
    <div className="stack">
      <PageHeader
        title="Promotion packets"
        job="Separate from performance rating. Map evidence to next-role expectations only, then submit the case."
        secondary={
          people.length > 0 ? (
            <a className="btn secondary" href="#start-promo-form">
              Jump to start form
            </a>
          ) : (
            <Link className="btn secondary" to="/roles">
              Set target next roles
            </Link>
          )
        }
      />

      {people.length === 0 ? (
        <NextStep
          tone="warn"
          label="No one has a target next role"
          detail="On Roles, assign a current RoleDefinition and an optional target next — only then can you open a promotion packet."
          action={<Link className="btn" to="/roles">Assign next roles</Link>}
        />
      ) : drafts[0] ? (
        <NextStep
          tone="brand"
          label={`Continue: ${drafts[0].personName}`}
          detail={`${drafts.length} draft packet${drafts.length === 1 ? "" : "s"} in progress. Finish next-role marks and the case narrative, then Submit.`}
          action={<Link className="btn" to={`/promotions/${drafts[0].id}`}>Open draft packet</Link>}
        />
      ) : (
        <NextStep
          tone="brand"
          label="Start a promotion packet"
          detail="Pick someone with a target next role. This does not change their performance rating."
          action={<button className="btn" form="start-promo-form" type="submit" disabled={!personId}>Start promotion packet</button>}
        />
      )}

      <form
        id="start-promo-form"
        className="panel row"
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await api<{ id: string }>("/api/promotions", {
            method: "POST",
            body: JSON.stringify({ personId, cycleId: cycleId || undefined }),
          });
          navigate(`/promotions/${res.id}`);
        }}
      >
        <AppSelect
          value={personId}
          onChange={(v) => setPersonId(v)}
          aria-label="Person"
          fullWidth={false}
          options={[
            ...(people.length === 0 ? [{ value: "", label: "No eligible people" }] : []),
            ...people.map((p) => ({
              value: p.id,
              label: `${p.name} → ${p.targetNextRoleTitle}`,
            })),
          ]}
        />
        <AppSelect
          value={cycleId}
          onChange={(v) => setCycleId(v)}
          aria-label="Cycle"
          fullWidth={false}
          options={cycles.map((c) => ({ value: c.id, label: c.name }))}
        />
        <button className="btn secondary" disabled={!personId}>Start promotion packet</button>
      </form>

      <div className="panel">
        <h2>Open packets</h2>
        {rows.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No packets yet. Start one above when promo readiness is in play.</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Person</th><th>Current → Next</th><th>Status</th><th>Your move</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.personName}</td>
                  <td className="muted">{r.currentRole} → {r.targetRole}</td>
                  <td><span className="flag">{r.status}</span></td>
                  <td>
                    <Link className="btn secondary" to={`/promotions/${r.id}`}>
                      {r.status === "submitted" ? "View packet" : "Continue packet"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
