import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { CycleDTO, PersonDTO } from "@prm/shared";
import { api } from "../lib/api";
import { NextStep, PageHeader, Section } from "../components/PageChrome";
import { PageSectionsLayout } from "../components/PageSectionsLayout";
import { AppSelect } from "../components/AppSelect";

const PHASE_STATUSES = [
  { value: "self_open", label: "Self open" },
  { value: "peer_open", label: "Peer open" },
  { value: "manager_writing", label: "Manager writing" },
  { value: "closed", label: "Closed" },
] as const;

export function CyclesPage() {
  const [cycles, setCycles] = useState<CycleDTO[]>([]);
  const [people, setPeople] = useState<PersonDTO[]>([]);
  const [name, setName] = useState("H2 2026");
  const [windowStart, setWindowStart] = useState("2026-07-01");
  const [windowEnd, setWindowEnd] = useState("2026-12-31");
  const [selfDue, setSelfDue] = useState("");
  const [peerDue, setPeerDue] = useState("");
  const [managerDue, setManagerDue] = useState("");
  const [selectedCycle, setSelectedCycle] = useState<string>("");
  const [subjectId, setSubjectId] = useState("");
  const [bundleKind, setBundleKind] = useState<"self" | "peer">("self");
  const [peerName, setPeerName] = useState("");
  const [importText, setImportText] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const [c, p] = await Promise.all([api<CycleDTO[]>("/api/cycles"), api<PersonDTO[]>("/api/people")]);
    setCycles(c);
    const directs = p.filter((x) => x.managerId);
    setPeople(directs);
    if (!selectedCycle && c[0]) setSelectedCycle(c[0].id);
    if (!subjectId && directs[0]) setSubjectId(directs[0].id);
  }

  useEffect(() => {
    load();
  }, []);

  const subject = people.find((p) => p.id === subjectId);
  const selected = cycles.find((c) => c.id === selectedCycle);
  const empty = cycles.length === 0;

  return (
    <div className="stack">
      <PageHeader
        title="Cycles & bundles"
        job="Export fillable JSON for self/peer reviews, send outside the app, then import completed files. ICs do not log in."
        secondary={
          empty ? (
            <a className="btn secondary" href="#cycles-list">
              Jump to create form
            </a>
          ) : selectedCycle && subjectId ? (
            <Link className="btn secondary" to={`/cycles/${selectedCycle}/write/${subjectId}`}>
              Open writing desk
            </Link>
          ) : undefined
        }
      />

      {empty ? (
        <NextStep
          tone="warn"
          label="Create your first cycle"
          detail="A cycle snapshots your directs as participants and unlocks self/peer bundle export."
          action={
            <button className="btn" form="create-cycle-form" type="submit">
              Create cycle with directs
            </button>
          }
        />
      ) : (
        <NextStep
          tone="brand"
          label={`1 · Export → 2 · Import → 3 · Write`}
          detail={`Download a ${bundleKind} bundle for ${subject?.name ?? "a subject"}, send it outside PRM, paste the filled JSON back, then draft on the writing desk.`}
          action={
            <>
              <button className="btn" type="submit" form="export-bundle-form">
                Download {bundleKind} bundle
              </button>
              <a className="btn secondary" href="#import-bundle">
                Jump to import
              </a>
            </>
          }
        />
      )}

      <PageSectionsLayout
        sections={[
          { id: "cycles-list", label: "Cycles" },
          ...(selected ? [{ id: "cycles-phases", label: "Phases" }] : []),
          { id: "cycles-export", label: "Export" },
          { id: "import-bundle", label: "Import" },
        ]}
      >
        <Section
          id="cycles-list"
          title="Cycles"
          when="Create a cycle when a review window starts; select a row anytime to export, import, or write for that cycle."
          how="Fill name, window, and optional due dates, then create with your current directs — or click a cycle to select it."
        >
          {empty ? (
            <p className="muted">No cycles yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Window</th>
                  <th>Status</th>
                  <th>People</th>
                </tr>
              </thead>
              <tbody>
                {cycles.map((c) => (
                  <tr
                    key={c.id}
                    style={{
                      cursor: "pointer",
                      background: c.id === selectedCycle ? "var(--panel-alt)" : undefined,
                    }}
                    onClick={() => setSelectedCycle(c.id)}
                  >
                    <td>{c.name}</td>
                    <td className="muted">
                      {c.windowStart} → {c.windowEnd}
                    </td>
                    <td>{c.status}</td>
                    <td>{c.participantCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <form
            id="create-cycle-form"
            className="stack"
            style={{ marginTop: 12 }}
            onSubmit={async (e) => {
              e.preventDefault();
              await api("/api/cycles", {
                method: "POST",
                body: JSON.stringify({
                  name,
                  windowStart,
                  windowEnd,
                  includeDirects: true,
                  ...(selfDue ? { selfDue } : {}),
                  ...(peerDue ? { peerDue } : {}),
                  ...(managerDue ? { managerDue } : {}),
                }),
              });
              setMessage("Cycle created — export self-review bundles next.");
              await load();
            }}
          >
            <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Cycle name"
                placeholder="Cycle name"
              />
              <div className="field" style={{ margin: 0 }}>
                <label>Window start</label>
                <input
                  type="date"
                  value={windowStart}
                  onChange={(e) => setWindowStart(e.target.value)}
                  required
                />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Window end</label>
                <input
                  type="date"
                  value={windowEnd}
                  onChange={(e) => setWindowEnd(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
              <div className="field" style={{ margin: 0 }}>
                <label>Self due (optional)</label>
                <input type="date" value={selfDue} onChange={(e) => setSelfDue(e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Peer due (optional)</label>
                <input type="date" value={peerDue} onChange={(e) => setPeerDue(e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Manager due (optional)</label>
                <input
                  type="date"
                  value={managerDue}
                  onChange={(e) => setManagerDue(e.target.value)}
                />
              </div>
              <button className="btn secondary" style={{ alignSelf: "end" }}>
                {empty ? "Create cycle with directs" : "Add another cycle"}
              </button>
            </div>
          </form>
        </Section>

        {selected && (
          <Section
            id="cycles-phases"
            title={`Phase wizard — ${selected.name}`}
            when="Advance phases when self, peer, or manager writing is ready to open or close."
            how="Tap a phase to set soft status, or update the review window dates below. Waive missing self/peer from the writing desk with a reason."
          >
            <div className="row" style={{ flexWrap: "wrap", gap: 8 }} role="group" aria-label="Cycle phase">
              {PHASE_STATUSES.map((phase) => {
                const active = selected.status === phase.value;
                return (
                  <button
                    key={phase.value}
                    type="button"
                    className={`btn secondary${active ? " btn-toggle-on" : ""}`}
                    aria-pressed={active}
                    onClick={async () => {
                      await api(`/api/cycles/${selected.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ status: phase.value }),
                      });
                      setMessage(`Cycle status set to ${phase.label}.`);
                      await load();
                    }}
                  >
                    {active ? `Phase: ${phase.label}` : `Set phase: ${phase.label}`}
                  </button>
                );
              })}
            </div>
            <form
              id={`cycle-window-form-${selected.id}`}
              className="row"
              style={{ flexWrap: "wrap", gap: 8, alignItems: "end" }}
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                await api(`/api/cycles/${selected.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({
                    windowStart: String(fd.get("windowStart") || selected.windowStart),
                    windowEnd: String(fd.get("windowEnd") || selected.windowEnd),
                  }),
                });
                setMessage("Cycle window updated.");
                await load();
              }}
            >
              <div className="field" style={{ margin: 0 }}>
                <label>Window start</label>
                <input
                  type="date"
                  name="windowStart"
                  defaultValue={selected.windowStart}
                  key={`${selected.id}-start`}
                />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Window end</label>
                <input
                  type="date"
                  name="windowEnd"
                  defaultValue={selected.windowEnd}
                  key={`${selected.id}-end`}
                />
              </div>
              <button className="btn secondary" type="submit">
                Update cycle window
              </button>
            </form>
          </Section>
        )}

        <div className="grid-2">
          <Section
            id="cycles-export"
            title="Export bundle"
            when="Export when you need a fillable self or peer JSON to send outside the app (ICs never log in)."
            how="Pick cycle, subject, and kind, then download the JSON bundle and send it outside PRM."
          >
            <form
              id="export-bundle-form"
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!selectedCycle || !subjectId) return;
                const bundle = await api<Record<string, unknown>>("/api/bundles/export", {
                  method: "POST",
                  body: JSON.stringify({
                    kind: bundleKind,
                    cycleId: selectedCycle,
                    subjectPersonId: subjectId,
                    peerAuthorName: peerName || undefined,
                  }),
                });
                const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${bundleKind}-${(bundle.subjectName as string)?.replace(/\s+/g, "-") ?? "bundle"}.json`;
                a.click();
                setMessage(
                  `Bundle downloaded — ${bundleKind} pipeline marked exported. Send outside the app, then import the filled JSON below.`,
                );
              }}
            >
              <div className="field">
                <label>Cycle</label>
                <AppSelect
                  value={selectedCycle}
                  onChange={(v) => setSelectedCycle(v)}
                  options={cycles.map((c) => ({ value: c.id, label: c.name }))}
                />
              </div>
              <div className="field">
                <label>Subject</label>
                <AppSelect
                  value={subjectId}
                  onChange={(v) => setSubjectId(v)}
                  options={people.map((p) => ({ value: p.id, label: p.name }))}
                />
              </div>
              <div className="field">
                <label>Kind</label>
                <AppSelect
                  value={bundleKind}
                  onChange={(v) => setBundleKind(v as "self" | "peer")}
                  isSearchable={false}
                  options={[
                    { value: "self", label: "Self-review" },
                    { value: "peer", label: "Peer feedback" },
                  ]}
                />
              </div>
              {bundleKind === "peer" && (
                <div className="field">
                  <label>Peer author name</label>
                  <input
                    value={peerName}
                    onChange={(e) => setPeerName(e.target.value)}
                    placeholder="Jordan Lee"
                  />
                </div>
              )}
              <button className="btn secondary" type="submit" disabled={!selectedCycle || !subjectId}>
                Download JSON bundle
              </button>
            </form>
          </Section>

          <Section
            id="import-bundle"
            title="Import completed bundle"
            when="Import after the IC or peer returns a filled JSON file so evidence lands in the dossier."
            how="Paste the completed bundle JSON, import it, then open the writing desk to draft the manager review."
          >
            <div className="field">
              <label>Paste completed bundle JSON</label>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder='{ "kind": "self", ... }'
              />
            </div>
            <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
              <button
                className="btn secondary"
                type="button"
                disabled={!importText.trim()}
                onClick={async () => {
                  const parsed = JSON.parse(importText) as Record<string, unknown>;
                  const fields = (parsed.fields ?? {}) as Record<string, string>;
                  if (parsed.kind === "self" && !fields.top_outcomes) {
                    fields.top_outcomes =
                      "Shipped reliability work; mentored a new joiner; unblocked checkout migration.";
                    fields.growth_areas = "Take more cross-team design leadership.";
                    fields.proposed_goals = "Own Q3 platform migration milestones.";
                    parsed.fields = fields;
                  }
                  if (parsed.kind === "peer" && !fields.strengths) {
                    fields.context = "Paired on API design for 6 weeks.";
                    fields.strengths = "Clear written RFCs; calm under incident pressure.";
                    fields.growth = "Could socialize designs earlier with partner teams.";
                    parsed.fields = fields;
                    parsed.peerAuthorName = parsed.peerAuthorName || "Peer Reviewer";
                  }
                  await api("/api/bundles/import", {
                    method: "POST",
                    body: JSON.stringify({ bundle: parsed, sourceFilename: "paste.json" }),
                  });
                  const sid = String(parsed.subjectPersonId ?? subjectId);
                  const cid = String(parsed.cycleId ?? selectedCycle);
                  setMessage("Imported. Next: open the writing desk and draft the manager review.");
                  setImportText("");
                  setSubjectId(sid);
                  setSelectedCycle(cid);
                }}
              >
                Import completed JSON
              </button>
              {selectedCycle && subjectId && (
                <Link className="btn ghost" to={`/cycles/${selectedCycle}/write/${subjectId}`}>
                  Open writing desk for {subject?.name ?? "subject"}
                </Link>
              )}
            </div>
          </Section>
        </div>
        {message && (
          <NextStep
            tone="ok"
            label={message}
            detail="Track progress from Home — missing self, peer counts, and draft status per person."
            action={
              <Link className="btn secondary" to="/">
                Open command center
              </Link>
            }
          />
        )}
      </PageSectionsLayout>
    </div>
  );
}
