import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type {
  PersonDTO,
  RoleDefinitionDTO,
  RoleDraftDTO,
  RoleFrameworkInfo,
} from "@prm/shared";
import { api, getToken, apiUrl } from "../lib/api";
import { NextStep, PageHeader } from "../components/PageChrome";
import { PageSectionsLayout } from "../components/PageSectionsLayout";

type ExpectationEdit = { id?: string; kind: "responsibility" | "expectation"; text: string };

const LEVEL_PRESETS = ["IC3", "IC4", "IC5", "IC6", "M1", "M2", "M3"];

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

export function RolesPage() {
  const [roles, setRoles] = useState<RoleDefinitionDTO[]>([]);
  const [people, setPeople] = useState<PersonDTO[]>([]);
  const [framework, setFramework] = useState<RoleFrameworkInfo | null>(null);
  const [personId, setPersonId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [nextId, setNextId] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [editor, setEditor] = useState(emptyEditor());
  const [editing, setEditing] = useState(false);
  const [extractText, setExtractText] = useState("");
  const [useAi, setUseAi] = useState(true);
  const [drafts, setDrafts] = useState<RoleDraftDTO[]>([]);
  const [extractMeta, setExtractMeta] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fwOwner, setFwOwner] = useState("");
  const [fwFrom, setFwFrom] = useState("");
  const [fwTo, setFwTo] = useState("");
  const [migrateLabel, setMigrateLabel] = useState("");
  const [keyMapText, setKeyMapText] = useState("{}");

  async function load() {
    const [r, p, fw] = await Promise.all([
      api<RoleDefinitionDTO[]>("/api/roles"),
      api<PersonDTO[]>("/api/people"),
      api<RoleFrameworkInfo | Record<string, null>>("/api/roles/framework"),
    ]);
    setRoles(r.filter(Boolean) as RoleDefinitionDTO[]);
    const directs = p.filter((x) => x.managerId);
    setPeople(directs);
    if (fw && "versionId" in fw && fw.versionId) {
      const info = fw as RoleFrameworkInfo;
      setFramework(info);
      setFwOwner(info.ownerName ?? "");
      setFwFrom(info.effectiveFrom ?? "");
      setFwTo(info.effectiveTo ?? "");
    } else setFramework(null);
    const unassigned = directs.find((x) => !x.roleDefinitionId);
    if (!personId) setPersonId(unassigned?.id ?? directs[0]?.id ?? "");
    if (!roleId && r[0]) setRoleId(r[0]!.id);
  }

  useEffect(() => {
    void load();
  }, []);

  const selected = roles.find((r) => r.id === roleId);
  const unassigned = useMemo(() => people.filter((p) => !p.roleDefinitionId), [people]);
  const selectedPerson = people.find((p) => p.id === personId);

  function startCreate() {
    setEditor(emptyEditor());
    setEditing(true);
    setMsg(null);
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
  }

  async function saveRole(e: React.FormEvent) {
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
      const headers: HeadersInit = {};
      const token = getToken();
      if (token) headers["x-prm-token"] = token;
      if (typeof window !== "undefined" && window.__PRM_LAUNCH_TOKEN__) {
        headers["x-prm-launch-token"] = window.__PRM_LAUNCH_TOKEN__;
      }
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
        model: string | null;
        warning: string | null;
      }>("/api/roles/extract", {
        method: "POST",
        body: JSON.stringify({ text: extractText, useAi }),
      });
      setDrafts(result.roles);
      setExtractMeta(
        `${result.mode}${result.model ? ` · ${result.model}` : ""}${result.warning ? ` · ${result.warning}` : ""}`,
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
      setMsg(`Imported ${result.created.length} role(s)`);
      setDrafts([]);
      if (result.created[0]) setRoleId(result.created[0].id);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <PageHeader
        title="Role frameworks"
        job="Author RoleDefinitions and levels, extract from an R&R doc, then assign each direct."
        primary={
          <button className="btn" type="button" onClick={startCreate}>
            Add role
          </button>
        }
        secondary={<Link className="btn secondary" to="/team">View team</Link>}
      />

      {framework && (
        <div className="panel stack">
          <p className="muted" style={{ margin: 0 }}>
            {framework.frameworkName} · {framework.versionLabel} · {framework.roleCount} roles
            {framework.sourceFilename ? ` · source ${framework.sourceFilename}` : ""}
          </p>
          {framework.insufficient?.length ? (
            <NextStep
              tone="warn"
              label="Framework insufficient"
              detail={framework.insufficient.slice(0, 4).join(" ")}
            />
          ) : (
            <NextStep tone="ok" label="Framework looks complete" detail="Owner, dates, and migration live below." />
          )}
          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            <div className="field">
              <label>Owner</label>
              <input value={fwOwner} onChange={(e) => setFwOwner(e.target.value)} placeholder="People team / EM" />
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
            Clones the published ladder into a new version, remaps assignment keys, and marks the old version superseded.
          </p>
          <div className="field">
            <label>New version label</label>
            <input value={migrateLabel} onChange={(e) => setMigrateLabel(e.target.value)} placeholder="2027.1" />
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
            className="btn"
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

      {msg && <p className="muted">{msg}</p>}

      {unassigned.length > 0 ? (
        <NextStep
          tone="warn"
          label={`Assign ${unassigned[0].name} first`}
          detail={`${unassigned.length} direct${unassigned.length === 1 ? "" : "s"} still unassigned. Choose current role and optional next, then save.`}
          action={
            <button className="btn" type="button" onClick={() => setPersonId(unassigned[0].id)}>
              Select {unassigned[0].name}
            </button>
          }
        />
      ) : people.length > 0 ? (
        <NextStep
          tone="ok"
          label="All directs have roles"
          detail="Update the catalog when your ladder changes, or extract from a new framework doc."
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

      <PageSectionsLayout
        sections={[
          { id: "roles-catalog", label: "Catalog" },
          { id: "roles-detail", label: "Detail" },
          { id: "roles-extract", label: "Extract" },
          { id: "roles-assign", label: "Assign" },
        ]}
      >
      <div className="grid-2 page-section" id="roles-catalog">
        <div className="panel">
          <h2>Catalog</h2>
          {roles.length === 0 && <p className="muted">No roles yet — add one or extract from a document.</p>}
          {roles.map((r) => (
            <button
              key={r.id}
              className="btn ghost"
              type="button"
              style={{
                display: "block",
                width: "100%",
                marginBottom: 8,
                textAlign: "left",
                borderColor: roleId === r.id ? "var(--brand)" : undefined,
              }}
              onClick={() => {
                setRoleId(r.id);
                setEditing(false);
              }}
            >
              <strong>{r.title}</strong>
              <div className="muted">
                {r.levelKey ?? "—"} · {r.track} · {r.expectations.length} expectations
              </div>
            </button>
          ))}
        </div>
        <div className="panel page-section" id="roles-detail">
          <h2>{selected?.title ?? "Select a role"}</h2>
          {selected ? (
            <>
              <p>{selected.summary}</p>
              <ol>
                {selected.expectations.map((e) => (
                  <li key={e.id}>
                    <span className="flag">{e.kind}</span> {e.text}
                    <div className="mono muted">{e.id}</div>
                  </li>
                ))}
              </ol>
              {selected.nextRoleKeys.length > 0 && (
                <p className="muted">Next keys: {selected.nextRoleKeys.join(", ")}</p>
              )}
              <div className="cta-primary-row">
                <button className="btn secondary" type="button" onClick={() => startEdit(selected)}>
                  Edit role
                </button>
                <button className="btn secondary" type="button" disabled={busy} onClick={() => void deleteRole(selected)}>
                  Delete
                </button>
              </div>
            </>
          ) : (
            <p className="muted">Pick a role from the catalog or create one.</p>
          )}
        </div>
      </div>

      {editing && (
        <form className="panel" onSubmit={saveRole}>
          <h2>{editor.id ? "Edit role" : "Add role"}</h2>
          <p className="muted">Levels are the coarse ladder key (IC4, M1, …). Expectations are the evaluation bar.</p>
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
              <select
                value={editor.track}
                onChange={(e) =>
                  setEditor({ ...editor, track: e.target.value as "ic" | "manager" | "other" })
                }
              >
                <option value="ic">IC</option>
                <option value="manager">Manager</option>
                <option value="other">Other</option>
              </select>
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
                <select
                  value={exp.kind}
                  onChange={(e) => {
                    const next = [...editor.expectations];
                    next[idx] = {
                      ...exp,
                      kind: e.target.value === "expectation" ? "expectation" : "responsibility",
                    };
                    setEditor({ ...editor, expectations: next });
                  }}
                >
                  <option value="responsibility">Responsibility</option>
                  <option value="expectation">Expectation</option>
                </select>
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
              {editor.id ? "Save changes" : "Create role"}
            </button>
            <button type="button" className="btn secondary" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="panel page-section" id="roles-extract">
        <h2>Extract from document</h2>
        <p className="muted">
          Upload an R&amp;R / career framework file (.txt/.md preferred; PDF/DOCX best-effort), or paste text.
          With AI enabled this proposes RoleDefinitions; otherwise a local markdown/CSV parser runs.
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
            placeholder={"# IC4 — Senior Software Engineer\nOwns multi-sprint outcomes.\n\n## Responsibilities\n- Leads design for medium projects\n"}
          />
        </div>
        <div className="field">
          <label>
            <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} /> Use AI when
            available
          </label>
        </div>
        <div className="cta-primary-row">
          <button type="button" className="btn" disabled={busy || !extractText.trim()} onClick={() => void runExtract()}>
            {busy ? "Working…" : "Extract roles & levels"}
          </button>
        </div>
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
              <button type="button" className="btn" disabled={busy} onClick={() => void applyDrafts(false)}>
                Add to catalog
              </button>
              <button type="button" className="btn secondary" disabled={busy} onClick={() => void applyDrafts(true)}>
                Replace catalog
              </button>
            </div>
          </>
        )}
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
                  {p.name}
                  {p.roleDefinitionId ? "" : " · needs role"}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Current role</label>
            <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Target next (optional)</label>
            <select value={nextId} onChange={(e) => setNextId(e.target.value)}>
              <option value="">—</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="cta-primary-row">
          <button className="btn" disabled={!personId || !roleId}>
            Save assignment
          </button>
          {saved && <span className="muted">{saved}</span>}
        </div>
      </form>
      </PageSectionsLayout>
    </div>
  );
}
