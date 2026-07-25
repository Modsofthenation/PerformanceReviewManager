import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { PersonDTO, RoleDefinitionDTO } from "@prm/shared";
import { api } from "../lib/api";
import { NextStep, PageHeader } from "../components/PageChrome";

export function RolesPage() {
  const [roles, setRoles] = useState<RoleDefinitionDTO[]>([]);
  const [people, setPeople] = useState<PersonDTO[]>([]);
  const [personId, setPersonId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [nextId, setNextId] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  async function load() {
    const [r, p] = await Promise.all([
      api<RoleDefinitionDTO[]>("/api/roles"),
      api<PersonDTO[]>("/api/people"),
    ]);
    setRoles(r.filter(Boolean) as RoleDefinitionDTO[]);
    const directs = p.filter((x) => x.managerId);
    setPeople(directs);
    const unassigned = directs.find((x) => !x.roleDefinitionId);
    if (!personId) setPersonId(unassigned?.id ?? directs[0]?.id ?? "");
    if (!roleId && r[0]) setRoleId(r[0]!.id);
  }

  useEffect(() => {
    load();
  }, []);

  const selected = roles.find((r) => r.id === roleId);
  const unassigned = useMemo(() => people.filter((p) => !p.roleDefinitionId), [people]);
  const selectedPerson = people.find((p) => p.id === personId);

  return (
    <div className="stack">
      <PageHeader
        title="Role frameworks"
        job="Pick a RoleDefinition for each direct — that text is the bar for current-role fit and next-level comparison."
        primary={
          <button
            className="btn"
            form="assign-role-form"
            type="submit"
            disabled={!personId || !roleId}
          >
            Save assignment
          </button>
        }
        secondary={<Link className="btn secondary" to="/team">View team</Link>}
      />

      {unassigned.length > 0 ? (
        <NextStep
          tone="warn"
          label={`Assign ${unassigned[0].name} first`}
          detail={`${unassigned.length} direct${unassigned.length === 1 ? "" : "s"} still unassigned. Choose current role${unassigned[0].targetNextRoleTitle ? "" : " and optional next"}, then save.`}
          action={
            <button
              className="btn"
              type="button"
              onClick={() => setPersonId(unassigned[0].id)}
            >
              Select {unassigned[0].name}
            </button>
          }
        />
      ) : people.length > 0 ? (
        <NextStep
          tone="ok"
          label="All directs have roles"
          detail="Update assignments when levels change, then capture evidence on dossiers or export cycle bundles."
          action={<Link className="btn" to="/">Go to command center</Link>}
        />
      ) : (
        <NextStep
          tone="warn"
          label="Add people before assigning roles"
          detail="Create dossier subjects on Team, then return here to tag each with a RoleDefinition."
          action={<Link className="btn" to="/team">Add people</Link>}
        />
      )}

      <div className="grid-2">
        <div className="panel">
          <h2>Catalog</h2>
          {roles.length === 0 && <p className="muted">No published roles — init/seed the workspace first.</p>}
          {roles.map((r) => (
            <button
              key={r.id}
              className="btn ghost"
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
        id="assign-role-form"
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
          const name = people.find((p) => p.id === personId)?.name ?? "Person";
          setSaved(`Saved role for ${name}`);
          await load();
        }}
      >
        <h2>Assign role</h2>
        <p className="muted">
          {selectedPerson
            ? `Editing ${selectedPerson.name}${selectedPerson.roleTitle ? ` (currently ${selectedPerson.roleTitle})` : " (unassigned)"}.`
            : "Select a person."}
        </p>
        <div className="grid-2">
          <div className="field">
            <label>Person</label>
            <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.roleDefinitionId ? "" : " · needs role"}
                </option>
              ))}
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
        <div className="cta-primary-row">
          <button className="btn" disabled={!personId || !roleId}>Save assignment</button>
          {saved && <span className="muted">{saved}</span>}
        </div>
      </form>
    </div>
  );
}
