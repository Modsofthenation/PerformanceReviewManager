import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { CycleDTO, PersonDTO } from "@prm/shared";
import { api } from "../lib/api";

export function CyclesPage() {
  const [cycles, setCycles] = useState<CycleDTO[]>([]);
  const [people, setPeople] = useState<PersonDTO[]>([]);
  const [name, setName] = useState("H2 2026");
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

  return (
    <div className="stack">
      <div>
        <h1>Cycles & bundles</h1>
        <p>Export fillable JSON bundles for self/peer reviews, then import the completed files. No live IC login in v1.</p>
      </div>
      <div className="panel">
        <h2>Cycles</h2>
        <table className="table">
          <thead><tr><th>Name</th><th>Window</th><th>Status</th><th>People</th></tr></thead>
          <tbody>
            {cycles.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td className="muted">{c.windowStart} → {c.windowEnd}</td>
                <td>{c.status}</td>
                <td>{c.participantCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <form
          className="row"
          style={{ marginTop: 12 }}
          onSubmit={async (e) => {
            e.preventDefault();
            await api("/api/cycles", {
              method: "POST",
              body: JSON.stringify({ name, windowStart: "2026-07-01", windowEnd: "2026-12-31", includeDirects: true }),
            });
            await load();
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn">Create cycle (directs)</button>
        </form>
      </div>

      <div className="grid-2">
        <div className="panel stack">
          <h2>Export bundle</h2>
          <div className="field">
            <label>Cycle</label>
            <select value={selectedCycle} onChange={(e) => setSelectedCycle(e.target.value)}>
              {cycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Subject</label>
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Kind</label>
            <select value={bundleKind} onChange={(e) => setBundleKind(e.target.value as "self" | "peer")}>
              <option value="self">Self-review</option>
              <option value="peer">Peer feedback</option>
            </select>
          </div>
          {bundleKind === "peer" && (
            <div className="field">
              <label>Peer author name</label>
              <input value={peerName} onChange={(e) => setPeerName(e.target.value)} placeholder="Jordan Lee" />
            </div>
          )}
          <button
            className="btn"
            onClick={async () => {
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
              setMessage("Bundle downloaded — send outside the app, then import the filled JSON.");
            }}
          >
            Download JSON bundle
          </button>
        </div>

        <div className="panel stack">
          <h2>Import bundle</h2>
          <div className="field">
            <label>Paste completed bundle JSON</label>
            <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='{ "kind": "self", ... }' />
          </div>
          <button
            className="btn"
            onClick={async () => {
              const parsed = JSON.parse(importText) as Record<string, unknown>;
              // demo fill if empty fields
              const fields = (parsed.fields ?? {}) as Record<string, string>;
              if (parsed.kind === "self" && !fields.top_outcomes) {
                fields.top_outcomes = "Shipped reliability work; mentored a new joiner; unblocked checkout migration.";
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
              setMessage("Imported. Open Writing desk from Home.");
              setImportText("");
            }}
          >
            Import
          </button>
          {selectedCycle && subjectId && (
            <Link className="btn secondary" to={`/cycles/${selectedCycle}/write/${subjectId}`}>Open writing desk</Link>
          )}
        </div>
      </div>
      {message && <p className="panel">{message}</p>}
    </div>
  );
}
