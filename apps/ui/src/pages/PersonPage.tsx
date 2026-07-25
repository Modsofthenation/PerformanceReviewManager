import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { PersonDTO } from "@prm/shared";
import { api } from "../lib/api";

export function PersonPage() {
  const { id } = useParams();
  const [person, setPerson] = useState<PersonDTO | null>(null);
  const [dossier, setDossier] = useState<{
    goals: Array<{ id: string; title: string; status: string }>;
    achievements: Array<{ id: string; title: string; occurredAt: string; description: string | null }>;
    feedback: Array<{ id: string; fromName: string | null; body: string; kind: string }>;
  } | null>(null);
  const [achTitle, setAchTitle] = useState("");
  const [goalTitle, setGoalTitle] = useState("");

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
      <div className="panel">
        <h2>Feedback</h2>
        {dossier.feedback.map((f) => (
          <p key={f.id}><strong>{f.fromName ?? "Someone"}</strong> ({f.kind}): {f.body}</p>
        ))}
      </div>
    </div>
  );
}
