import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { PersonDTO } from "@prm/shared";
import { api } from "../lib/api";
import { NextStep, PageHeader } from "../components/PageChrome";

type CycleRow = {
  id: string;
  name: string;
  status: string;
};

type AiSettings = {
  enabled: boolean;
  provider: string;
  localOnly: boolean;
  hasApiKey: boolean;
};

type ChatRole = "user" | "assistant";

type ChatTurn = {
  id: string;
  role: ChatRole;
  content: string;
  model?: string;
  error?: boolean;
};

const WORKSPACE_SUGGESTIONS = [
  "Who has thin evidence or an unassigned role?",
  "Summarize promotion readiness signals across the team.",
  "What achievements and feedback stand out for my strongest direct?",
  "Where are goals off-track, and what should I ask in 1:1s?",
];

const PERSON_SUGGESTIONS = [
  "Summarize this person's strongest evidence with citations.",
  "What are the main growth areas vs the current role bar?",
  "Is there enough evidence for a promotion case discussion?",
  "What should I ask in the next 1:1?",
];

function newId() {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatPage() {
  const [people, setPeople] = useState<PersonDTO[]>([]);
  const [cycles, setCycles] = useState<CycleRow[]>([]);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [personId, setPersonId] = useState("");
  const [cycleId, setCycleId] = useState("");
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [p, c, s] = await Promise.all([
          api<PersonDTO[]>("/api/people"),
          api<CycleRow[]>("/api/cycles"),
          api<AiSettings>("/api/ai/settings"),
        ]);
        setPeople(p);
        setCycles(c);
        setSettings(s);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load chat");
      }
    })();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  const aiReady =
    Boolean(settings?.enabled) &&
    (settings?.localOnly || settings?.provider === "ollama" || settings?.hasApiKey);

  const scopeLabel = personId
    ? people.find((p) => p.id === personId)?.name ?? "selected person"
    : "entire workspace";

  const suggestions = personId ? PERSON_SUGGESTIONS : WORKSPACE_SUGGESTIONS;

  async function sendMessage(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    if (!aiReady) {
      setError("Enable AI and configure a provider in Settings before chatting.");
      return;
    }

    const userTurn: ChatTurn = { id: newId(), role: "user", content };
    const nextHistory = [...messages, userTurn];
    setMessages(nextHistory);
    setDraft("");
    setSending(true);
    setError(null);

    try {
      const payload = nextHistory
        .filter((m) => !m.error)
        .map((m) => ({ role: m.role, content: m.content }));
      const res = await api<{
        reply: string;
        model: string;
        scopeLabel: string;
      }>("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: payload,
          personId: personId || null,
          cycleId: cycleId || null,
        }),
      });
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "assistant", content: res.reply, model: res.model },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Chat failed";
      setError(msg);
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "assistant", content: msg, error: true },
      ]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void sendMessage(draft);
  }

  function clearChat() {
    setMessages([]);
    setError(null);
  }

  if (error && !settings) {
    return (
      <div className="stack">
        <PageHeader title="AI Chat" job="Ask grounded questions over workspace evidence." />
        <NextStep
          tone="warn"
          label="Could not load chat"
          detail={error}
          action={<button className="btn" type="button" onClick={() => window.location.reload()}>Retry</button>}
        />
      </div>
    );
  }

  return (
    <div className="stack chat-page">
      <PageHeader
        title="AI Chat"
        job="Query people, roles, cycles, and dossier evidence. Answers cite ids and stay grounded — nothing is written into reviews."
        primary={
          messages.length > 0 ? (
            <button type="button" className="btn secondary" onClick={clearChat} disabled={sending}>
              Clear chat
            </button>
          ) : undefined
        }
        secondary={<Link className="btn ghost" to="/settings">AI settings</Link>}
      />

      {!settings ? (
        <p>Loading…</p>
      ) : !aiReady ? (
        <NextStep
          tone="warn"
          label="AI is not ready"
          detail="Turn on AI in Settings, then add an API key — or use Ollama / local-only mode."
          action={<Link className="btn" to="/settings">Open Settings</Link>}
        />
      ) : (
        <NextStep
          tone="ok"
          label={`Chatting over ${scopeLabel}`}
          detail="Scope the conversation to one person for a deep dossier read, or keep workspace-wide for team questions. Optional cycle includes self/peer imports."
          action={<Link className="btn secondary" to="/team">Open dossiers</Link>}
        />
      )}

      <div className="panel chat-scope">
        <div className="row chat-scope-row">
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label htmlFor="chat-person">Person scope</label>
            <select
              id="chat-person"
              value={personId}
              onChange={(e) => {
                setPersonId(e.target.value);
                clearChat();
              }}
              disabled={sending}
            >
              <option value="">Entire workspace</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.title ? ` — ${p.title}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label htmlFor="chat-cycle">Cycle (optional)</label>
            <select
              id="chat-cycle"
              value={cycleId}
              onChange={(e) => {
                setCycleId(e.target.value);
                clearChat();
              }}
              disabled={sending}
            >
              <option value="">No cycle filter</option>
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.status})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="panel chat-shell">
        <div className="chat-transcript" role="log" aria-live="polite">
          {messages.length === 0 && !sending ? (
            <div className="chat-empty">
              <p className="chat-empty-title">Ask anything about loaded workbench data</p>
              <p className="muted">
                Evidence digests, role gaps, and promotion drafts still live on the writing desk.
                This chat is for freeform Q&amp;A over the same sources.
              </p>
              <div className="chat-suggestions">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="chat-suggestion"
                    disabled={!aiReady || sending}
                    onClick={() => void sendMessage(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`chat-bubble chat-bubble-${m.role}${m.error ? " chat-bubble-error" : ""}`}
              >
                <div className="chat-bubble-meta">
                  {m.role === "user" ? "You" : "Assistant"}
                  {m.model ? <span className="muted"> · {m.model}</span> : null}
                </div>
                <div className="chat-bubble-body">{m.content}</div>
              </div>
            ))
          )}
          {sending ? (
            <div className="chat-bubble chat-bubble-assistant chat-bubble-pending">
              <div className="chat-bubble-meta">Assistant</div>
              <div className="chat-bubble-body">Reading evidence…</div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <form className="chat-composer" onSubmit={onSubmit}>
          <div className="field" style={{ marginBottom: 0, flex: 1 }}>
            <label htmlFor="chat-input" className="sr-only">
              Message
            </label>
            <textarea
              id="chat-input"
              ref={inputRef}
              rows={3}
              value={draft}
              disabled={!aiReady || sending}
              placeholder={
                aiReady
                  ? `Ask about ${scopeLabel}…`
                  : "Configure AI in Settings to start chatting"
              }
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage(draft);
                }
              }}
            />
          </div>
          <button className="btn" type="submit" disabled={!aiReady || sending || !draft.trim()}>
            {sending ? "Sending…" : "Send"}
          </button>
        </form>
        {error && messages.length > 0 ? <p className="chat-error">{error}</p> : null}
      </div>
    </div>
  );
}
