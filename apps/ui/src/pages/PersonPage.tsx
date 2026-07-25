import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { CycleDTO, PersonDTO } from "@prm/shared";
import { api, getToken } from "../lib/api";
import { NextStep, PageHeader } from "../components/PageChrome";

export function PersonPage() {
  const { id } = useParams();
  const [person, setPerson] = useState<PersonDTO | null>(null);
  const [cycles, setCycles] = useState<CycleDTO[]>([]);
  const [dossier, setDossier] = useState<{
    goals: Array<{ id: string; title: string; status: string }>;
    achievements: Array<{ id: string; title: string; occurredAt: string; description: string | null }>;
    feedback: Array<{ id: string; fromName: string | null; body: string; kind: string }>;
    documents: Array<{ id: string; title: string; filename: string; visibility: string; occurredAt: string }>;
  } | null>(null);
  const [achTitle, setAchTitle] = useState("");
  const [goalTitle, setGoalTitle] = useState("");
  const [fbBody, setFbBody] = useState("");
  const [fbFrom, setFbFrom] = useState("");
  const [fbKind, setFbKind] = useState("coaching");
  const [docTitle, setDocTitle] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docMsg, setDocMsg] = useState<string | null>(null);
  const [captureMsg, setCaptureMsg] = useState<string | null>(null);

  async function load() {
    if (!id) return;
    setPerson(await api<PersonDTO>(`/api/people/${id}`));
    setDossier(await api(`/api/people/${id}/dossier`));
    setCycles(await api<CycleDTO[]>("/api/cycles"));
  }

  useEffect(() => {
    load();
  }, [id]);

  if (!person || !dossier) return <p>Loading…</p>;

  const evidenceCount = dossier.achievements.length + dossier.feedback.length + dossier.documents.length;
  const thin = evidenceCount < 2;
  const activeCycle = cycles[0];
  const needsRole = !person.roleDefinitionId;

  return (
    <div className="stack">
      <PageHeader
        title={person.name}
        job={`${person.title ?? "No title"} · ${person.levelKey ?? "—"} · Role: ${person.roleTitle ?? "unassigned"}${person.targetNextRoleTitle ? ` → ${person.targetNextRoleTitle}` : ""}`}
        primary={
          needsRole ? (
            <Link className="btn" to="/roles">Assign role</Link>
          ) : activeCycle ? (
            <Link className="btn" to={`/cycles/${activeCycle.id}/write/${person.id}`}>Write review</Link>
          ) : (
            <Link className="btn" to="/cycles">Open a cycle</Link>
          )
        }
        secondary={<Link className="btn secondary" to="/team">Back to team</Link>}
      />

      {needsRole ? (
        <NextStep
          tone="warn"
          label="Assign a role before writing"
          detail="Current RoleDefinition text is the evaluation bar. Optional next-role enables promo gaps."
          action={<Link className="btn" to="/roles">Assign role</Link>}
        />
      ) : thin ? (
        <NextStep
          tone="brand"
          label="Capture this week’s evidence"
          detail="Add at least one achievement, feedback note, or document so the writing desk has citations — not vibes."
          action={<a className="btn" href="#capture-achievements">Add achievement</a>}
        />
      ) : (
        <NextStep
          tone="ok"
          label={`${evidenceCount} evidence items on file`}
          detail="Keep adding as work lands. When the cycle opens, import self/peer bundles then draft from Home."
          action={
            activeCycle ? (
              <Link className="btn" to={`/cycles/${activeCycle.id}/write/${person.id}`}>Open writing desk</Link>
            ) : (
              <Link className="btn" to="/cycles">Manage cycles</Link>
            )
          }
        />
      )}

      <div className="grid-2">
        <div className="panel" id="capture-achievements">
          <h2>Achievements</h2>
          <ul>
            {dossier.achievements.map((a) => (
              <li key={a.id}><strong>{a.title}</strong> <span className="muted">({a.occurredAt})</span></li>
            ))}
          </ul>
          <form
            className="row"
            onSubmit={async (e) => {
              e.preventDefault();
              await api(`/api/people/${id}/achievements`, { method: "POST", body: JSON.stringify({ title: achTitle }) });
              setAchTitle("");
              setCaptureMsg("Achievement saved");
              await load();
            }}
          >
            <input value={achTitle} onChange={(e) => setAchTitle(e.target.value)} placeholder="Shipped X / unblocked Y…" required />
            <button className="btn">Add achievement</button>
          </form>
        </div>
        <div className="panel">
          <h2>Goals</h2>
          <ul>
            {dossier.goals.map((g) => (
              <li key={g.id}><strong>{g.title}</strong> <span className="flag">{g.status}</span></li>
            ))}
          </ul>
          <form
            className="row"
            onSubmit={async (e) => {
              e.preventDefault();
              await api(`/api/people/${id}/goals`, { method: "POST", body: JSON.stringify({ title: goalTitle }) });
              setGoalTitle("");
              setCaptureMsg("Goal saved");
              await load();
            }}
          >
            <input value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} placeholder="Outcome-oriented goal" required />
            <button className="btn">Add goal</button>
          </form>
        </div>
      </div>

      <div className="panel stack">
        <h2>Feedback</h2>
        <p className="muted">EM-entered notes from 1:1s, partners, or incidents. Author names stay on your workspace.</p>
        {dossier.feedback.length === 0 && <p className="muted">No feedback yet — capture a coaching or praise note.</p>}
        {dossier.feedback.map((f) => (
          <p key={f.id}><strong>{f.fromName ?? "Someone"}</strong> ({f.kind}): {f.body}</p>
        ))}
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            await api(`/api/people/${id}/feedback`, {
              method: "POST",
              body: JSON.stringify({ body: fbBody, fromName: fbFrom || undefined, kind: fbKind }),
            });
            setFbBody("");
            setFbFrom("");
            setCaptureMsg("Feedback saved");
            await load();
          }}
        >
          <div className="grid-2">
            <div className="field">
              <label>From (optional)</label>
              <input value={fbFrom} onChange={(e) => setFbFrom(e.target.value)} placeholder="Peer / partner name" />
            </div>
            <div className="field">
              <label>Kind</label>
              <select value={fbKind} onChange={(e) => setFbKind(e.target.value)}>
                <option value="coaching">Coaching</option>
                <option value="praise">Praise</option>
                <option value="incident">Incident</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Note</label>
            <textarea value={fbBody} onChange={(e) => setFbBody(e.target.value)} placeholder="Specific, behavioral…" required />
          </div>
          <button className="btn">Add feedback</button>
        </form>
      </div>

      <div className="panel stack">
        <h2>Documents</h2>
        <p className="muted">PDF/DOCX/PPTX/CSV/images — allowlisted. Sealed into the encrypted vault when you lock the workspace.</p>
        <ul>
          {(dossier.documents ?? []).map((d) => (
            <li key={d.id}>
              <strong>{d.title}</strong> <span className="muted">({d.filename} · {d.visibility} · {d.occurredAt})</span>{" "}
              <a href={`/api/documents/${d.id}/download`} onClick={(e) => {
                e.preventDefault();
                fetch(`/api/documents/${d.id}/download`, { headers: { "x-prm-token": getToken() ?? "" } })
                  .then((r) => r.blob())
                  .then((blob) => {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = d.filename;
                    a.click();
                  });
              }}>Download</a>
            </li>
          ))}
        </ul>
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!docFile || !id) return;
            const fd = new FormData();
            fd.append("file", docFile);
            fd.append("title", docTitle || docFile.name);
            fd.append("visibility", "em_and_subject");
            fd.append("occurredAt", new Date().toISOString().slice(0, 10));
            const res = await fetch(`/api/people/${id}/documents`, {
              method: "POST",
              headers: { "x-prm-token": getToken() ?? "" },
              body: fd,
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({ error: "Upload failed" }));
              setDocMsg((err as { error?: string }).error ?? "Upload failed");
              return;
            }
            setDocMsg("Uploaded");
            setCaptureMsg("Document uploaded");
            setDocFile(null);
            setDocTitle("");
            await load();
          }}
        >
          <div className="field"><label>Title</label><input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="Optional title" /></div>
          <div className="field"><label>File</label><input type="file" onChange={(e) => setDocFile(e.target.files?.[0] ?? null)} required /></div>
          <button className="btn" disabled={!docFile}>Upload document</button>
          {docMsg && <p className="muted">{docMsg}</p>}
        </form>
      </div>

      {captureMsg && <p className="muted">{captureMsg}</p>}

      {person.targetNextRoleTitle && (
        <NextStep
          tone="brand"
          label={`Promotion track: ${person.targetNextRoleTitle}`}
          detail="Performance rating and promotion packet stay separate — open a packet when readiness is in play."
          action={<Link className="btn" to="/promotions">Start promotion packet</Link>}
        />
      )}
    </div>
  );
}
