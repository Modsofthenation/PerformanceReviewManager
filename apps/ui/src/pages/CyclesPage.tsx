import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { CycleDTO, PersonDTO } from "@prm/shared";
import { api } from "../lib/api";
import { NextStep, PageHeader } from "../components/PageChrome";

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

  return (
    <div className="stack">
      <PageHeader
        title="Cycles & bundles"
        job="Export fillable JSON for self/peer reviews, send outside the app, then import completed files. ICs do not log in."
        primary={
          cycles.length === 0 ? (
            <button className="btn" form="create-cycle-form" type="submit">Create cycle</button>
          ) : (
            <button className="btn" type="submit" form="export-bundle-form">Download JSON bundle</button>
          )
        }
        secondary={selectedCycle && subjectId ? (
          <Link className="btn secondary" to={`/cycles/${selectedCycle}/write/${subjectId}`}>Open writing desk</Link>
        ) : undefined}
      />

      {cycles.length === 0 ? (
        <NextStep
          tone="warn"
          label="Create your first cycle"
          detail="A cycle snapshots your directs as participants and unlocks self/peer bundle export."
          action={<button className="btn" form="create-cycle-form" type="submit">Create cycle (directs)</button>}
        />
      ) : (
        <NextStep
          tone="brand"
          label={`1 · Export → 2 · Import → 3 · Write`}
          detail={`Download a ${bundleKind} bundle for ${subject?.name ?? "a subject"}, send it outside PRM, paste the filled JSON back, then draft on the writing desk.`}
          action={
            <>
              <button className="btn" type="submit" form="export-bundle-form">Download {bundleKind} bundle</button>
              <a className="btn secondary" href="#import-bundle">Jump to import</a>
            </>
          }
        />
      )}

      <div className="panel">
        <h2>Cycles</h2>
        {cycles.length === 0 ? (
          <p className="muted">No cycles yet.</p>
        ) : (
          <table className="table">
            <thead><tr><th>Name</th><th>Window</th><th>Status</th><th>People</th></tr></thead>
            <tbody>
              {cycles.map((c) => (
                <tr
                  key={c.id}
                  style={{ cursor: "pointer", background: c.id === selectedCycle ? "var(--panel-alt)" : undefined }}
                  onClick={() => setSelectedCycle(c.id)}
                >
                  <td>{c.name}</td>
                  <td className="muted">{c.windowStart} → {c.windowEnd}</td>
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
            <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Cycle name" placeholder="Cycle name" />
            <div className="field" style={{ margin: 0 }}>
              <label>Window start</label>
              <input type="date" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} required />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Window end</label>
              <input type="date" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} required />
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
              <input type="date" value={managerDue} onChange={(e) => setManagerDue(e.target.value)} />
            </div>
            <button className="btn secondary" style={{ alignSelf: "end" }}>Create cycle (directs)</button>
          </div>
        </form>
      </div>

      {selected && (
        <div className="panel stack">
          <h2>Phase wizard — {selected.name}</h2>
          <p className="muted">
            Soft gates only: advance phases when ready. Waive missing self/peer from the writing desk with a reason.
          </p>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            {PHASE_STATUSES.map((phase) => (
              <button
                key={phase.value}
                type="button"
                className={`btn ${selected.status === phase.value ? "" : "secondary"}`}
                onClick={async () => {
                  await api(`/api/cycles/${selected.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ status: phase.value }),
                  });
                  setMessage(`Cycle status set to ${phase.label}.`);
                  await load();
                }}
              >
                {phase.label}
              </button>
            ))}
          </div>
          <form
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
              <input type="date" name="windowStart" defaultValue={selected.windowStart} key={`${selected.id}-start`} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Window end</label>
              <input type="date" name="windowEnd" defaultValue={selected.windowEnd} key={`${selected.id}-end`} />
            </div>
            <button className="btn secondary" type="submit">Update window</button>
          </form>
        </div>
      )}

      <div className="grid-2">
        <form
          id="export-bundle-form"
          className="panel stack"
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
          <h2>1. Export bundle</h2>
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
          <button className="btn" disabled={!selectedCycle || !subjectId}>Download JSON bundle</button>
        </form>

        <div className="panel stack" id="import-bundle">
          <h2>2. Import completed bundle</h2>
          <div className="field">
            <label>Paste completed bundle JSON</label>
            <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='{ "kind": "self", ... }' />
          </div>
          <button
            className="btn"
            disabled={!importText.trim()}
            onClick={async () => {
              const parsed = JSON.parse(importText) as Record<string, unknown>;
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
            <Link className="btn secondary" to={`/cycles/${selectedCycle}/write/${subjectId}`}>
              3. Open writing desk for {subject?.name ?? "subject"}
            </Link>
          )}
        </div>
      </div>
      {message && (
        <NextStep
          tone="ok"
          label={message}
          detail="Track progress from Home — missing self, peer counts, and draft status per person."
          action={<Link className="btn" to="/">Open command center</Link>}
        />
      )}
    </div>
  );
}
