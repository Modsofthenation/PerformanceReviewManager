import { useEffect, useState } from "react";
import type { OneOnOneItemDTO, OneOnOneSessionDTO, OneOnOneSessionStatus } from "@prm/shared";
import { api } from "../lib/api";
import { estimateThenConfirm } from "../lib/aiEstimate";
import { Section } from "./PageChrome";

type Props = {
  personId: string;
  personName: string;
  cycleId?: string;
  onCaptureMsg?: (msg: string) => void;
};

export function OneOnOnesPanel({ personId, personName, cycleId, onCaptureMsg }: Props) {
  const [sessions, setSessions] = useState<OneOnOneSessionDTO[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [manualQuestion, setManualQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(preferId?: string | null) {
    const res = await api<{ items: OneOnOneSessionDTO[] }>(`/api/people/${personId}/one-on-ones`);
    setSessions(res.items);
    const next =
      (preferId && res.items.find((s) => s.id === preferId)?.id) ||
      res.items.find((s) => s.status !== "done")?.id ||
      res.items[0]?.id ||
      null;
    setActiveId(next);
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Failed to load 1:1s"));
  }, [personId]);

  const active = sessions.find((s) => s.id === activeId) ?? null;

  async function refreshActive() {
    if (!activeId) {
      await load();
      return;
    }
    await load(activeId);
  }

  async function createSession() {
    setBusy(true);
    setError(null);
    try {
      const created = await api<OneOnOneSessionDTO>(`/api/people/${personId}/one-on-ones`, {
        method: "POST",
        body: JSON.stringify({
          title: title.trim() || `1:1 — ${personName}`,
          occurredAt,
          status: "planned",
        }),
      });
      setTitle("");
      onCaptureMsg?.("1:1 session created");
      await load(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create session");
    } finally {
      setBusy(false);
    }
  }

  async function updateSession(patch: Partial<{ title: string; status: OneOnOneSessionStatus; notes: string | null; occurredAt: string }>) {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/one-on-ones/${active.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await refreshActive();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function addManualQuestion() {
    if (!active || !manualQuestion.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/one-on-ones/${active.id}/items`, {
        method: "POST",
        body: JSON.stringify({ questionText: manualQuestion.trim(), source: "manual" }),
      });
      setManualQuestion("");
      if (active.status === "planned") {
        await api(`/api/one-on-ones/${active.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "in_progress" }),
        });
      }
      onCaptureMsg?.("Question added");
      await refreshActive();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add question");
    } finally {
      setBusy(false);
    }
  }

  async function saveAnswer(item: OneOnOneItemDTO, answerText: string) {
    setError(null);
    try {
      await api(`/api/one-on-one-items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ answerText }),
      });
      await refreshActive();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save answer");
    }
  }

  async function removeItem(itemId: string) {
    setBusy(true);
    try {
      await api(`/api/one-on-one-items/${itemId}`, { method: "DELETE" });
      await refreshActive();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete question");
    } finally {
      setBusy(false);
    }
  }

  async function suggestWithAi() {
    if (!active) return;
    const ok = await estimateThenConfirm(
      "one_on_one_questions",
      { personId, cycleId: cycleId || undefined },
      "Suggest 1:1 questions from dossier evidence",
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{
        questions: string[];
        added: OneOnOneItemDTO[];
        session: OneOnOneSessionDTO;
      }>(`/api/one-on-ones/${active.id}/suggest-questions`, {
        method: "POST",
        body: JSON.stringify({
          cycleId: cycleId || undefined,
          count: 6,
          addToSession: true,
        }),
      });
      onCaptureMsg?.(`Added ${res.added.length} AI-suggested question${res.added.length === 1 ? "" : "s"}`);
      await load(res.session.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI suggest failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      id="person-one-on-ones"
      title="1:1 sessions"
      when="Use to prep and run a 1:1 — capture questions and answers on the dossier."
      how="Start a session, add questions manually, or optionally ask AI for evidence-grounded prompts. Answers stay EM-only."
      action={
        active ? (
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={() => void suggestWithAi()}
          >
            Suggest questions with AI
          </button>
        ) : undefined
      }
    >
      {error && <p className="chat-error" style={{ padding: 0 }}>{error}</p>}

      <div className="row" style={{ flexWrap: "wrap", gap: 8, alignItems: "end" }}>
        <div className="field" style={{ margin: 0, minWidth: 160 }}>
          <label htmlFor="ono-date">Date</label>
          <input id="ono-date" type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0, flex: 1, minWidth: 180 }}>
          <label htmlFor="ono-title">New session title</label>
          <input
            id="ono-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`1:1 — ${personName}`}
          />
        </div>
        <button type="button" className="btn" disabled={busy} onClick={() => void createSession()}>
          Start 1:1 session
        </button>
      </div>

      {sessions.length === 0 ? (
        <p className="muted" style={{ marginBottom: 0 }}>
          No 1:1 sessions yet. Start one to capture an agenda — AI is optional.
        </p>
      ) : (
        <>
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="ono-active">Active session</label>
            <select
              id="ono-active"
              value={activeId ?? ""}
              onChange={(e) => setActiveId(e.target.value || null)}
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.occurredAt} · {s.title} ({s.status}) · {s.items.length} Q
                </option>
              ))}
            </select>
          </div>

          {active && (
            <div className="stack" style={{ gap: "0.85rem" }}>
              <div className="row" style={{ flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <span className={`status-pill ${active.status === "done" ? "ok" : active.status === "in_progress" ? "warn" : ""}`}>
                  {active.status}
                </span>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={busy || active.status === "in_progress"}
                  onClick={() => void updateSession({ status: "in_progress" })}
                >
                  Mark in progress
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={busy || active.status === "done"}
                  onClick={() => void updateSession({ status: "done" })}
                >
                  Mark done
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy}
                  onClick={async () => {
                    if (!window.confirm("Delete this 1:1 session and its Q&A?")) return;
                    setBusy(true);
                    try {
                      await api(`/api/one-on-ones/${active.id}`, { method: "DELETE" });
                      onCaptureMsg?.("1:1 session deleted");
                      await load(null);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Delete failed");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Delete session
                </button>
              </div>

              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="ono-notes">Session notes (optional)</label>
                <textarea
                  id="ono-notes"
                  rows={2}
                  defaultValue={active.notes ?? ""}
                  key={`${active.id}-notes`}
                  placeholder="Follow-ups, vibe, commitments…"
                  onBlur={(e) => {
                    const next = e.target.value;
                    if ((active.notes ?? "") !== next) void updateSession({ notes: next });
                  }}
                />
              </div>

              {active.items.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  No questions yet — add one below, or use AI suggestions from dossier evidence.
                </p>
              ) : (
                <ol className="ono-list">
                  {active.items.map((item, idx) => (
                    <li key={item.id} className="ono-item">
                      <div className="row" style={{ justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                        <strong>
                          Q{idx + 1}. {item.questionText}
                        </strong>
                        <span className="muted" style={{ fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                          {item.source === "ai_suggested" ? "AI" : "manual"}
                        </span>
                      </div>
                      <textarea
                        rows={3}
                        defaultValue={item.answerText ?? ""}
                        key={`${item.id}-ans-${item.updatedAt}`}
                        placeholder="Capture the answer / discussion notes…"
                        onBlur={(e) => {
                          const next = e.target.value;
                          if ((item.answerText ?? "") !== next) void saveAnswer(item, next);
                        }}
                      />
                      <button type="button" className="btn ghost" disabled={busy} onClick={() => void removeItem(item.id)}>
                        Remove question
                      </button>
                    </li>
                  ))}
                </ol>
              )}

              <div className="row" style={{ flexWrap: "wrap", gap: 8, alignItems: "end" }}>
                <div className="field" style={{ margin: 0, flex: 1, minWidth: 220 }}>
                  <label htmlFor="ono-manual-q">Add question manually</label>
                  <input
                    id="ono-manual-q"
                    value={manualQuestion}
                    onChange={(e) => setManualQuestion(e.target.value)}
                    placeholder="What should we dig into?"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void addManualQuestion();
                      }
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={busy || !manualQuestion.trim()}
                  onClick={() => void addManualQuestion()}
                >
                  Add question
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Section>
  );
}
