import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type {
  PersonDTO,
  RoleDefinitionDTO,
  RoleDraftDTO,
  RoleFrameworkInfo,
} from "@prm/shared";
import { api, authHeaders, apiUrl } from "../lib/api";
import { NextStep, PageHeader, Section } from "../components/PageChrome";
import { PageSectionsLayout } from "../components/PageSectionsLayout";
import { AppSelect } from "../components/AppSelect";

type ExpectationEdit = { id?: string; kind: "responsibility" | "expectation"; text: string };

const LEVEL_PRESETS = ["IC1", "IC2", "IC3", "IC4", "IC5", "IC6", "L1", "M1", "M2", "M3"];

type AssignDraft = { roleId: string; nextId: string };

function emptyEditor(): {
  id?: string;
  key: string;
  title: string;
  track: "ic" | "manager" | "other";
  levelKey: string;
  summary: string;
  nextRoleKeys: string;
  expectations: ExpectationEdit[];
} {
  return {
    key: "",
    title: "",
    track: "ic",
    levelKey: "IC3",
    summary: "",
    nextRoleKeys: "",
    expectations: [{ kind: "responsibility", text: "" }],
  };
}

function draftsFromPeople(people: PersonDTO[]): Record<string, AssignDraft> {
  const out: Record<string, AssignDraft> = {};
  for (const p of people) {
    out[p.id] = {
      roleId: p.roleDefinitionId ?? "",
      nextId: p.targetNextRoleDefinitionId ?? "",
    };
  }
  return out;
}

