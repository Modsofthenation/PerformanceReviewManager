import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { PersonDTO } from "@prm/shared";
import { api, getToken } from "../lib/api";

export function PersonPage() {
  const { id } = useParams();
  const [person, setPerson] = useState<PersonDTO | null>(null);
  const [dossier, setDossier] = useState<{
    goals: Array<{ id: string; title: string; status: string }>;
    achievements: Array<{ id: string; title: string; occurredAt: string; description: string | null }>;
    feedback: Array<{ id: string; fromName: string | null; body: string; kind: string }>;
    documents: Array<{ id: string; title: string; filename: string; visibility: string; occurredAt: string }>;
  } | null>(null);
  const [achTitle, setAchTitle] = useState("");
  const [goalTitle, setGoalTitle] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docMsg, setDocMsg] = useState<string | null>(null);

  async function load() {
    if (!id) return;
    setPerson(await api<PersonDTO>(`/api/people/${id}`));
    setDossier(await api(`/api/people/${id}/dossier`));
  }

  useEffect(() => {
    load();
  }, [id]);

  if (!person || !dossier) return <p>Loading…</p>;

  return (
    <div className="stack">
      <div>
        <h1>{person.name}</h1>
        <p>{person.title} · {person.levelKey} · Role: {person.roleTitle ?? "unassigned"}
          {person.targetNextRoleTitle ? ` → ${person.targetNextRoleTitle}` : ""}</p>
      </div>
      <div className="grid-2">
        <div className="panel">
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
              await load();
            }}
          >
            <input value={achTitle} onChange={(e) => setAchTitle(e.target.value)} placeholder="Add achievement" required />
            <button className="btn">Add</button>
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
              await load();
            }}
          >
            <input value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} placeholder="Add goal" required />
            <button className="btn">Add</button>
          </form>
        </div>
      </div>
      <div className="panel stack">
        <h2>Documents</h2>
        <p className="muted">PDF/DOCX/PPTX/CSV/images — allowlisted. Sealed into encrypted vault when you lock the workspace.</p>
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
      <div className="panel">
        <h2>Feedback</h2>
        {dossier.feedback.map((f) => (
          <p key={f.id}><strong>{f.fromName ?? "Someone"}</strong> ({f.kind}): {f.body}</p>
        ))}
      </div>
      {person.targetNextRoleTitle && (
        <Link className="btn secondary" to="/promotions">Open promotions</Link>
      )}
    </div>
  );
}
