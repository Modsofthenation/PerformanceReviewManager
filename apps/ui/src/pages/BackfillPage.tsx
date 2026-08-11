import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { NextStep, PageHeader } from "../components/PageChrome";

type ThinItem = {
  personId: string;
  name: string;
  title: string | null;
  roleTitle: string | null;
  achievementCount: number;
  feedbackCount: number;
  documentCount: number;
  goalCount: number;
  evidenceCount: number;
  thin: boolean;
};

export function BackfillPage() {
  const [items, setItems] = useState<ThinItem[]>([]);
  const [thinCount, setThinCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [achTitle, setAchTitle] = useState("");
  const [achDesc, setAchDesc] = useState("");
  const [fbBody, setFbBody] = useState("");
  const [fbFrom, setFbFrom] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await api<{ thinCount: number; items: ThinItem[] }>("/api/workspace/thin-dossiers");
    setItems(res.items);
    setThinCount(res.thinCount);
    if (!selectedId && res.items[0]) setSelectedId(res.items[0].personId);
    setError(null);
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  const selected = items.find((i) => i.personId === selectedId) ?? null;

  async function addAchievement() {
    if (!selectedId || !achTitle.trim()) return;
    await api(`/api/people/${selectedId}/achievements`, {
      method: "POST",
      body: JSON.stringify({ title: achTitle.trim(), description: achDesc.trim() || undefined }),
    });
    setAchTitle("");
    setAchDesc("");
    setMsg(`Achievement added for ${selected?.name}`);
    await load();
  }

  async function addFeedback() {
    if (!selectedId || !fbBody.trim()) return;
    await api(`/api/people/${selectedId}/feedback`, {
      method: "POST",
      body: JSON.stringify({
        body: fbBody.trim(),
        fromName: fbFrom.trim() || undefined,
        kind: "coaching",
      }),
    });
    setFbBody("");
    setFbFrom("");
    setMsg(`Feedback note added for ${selected?.name}`);
    await load();
  }

  return (
    <div className="stack">
      <PageHeader
        title="Evidence backfill"
        job="Fill thin dossiers before writing — cold-start captures beat blank desks. Pair with MCP bulk load for Jira/Google sweeps."
        primary={<Link className="btn secondary" to="/team">Open team</Link>}
      />

      {thinCount > 0 ? (
        <NextStep
          tone="brand"
          label={`${thinCount} direct${thinCount === 1 ? "" : "s"} still thin`}
          detail="Fewer than 2 achievements/feedback/docs. Add a few outcomes per person, or use Cursor MCP prm_bulk_load_evidence."
          action={<Link className="btn secondary" to="/chat">Ask AI Chat what to capture</Link>}
        />
      ) : (
        <NextStep
          tone="ok"
          label="Dossiers look populated"
          detail="Every direct has at least two evidence items. Keep capturing year-round."
          action={<Link className="btn secondary" to="/">Back to command center</Link>}
        />
      )}

      {error && <p className="chat-error" style={{ padding: 0 }}>{error}</p>}
      {msg && <p className="muted">{msg}</p>}

      <div className="grid-2">
        <div className="panel stack">
          <h2>Directs by evidence density</h2>
          <ul className="backfill-list">
            {items.map((i) => (
              <li key={i.personId}>
                <button
                  type="button"
                  className={`backfill-person${selectedId === i.personId ? " on" : ""}`}
                  onClick={() => setSelectedId(i.personId)}
                >
                  <span>
                    <strong>{i.name}</strong>
                    <span className="muted"> · {i.roleTitle ?? "no role"}</span>
                  </span>
                  <span className={i.thin ? "flag" : "muted"}>
                    {i.evidenceCount} item{i.evidenceCount === 1 ? "" : "s"}
                    {i.thin ? " · thin" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            MCP tip: unlock with <code>prm_unlock</code>, then <code>prm_bulk_load_evidence</code> (or prompt{" "}
            <code>prm_bulk_ingest_playbook</code>). See packages/mcp README.
          </p>
        </div>

        <div className="panel stack">
          <h2>{selected ? `Quick capture — ${selected.name}` : "Select a person"}</h2>
          {selected && (
            <>
              <p className="muted">
                Achievements {selected.achievementCount} · Feedback {selected.feedbackCount} · Docs{" "}
                {selected.documentCount} · Goals {selected.goalCount}
              </p>
              <div className="field">
                <label>Achievement</label>
                <input
                  value={achTitle}
                  onChange={(e) => setAchTitle(e.target.value)}
                  placeholder="Shipped X / unblocked Y…"
                />
                <textarea
                  value={achDesc}
                  onChange={(e) => setAchDesc(e.target.value)}
                  placeholder="Optional detail / metrics"
                  rows={2}
                />
                <button className="btn" type="button" onClick={() => void addAchievement()}>
                  Add achievement
                </button>
              </div>
              <div className="field">
                <label>Feedback / note</label>
                <input
                  value={fbFrom}
                  onChange={(e) => setFbFrom(e.target.value)}
                  placeholder="From (optional)"
                />
                <textarea
                  value={fbBody}
                  onChange={(e) => setFbBody(e.target.value)}
                  placeholder="Praise, coaching, or partner note…"
                  rows={3}
                />
                <button className="btn secondary" type="button" onClick={() => void addFeedback()}>
                  Add feedback
                </button>
              </div>
              <Link className="btn ghost" to={`/team/${selected.personId}`}>
                Full dossier
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
