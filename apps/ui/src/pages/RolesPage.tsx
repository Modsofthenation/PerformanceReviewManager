import { useEffect, useState } from "react";
import type { PersonDTO, RoleDefinitionDTO } from "@prm/shared";
import { api } from "../lib/api";

export function RolesPage() {
  const [roles, setRoles] = useState<RoleDefinitionDTO[]>([]);
  const [people, setPeople] = useState<PersonDTO[]>([]);
  const [personId, setPersonId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [nextId, setNextId] = useState("");

  async function load() {
    const [r, p] = await Promise.all([
      api<RoleDefinitionDTO[]>("/api/roles"),
      api<PersonDTO[]>("/api/people"),
    ]);
    setRoles(r.filter(Boolean) as RoleDefinitionDTO[]);
    setPeople(p.filter((x) => x.managerId));
    if (!personId && p[0]) setPersonId(p.find((x) => x.managerId)?.id ?? "");
    if (!roleId && r[0]) setRoleId(r[0]!.id);
  }

  useEffect(() => {
    load();
  }, []);

  const selected = roles.find((r) => r.id === roleId);

  return (
    <div className="stack">
      <div>
        <h1>Role frameworks</h1>
        <p>Uploaded / seeded R&R definitions with stable expectation IDs. Assign each person a current role and optional next progression.</p>
      </div>
      <div className="grid-2">
        <div className="panel">
          <h2>Catalog</h2>
          {roles.map((r) => (
            <button
              key={r.id}
              className={`btn ghost`}
              style={{ display: "block", width: "100%", marginBottom: 8, textAlign: "left", borderColor: roleId === r.id ? "var(--brand)" : undefined }}
              onClick={() => setRoleId(r.id)}
            >
              <strong>{r.title}</strong>
              <div className="muted">{r.levelKey} · {r.track} · {r.expectations.length} expectations</div>
            </button>
          ))}
        </div>
        <div className="panel">
          <h2>{selected?.title ?? "Select a role"}</h2>
          <p>{selected?.summary}</p>
          <ol>
            {selected?.expectations.map((e) => (
              <li key={e.id}>
                <span className="flag">{e.kind}</span> {e.text}
                <div className="mono muted">{e.id}</div>
              </li>
            ))}
          </ol>
          {selected && selected.nextRoleKeys.length > 0 && (
            <p className="muted">Next keys: {selected.nextRoleKeys.join(", ")}</p>
          )}
        </div>
      </div>
      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          await api("/api/roles/assign", {
            method: "POST",
            body: JSON.stringify({
              personId,
              roleDefinitionId: roleId,
              targetNextRoleDefinitionId: nextId || null,
            }),
          });
          await load();
        }}
      >
        <h2>Assign role</h2>
        <div className="grid-2">
          <div className="field">
            <label>Person</label>
            <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Current role</label>
            <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Target next (optional)</label>
            <select value={nextId} onChange={(e) => setNextId(e.target.value)}>
              <option value="">—</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
          </div>
        </div>
        <button className="btn">Save assignment</button>
      </form>
    </div>
  );
}
