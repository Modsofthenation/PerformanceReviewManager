import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { PersonDTO } from "@prm/shared";
import { api } from "../lib/api";

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

  return (
    <div className="stack">
      <div>
        <h1>Team</h1>
        <p>People are dossier subjects — they do not need app accounts. EM: {em?.name ?? "—"}</p>
      </div>
      <div className="panel">
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Title</th><th>Level</th><th>Role</th><th>Next</th><th></th></tr>
          </thead>
          <tbody>
            {directs.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="muted">{p.title}</td>
                <td>{p.levelKey}</td>
                <td>{p.roleTitle ?? <span className="flag">unassigned</span>}</td>
                <td className="muted">{p.targetNextRoleTitle ?? "—"}</td>
                <td><Link to={`/team/${p.id}`}>Dossier</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="panel" onSubmit={addPerson}>
        <h2>Add person</h2>
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
        <button className="btn">Add</button>
      </form>
    </div>
  );
}