export function RolesPage() {
  const [roles, setRoles] = useState<RoleDefinitionDTO[]>([]);
  const [people, setPeople] = useState<PersonDTO[]>([]);
  const [framework, setFramework] = useState<RoleFrameworkInfo | null>(null);
  const [assignDrafts, setAssignDrafts] = useState<Record<string, AssignDraft>>({});
  const [roleId, setRoleId] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [editor, setEditor] = useState(emptyEditor());
  const [editing, setEditing] = useState(false);
  const [extractText, setExtractText] = useState("");
  const [useAi, setUseAi] = useState(true);
  const [drafts, setDrafts] = useState<RoleDraftDTO[]>([]);
  const [extractMeta, setExtractMeta] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [fwOwner, setFwOwner] = useState("");
  const [fwFrom, setFwFrom] = useState("");
  const [fwTo, setFwTo] = useState("");
  const [migrateLabel, setMigrateLabel] = useState("");
  const [keyMapText, setKeyMapText] = useState("{}");
  const [showAdvanced, setShowAdvanced] = useState(false);

  async function load() {
    const [r, p, fw] = await Promise.all([
      api<RoleDefinitionDTO[]>("/api/roles"),
      api<PersonDTO[]>("/api/people"),
      api<RoleFrameworkInfo | Record<string, null>>("/api/roles/framework"),
    ]);
    const roleList = r.filter(Boolean) as RoleDefinitionDTO[];
    setRoles(roleList);
    const directs = p.filter((x) => x.managerId);
    setPeople(directs);
    setAssignDrafts(draftsFromPeople(directs));
    if (fw && "versionId" in fw && fw.versionId) {
      const info = fw as RoleFrameworkInfo;
      setFramework(info);
      setFwOwner(info.ownerName ?? "");
      setFwFrom(info.effectiveFrom ?? "");
      setFwTo(info.effectiveTo ?? "");
    } else setFramework(null);
    if (!roleId && roleList[0]) setRoleId(roleList[0].id);
  }

  useEffect(() => {
    void load();
  }, []);

  const selected = roles.find((r) => r.id === roleId);
  const unassigned = useMemo(() => people.filter((p) => !p.roleDefinitionId), [people]);

  function startCreate() {
    setEditor(emptyEditor());
    setEditing(true);
    setMsg(null);
    document.getElementById("roles-catalog")?.scrollIntoView({ block: "start" });
  }

  function startEdit(role: RoleDefinitionDTO) {
    setEditor({
      id: role.id,
      key: role.key,
      title: role.title,
      track: role.track,
      levelKey: role.levelKey ?? "",
      summary: role.summary ?? "",
      nextRoleKeys: role.nextRoleKeys.join(", "),
      expectations: role.expectations.length
        ? role.expectations.map((e) => ({ id: e.id, kind: e.kind, text: e.text }))
        : [{ kind: "responsibility", text: "" }],
    });
    setEditing(true);
    setRoleId(role.id);
    setMsg(null);
    document.getElementById("roles-catalog")?.scrollIntoView({ block: "start" });
  }

  async function saveAssignment(personId: string) {
    const draft = assignDrafts[personId];
    if (!draft?.roleId) return;
    setRowBusy(personId);
    setSaved(null);
    try {
      await api("/api/roles/assign", {
        method: "POST",
        body: JSON.stringify({
          personId,
          roleDefinitionId: draft.roleId,
          targetNextRoleDefinitionId: draft.nextId || null,
        }),
      });
      const name = people.find((p) => p.id === personId)?.name ?? "Person";
      setSaved(`Saved role for ${name}`);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Assignment failed");
    } finally {
      setRowBusy(null);
    }
  }

  async function saveRole(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const payload = {
        key: editor.key || undefined,
        title: editor.title,
        track: editor.track,
        levelKey: editor.levelKey || null,
        summary: editor.summary || null,
        nextRoleKeys: editor.nextRoleKeys
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        expectations: editor.expectations.filter((x) => x.text.trim()),
      };
      const savedRole = editor.id
        ? await api<RoleDefinitionDTO>(`/api/roles/${editor.id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          })
        : await api<RoleDefinitionDTO>("/api/roles", {
            method: "POST",
            body: JSON.stringify(payload),
          });
      setMsg(editor.id ? "Role updated" : "Role created");
      setEditing(false);
      setRoleId(savedRole.id);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRole(role: RoleDefinitionDTO) {
    if (!confirm(`Delete role “${role.title}”? People must be reassigned first if it is in use.`)) return;
    setBusy(true);
    try {
      await api(`/api/roles/${role.id}`, { method: "DELETE" });
      setMsg("Role deleted");
      if (roleId === role.id) setRoleId("");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFramework(file: File) {
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const headers = authHeaders();
      const res = await fetch(apiUrl("/api/roles/framework/upload"), { method: "POST", headers, body: fd });
      const json = (await res.json()) as {
        error?: string;
        textPreview?: string | null;
        extractError?: string | null;
        filename?: string;
      };
      if (!res.ok) throw new Error(json.error || "Upload failed");
      if (json.textPreview) setExtractText(json.textPreview);
      setMsg(
        json.extractError
          ? `Stored ${json.filename}. ${json.extractError}`
          : `Stored ${json.filename}. Review text below, then extract.`,
      );
      setShowAdvanced(true);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function runExtract() {
    if (!extractText.trim()) return;
    setBusy(true);
    setMsg(null);
    setExtractMeta(null);
    try {
      const result = await api<{
        roles: RoleDraftDTO[];
        mode: string;
        model?: string | null;
        warning?: string | null;
      }>("/api/roles/extract", {
        method: "POST",
        body: JSON.stringify({ text: extractText, useAi }),
      });
      setDrafts(result.roles);
      setExtractMeta(
        `${result.mode}${result.model ? ` · ${result.model}` : ""}${result.warning ? ` — ${result.warning}` : ""}`,
      );
      setMsg(`Extracted ${result.roles.length} role(s) — review, then apply.`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Extract failed");
    } finally {
      setBusy(false);
    }
  }

  async function applyDrafts(replace: boolean) {
    if (!drafts.length) return;
    setBusy(true);
    try {
      const result = await api<{ created: RoleDefinitionDTO[] }>("/api/roles/import", {
        method: "POST",
        body: JSON.stringify({ roles: drafts, replace }),
      });
      setMsg(replace ? `Replaced catalog (${result.created.length} roles)` : `Added ${result.created.length} roles`);
      setDrafts([]);
      if (result.created[0]) setRoleId(result.created[0].id);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  function nextOptionsFor(roleDefinitionId: string) {
    const role = roles.find((r) => r.id === roleDefinitionId);
    if (!role?.nextRoleKeys.length) return roles;
    const keyed = roles.filter((r) => role.nextRoleKeys.includes(r.key));
    return keyed.length ? keyed : roles;
  }

  return (
    <div className="stack">
      <PageHeader
        title="Roles"
        job="Primary job: assign each direct a current role. Editing the catalog is secondary — only when the ladder itself changes."
        secondary={<Link className="btn secondary" to="/team">View team</Link>}
      />

      {framework && (
        <p className="muted" style={{ margin: 0 }}>
          Framework: <strong>{framework.frameworkName}</strong> · {framework.versionLabel} · {framework.roleCount}{" "}
          roles
          {framework.sourceFilename ? ` · ${framework.sourceFilename}` : ""}
        </p>
      )}

      {msg && <p className="muted">{msg}</p>}
      {saved && (
        <p role="status" style={{ margin: 0, color: "var(--ok)" }}>
          {saved}
        </p>
      )}

      {unassigned.length > 0 ? (
        <NextStep
          tone="warn"
          label={`${unassigned.length} direct${unassigned.length === 1 ? "" : "s"} still need a role`}
          detail="Use Assign people below — not the catalog. Pick current (+ optional next) and Save each row."
          action={
            <a className="btn" href="#roles-assign">
              Go to assignments
            </a>
          }
        />
      ) : people.length > 0 ? (
        <NextStep
          tone="ok"
          label="All directs have roles"
          detail="Change anyone in Assign people anytime. Browse catalog only when responsibilities or levels change."
          action={<Link className="btn" to="/">Go to command center</Link>}
        />
      ) : (
        <NextStep
          tone="warn"
          label="Add people before assigning roles"
          detail="Create dossier subjects on Team, then return here to assign roles."
          action={<Link className="btn" to="/team">Add people</Link>}
        />
      )}

      <PageSectionsLayout
        sections={[
          { id: "roles-assign", label: "1. Assign people" },
          { id: "roles-catalog", label: "2. Browse catalog" },
          { id: "roles-advanced", label: "3. Advanced" },
        ]}
      >
        <Section
          id="roles-assign"
          title="1. Assign people"
          when="This is the main action on this page — tag each direct with a role from the loaded framework."
          how="Choose current role and optional next-level target, then Save on that row. Unassigned people are marked."
        >
          {people.length === 0 ? (
            <p className="muted">
              No directs yet. <Link to="/team">Add people on Team</Link>, then assign roles here.
            </p>
          ) : roles.length === 0 ? (
            <p className="muted">
              No roles in the catalog yet. Open Advanced to extract a framework, or add a role under Browse catalog.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="table table-cards">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Current role</th>
                    <th>Next role (optional)</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {people.map((p) => {
                    const draft = assignDrafts[p.id] ?? { roleId: "", nextId: "" };
                    const needs = !p.roleDefinitionId;
                    const dirty =
                      draft.roleId !== (p.roleDefinitionId ?? "") ||
                      draft.nextId !== (p.targetNextRoleDefinitionId ?? "");
                    return (
                      <tr key={p.id}>
                        <td data-label="Person">
                          <Link to={`/team/${p.id}`}>
                            <strong>{p.name}</strong>
                          </Link>
                          {needs ? (
                            <div>
                              <span className="status-pill warn">needs role</span>
                            </div>
                          ) : (
                            <div className="muted">{p.roleTitle ?? "—"}</div>
                          )}
                        </td>
                        <td data-label="Current role">
                          <AppSelect
                            value={draft.roleId}
                            onChange={(roleDefinitionId) => {
                              const nexts = nextOptionsFor(roleDefinitionId);
                              const keepNext = nexts.some((r) => r.id === draft.nextId);
                              setAssignDrafts((prev) => ({
                                ...prev,
                                [p.id]: {
                                  roleId: roleDefinitionId,
                                  nextId: keepNext ? draft.nextId : "",
                                },
                              }));
                            }}
                            options={[
                              { value: "", label: needs ? "Select role…" : "—" },
                              ...roles.map((r) => ({
                                value: r.id,
                                label: `${r.levelKey ? `${r.levelKey} · ` : ""}${r.title}`,
                              })),
                            ]}
                          />
                        </td>
                        <td data-label="Next role">
                          <AppSelect
                            value={draft.nextId}
                            disabled={!draft.roleId}
                            onChange={(v) =>
                              setAssignDrafts((prev) => ({
                                ...prev,
                                [p.id]: { ...draft, nextId: v },
                              }))
                            }
                            options={[
                              { value: "", label: "—" },
                              ...nextOptionsFor(draft.roleId).map((r) => ({
                                value: r.id,
                                label: `${r.levelKey ? `${r.levelKey} · ` : ""}${r.title}`,
                              })),
                            ]}
                          />
                        </td>
                        <td data-label="">
                          <button
                            type="button"
                            className="btn secondary"
                            disabled={rowBusy === p.id || !draft.roleId || (!needs && !dirty)}
                            onClick={() => void saveAssignment(p.id)}
                          >
                            {rowBusy === p.id ? "Saving…" : needs ? "Assign" : "Save"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section
          id="roles-catalog"
          title="2. Browse catalog"
          when="Optional — read the ladder bar, or edit a definition when responsibilities change."
          how="Selecting or editing roles here does not assign people. Use Assign people above for that."
          action={
            <button className="btn secondary" type="button" onClick={startCreate}>
              Add role definition
            </button>
          }
        >
          <div className="grid-2">
            <div className="stack" style={{ gap: "0.35rem" }}>
              {roles.length === 0 && <p className="muted">No roles yet.</p>}
              {roles.map((r) => (
                <button
                  key={r.id}
                  className="btn ghost"
                  type="button"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    borderColor: roleId === r.id ? "var(--brand)" : undefined,
                  }}
                  onClick={() => {
                    setRoleId(r.id);
                    setEditing(false);
                  }}
                >
                  <strong>
                    {r.levelKey ? `${r.levelKey} · ` : ""}
                    {r.title}
                  </strong>
                  <div className="muted">
                    {r.track} · {r.expectations.length} expectations
                  </div>
                </button>
              ))}
            </div>
            <div className="stack">
              {selected ? (
                <>
                  <h3 style={{ margin: 0 }}>{selected.title}</h3>
                  <p className="muted" style={{ margin: 0 }}>
                    {selected.levelKey ?? "—"} · {selected.track}
                    {selected.nextRoleKeys.length > 0 ? ` · next: ${selected.nextRoleKeys.join(", ")}` : ""}
                  </p>
                  <p>{selected.summary}</p>
                  <ol>
                    {selected.expectations.map((e) => (
                      <li key={e.id}>
                        <span className="flag">{e.kind}</span> {e.text}
                      </li>
                    ))}
                  </ol>
                  <div className="cta-primary-row">
                    <button className="btn secondary" type="button" onClick={() => startEdit(selected)}>
                      Edit role
                    </button>
                    <button
                      className="btn secondary"
                      type="button"
                      disabled={busy}
                      onClick={() => void deleteRole(selected)}
                    >
                      Delete
                    </button>
                  </div>
                </>
              ) : (
                <p className="muted">Pick a role from the list to inspect its expectations.</p>
              )}
            </div>
          </div>

          {editing && (
            <form className="panel" onSubmit={saveRole} style={{ marginTop: "1rem" }}>
              <h2 style={{ marginTop: 0 }}>{editor.id ? "Edit role" : "Add role"}</h2>
              <p className="muted">
                Changes here update the framework definition — they do not assign people. Use Assign roles above for
                that.
              </p>
              <div className="grid-2">
                <div className="field">
                  <label>Title</label>
                  <input
                    value={editor.title}
                    onChange={(e) => setEditor({ ...editor, title: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label>Level</label>
                  <input
                    list="level-presets"
                    value={editor.levelKey}
                    onChange={(e) => setEditor({ ...editor, levelKey: e.target.value })}
                    placeholder="IC4"
                  />
                  <datalist id="level-presets">
                    {LEVEL_PRESETS.map((l) => (
                      <option key={l} value={l} />
                    ))}
                  </datalist>
                </div>
                <div className="field">
                  <label>Track</label>
                  <AppSelect
                    value={editor.track}
                    onChange={(v) =>
                      setEditor({ ...editor, track: v as "ic" | "manager" | "other" })
                    }
                    isSearchable={false}
                    options={[
                      { value: "ic", label: "IC" },
                      { value: "manager", label: "Manager" },
                      { value: "other", label: "Other" },
                    ]}
                  />
                </div>
                <div className="field">
                  <label>Key (optional)</label>
                  <input
                    value={editor.key}
                    onChange={(e) => setEditor({ ...editor, key: e.target.value })}
                    placeholder="eng_ic4"
                  />
                </div>
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <label>Summary</label>
                  <textarea
                    rows={2}
                    value={editor.summary}
                    onChange={(e) => setEditor({ ...editor, summary: e.target.value })}
                  />
                </div>
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <label>Next role keys (comma-separated)</label>
                  <input
                    value={editor.nextRoleKeys}
                    onChange={(e) => setEditor({ ...editor, nextRoleKeys: e.target.value })}
                    placeholder="eng_ic5"
                  />
                </div>
              </div>
              <h3>Expectations</h3>
              {editor.expectations.map((exp, idx) => (
                <div className="grid-2" key={idx} style={{ marginBottom: "0.5rem" }}>
                  <div className="field">
                    <label>Kind</label>
                    <AppSelect
                      value={exp.kind}
                      onChange={(v) => {
                        const next = [...editor.expectations];
                        next[idx] = {
                          ...exp,
                          kind: v === "expectation" ? "expectation" : "responsibility",
                        };
                        setEditor({ ...editor, expectations: next });
                      }}
                      isSearchable={false}
                      options={[
                        { value: "responsibility", label: "Responsibility" },
                        { value: "expectation", label: "Expectation" },
                      ]}
                    />
                  </div>
                  <div className="field">
                    <label>Text</label>
                    <input
                      value={exp.text}
                      onChange={(e) => {
                        const next = [...editor.expectations];
                        next[idx] = { ...exp, text: e.target.value };
                        setEditor({ ...editor, expectations: next });
                      }}
                      required={idx === 0}
                    />
                  </div>
                </div>
              ))}
              <div className="cta-primary-row">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() =>
                    setEditor({
                      ...editor,
                      expectations: [...editor.expectations, { kind: "responsibility", text: "" }],
                    })
                  }
                >
                  Add expectation
                </button>
                <button className="btn" disabled={busy || !editor.title.trim()}>
                  {editor.id ? "Save role changes" : "Create role"}
                </button>
                <button type="button" className="btn secondary" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </Section>

        <Section
          id="roles-advanced"
          title="3. Advanced"
          when="Only when replacing the ladder, extracting from a new R&R doc, or migrating a framework year."
          how="Expand tools below. Day-to-day assignment does not need this section."
          action={
            <button type="button" className="btn secondary" onClick={() => setShowAdvanced((v) => !v)}>
              {showAdvanced ? "Hide tools" : "Show extract & migrate"}
            </button>
          }
        >
          {!showAdvanced ? (
            <p className="muted" style={{ margin: 0 }}>
              Framework extract, metadata, and year migration stay tucked away so Assign stays the primary path.
            </p>
          ) : (
            <div className="stack">
              {framework && (
                <div className="panel stack">
                  <h3 style={{ margin: 0 }}>Framework metadata</h3>
                  <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
                    <div className="field">
                      <label>Owner</label>
                      <input
                        value={fwOwner}
                        onChange={(e) => setFwOwner(e.target.value)}
                        placeholder="People team / EM"
                      />
                    </div>
                    <div className="field">
                      <label>Effective from</label>
                      <input type="date" value={fwFrom} onChange={(e) => setFwFrom(e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Effective to</label>
                      <input type="date" value={fwTo} onChange={(e) => setFwTo(e.target.value)} />
                    </div>
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={busy}
                      onClick={async () => {
                        await api("/api/roles/framework", {
                          method: "PATCH",
                          body: JSON.stringify({
                            ownerName: fwOwner || null,
                            effectiveFrom: fwFrom || null,
                            effectiveTo: fwTo || null,
                          }),
                        });
                        setMsg("Framework metadata saved");
                        await load();
                      }}
                    >
                      Save metadata
                    </button>
                  </div>
                  <h3 style={{ marginBottom: 0 }}>Publish new year (migrate)</h3>
                  <p className="muted" style={{ margin: 0 }}>
                    Clones the published ladder into a new version, remaps assignment keys, and marks the old version
                    superseded.
                  </p>
                  <div className="field">
                    <label>New version label</label>
                    <input
                      value={migrateLabel}
                      onChange={(e) => setMigrateLabel(e.target.value)}
                      placeholder="2027.1"
                    />
                  </div>
                  <div className="field">
                    <label>Key map JSON (optional)</label>
                    <textarea
                      value={keyMapText}
                      onChange={(e) => setKeyMapText(e.target.value)}
                      rows={3}
                      placeholder='{"ic4_swe":"ic4_software"}'
                    />
                  </div>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={busy || !migrateLabel.trim()}
                    onClick={async () => {
                      const keyMap = JSON.parse(keyMapText || "{}") as Record<string, string>;
                      const res = await api<{ remappedAssignments: number; insufficient: string[] }>(
                        "/api/roles/framework/migrate",
                        {
                          method: "POST",
                          body: JSON.stringify({
                            versionLabel: migrateLabel.trim(),
                            keyMap,
                            ownerName: fwOwner || undefined,
                            effectiveFrom: fwFrom || undefined,
                            effectiveTo: fwTo || undefined,
                          }),
                        },
                      );
                      setMsg(`Migrated — remapped ${res.remappedAssignments} assignment(s)`);
                      setMigrateLabel("");
                      await load();
                    }}
                  >
                    Migrate & publish
                  </button>
                </div>
              )}

              <div className="panel stack">
                <h3 style={{ margin: 0 }}>Extract from document</h3>
                <p className="muted" style={{ margin: 0 }}>
                  Upload or paste an R&R / career framework, extract drafts, then add or replace the catalog.
                </p>
                <div className="field">
                  <label htmlFor="fw-file">Framework file</label>
                  <input
                    id="fw-file"
                    type="file"
                    accept=".txt,.md,.csv,.pdf,.docx"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadFramework(f);
                    }}
                  />
                </div>
                <div className="field">
                  <label htmlFor="fw-text">Framework text</label>
                  <textarea
                    id="fw-text"
                    rows={8}
                    value={extractText}
                    onChange={(e) => setExtractText(e.target.value)}
                    placeholder={
                      "# IC4 — Senior Software Engineer\nOwns multi-sprint outcomes.\n\n## Responsibilities\n- Leads design for medium projects\n"
                    }
                  />
                </div>
                <div className="field">
                  <label>
                    <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} /> Use AI when
                    available
                  </label>
                </div>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={busy || !extractText.trim()}
                  onClick={() => void runExtract()}
                >
                  {busy ? "Working…" : "Extract roles & levels"}
                </button>
                {extractMeta && <p className="muted">{extractMeta}</p>}
                {drafts.length > 0 && (
                  <>
                    <h3>Preview ({drafts.length})</h3>
                    <ul>
                      {drafts.map((d) => (
                        <li key={d.key}>
                          <strong>{d.title}</strong>{" "}
                          <span className="muted">
                            {d.levelKey ?? "—"} · {d.track} · {d.expectations.length} items
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="cta-primary-row">
                      <button type="button" className="btn secondary" disabled={busy} onClick={() => void applyDrafts(false)}>
                        Add drafts to catalog
                      </button>
                      <button
                        type="button"
                        className="btn secondary"
                        disabled={busy}
                        onClick={() => void applyDrafts(true)}
                      >
                        Replace catalog with drafts
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </Section>
      </PageSectionsLayout>
    </div>
  );
}
