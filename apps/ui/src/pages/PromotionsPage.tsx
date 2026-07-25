import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { PersonDTO } from "@prm/shared";
import { api } from "../lib/api";

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

  return (
    <div className="stack">
      <div>
        <h1>Promotion packets</h1>
        <p>Separate from performance rating. Evidence mapped to <strong>next-role</strong> expectations only.</p>
      </div>
      <form
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
        <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name} → {p.targetNextRoleTitle}</option>
          ))}
        </select>
        <select value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
          {cycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn" disabled={!personId}>Start promotion packet</button>
      </form>
      <div className="panel">
        <table className="table">
          <thead>
            <tr><th>Person</th><th>Current → Next</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.personName}</td>
                <td className="muted">{r.currentRole} → {r.targetRole}</td>
                <td><span className="flag">{r.status}</span></td>
                <td><Link to={`/promotions/${r.id}`}>Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
