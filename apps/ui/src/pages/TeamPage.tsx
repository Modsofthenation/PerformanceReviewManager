import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { PersonDTO } from "@prm/shared";
import { api } from "../lib/api";
import { NextStep, PageHeader } from "../components/PageChrome";

export function TeamPage() {
  const [people, setPeople] = useState<PersonDTO[]>([]);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [levelKey, setLevelKey] = useState("IC3");

  async function load() {
    setPeople(await api<PersonDTO[]>("/api/people"));
  }

  useEffect(() => {
    load();
  }, []);

  async function addPerson(e: React.FormEvent) {
    e.preventDefault();
    const em = people.find((p) => !p.managerId);
    await api("/api/people", {
      method: "POST",
      body: JSON.stringify({ name, title, levelKey, managerId: em?.id }),
    });
    setName("");
    setTitle("");
    await load();
  }

  const directs = people.filter((p) => p.managerId);
  const em = people.find((p) => !p.managerId);
  const unassigned = directs.filter((p) => !p.roleDefinitionId);
  const thin = directs.filter((p) => !p.roleDefinitionId || !p.targetNextRoleDefinitionId);

  return (
    <div className="stack">
      <PageHeader
        title="Team"
        job="Open a dossier to capture evidence, or add someone new. People are subjects — they do not need app accounts."
        primary={unassigned[0] ? <Link className="btn" to="/roles">Assign missing roles</Link> : undefined}
        secondary={<a className="btn secondary" href="#add-person">Add person</a>}
      />

      {unassigned.length > 0 && (
        <NextStep
          tone="warn"
          label={`${unassigned.length} direct${unassigned.length === 1 ? "" : "s"} need a role`}
          detail="Role definitions are the bar for reviews and promotions. Assign current (+ optional next) before writing."
          action={<Link className="btn" to="/roles">Assign roles</Link>}
        />
      )}

      {unassigned.length === 0 && directs[0] && (
        <NextStep
          tone="brand"
          label={`Capture evidence: ${directs[0].name}`}
          detail="Add achievements, feedback, goals, and documents year-round so cycle writing stays under 45 minutes."
          action={<Link className="btn" to={`/team/${directs[0].id}`}>Open dossier</Link>}
        />
      )}

      <div className="panel">
        <p className="muted" style={{ marginTop: 0 }}>EM: {em?.name ?? "—"} · {directs.length} directs</p>
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Title</th><th>Level</th><th>Role</th><th>Next</th><th>Your move</th></tr>
          </thead>
          <tbody>
            {directs.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="muted">{p.title}</td>
                <td>{p.levelKey}</td>
                <td>{p.roleTitle ?? <span className="flag">unassigned</span>}</td>
                <td className="muted">{p.targetNextRoleTitle ?? "—"}</td>
                <td>
                  {!p.roleDefinitionId ? (
                    <Link className="btn" to="/roles">Assign role</Link>
                  ) : (
                    <Link className="btn" to={`/team/${p.id}`}>Open dossier</Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {thin.length === 0 && directs.length > 0 && (
          <p className="muted" style={{ marginBottom: 0, marginTop: "0.75rem" }}>All directs have roles. Keep dossiers fresh from each person’s page.</p>
        )}
      </div>

      <form className="panel" id="add-person" onSubmit={addPerson}>
        <h2>Add person</h2>
        <p className="muted">Creates a dossier subject under you. Assign a role next.</p>
        <div className="grid-2">
          <div className="field"><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div className="field"><label>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="field">
            <label>Level</label>
            <select value={levelKey} onChange={(e) => setLevelKey(e.target.value)}>
              {["IC3", "IC4", "IC5", "M1"].map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
        </div>
        <div className="cta-primary-row">
          <button className="btn">Add to team</button>
        </div>
      </form>
    </div>
  );
}
