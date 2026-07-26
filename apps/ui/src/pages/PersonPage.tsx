import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type {
  ConcernLogDTO,
  CycleDTO,
  IntegrationProvider,
  IntegrationRemoteUser,
  IntegrationSyncResult,
  MeetingSummaryDTO,
  PersonDTO,
  PersonExternalLinkDTO,
  PersonTimelineDTO,
} from "@prm/shared";
import { api, getToken, apiUrl } from "../lib/api";
import { NextStep, PageHeader } from "../components/PageChrome";

export function PersonPage() {
  const { id } = useParams();
  const [person, setPerson] = useState<PersonDTO | null>(null);
  const [cycles, setCycles] = useState<CycleDTO[]>([]);
  const [dossier, setDossier] = useState<{
    goals: Array<{ id: string; title: string; status: string }>;
    achievements: Array<{
      id: string;
      title: string;
      occurredAt: string;
      description: string | null;
      sourceProvider?: string | null;
      externalUrl?: string | null;
    }>;
    feedback: Array<{ id: string; fromName: string | null; body: string; kind: string; themes?: string[] }>;
    documents: Array<{ id: string; title: string; filename: string; visibility: string; occurredAt: string }>;
  } | null>(null);
  const [achTitle, setAchTitle] = useState("");
  const [goalTitle, setGoalTitle] = useState("");
  const [fbBody, setFbBody] = useState("");
  const [fbFrom, setFbFrom] = useState("");
  const [fbKind, setFbKind] = useState("coaching");
  const [fbThemes, setFbThemes] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docMsg, setDocMsg] = useState<string | null>(null);
  const [captureMsg, setCaptureMsg] = useState<string | null>(null);
  const [concerns, setConcerns] = useState<ConcernLogDTO[]>([]);
  const [meetings, setMeetings] = useState<MeetingSummaryDTO[]>([]);
  const [meetTitle, setMeetTitle] = useState("");
  const [meetTranscript, setMeetTranscript] = useState("");
  const [meetConsent, setMeetConsent] = useState(false);
  const [meetUseAi, setMeetUseAi] = useState(false);
  const [concernTitle, setConcernTitle] = useState("");
  const [concernBody, setConcernBody] = useState("");
  const [concernExpectation, setConcernExpectation] = useState("");
  const [concernPlan, setConcernPlan] = useState("");
  const [extLinks, setExtLinks] = useState<PersonExternalLinkDTO[]>([]);
  const [linkProvider, setLinkProvider] = useState<IntegrationProvider>("jira");
  const [linkQuery, setLinkQuery] = useState("");
  const [linkResults, setLinkResults] = useState<IntegrationRemoteUser[]>([]);
  const [linkMsg, setLinkMsg] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [timeline, setTimeline] = useState<PersonTimelineDTO | null>(null);

  async function load() {
    if (!id) return;
    setPerson(await api<PersonDTO>(`/api/people/${id}`));
    setDossier(await api(`/api/people/${id}/dossier`));
    setCycles(await api<CycleDTO[]>("/api/cycles"));
    try {
      const res = await api<{ items: ConcernLogDTO[] }>(`/api/people/${id}/concerns`);
      setConcerns(res.items);
    } catch {
      setConcerns([]);
    }
    try {
      setMeetings(await api<MeetingSummaryDTO[]>(`/api/people/${id}/meeting-summaries`));
    } catch {
      setMeetings([]);
    }
    try {
      const links = await api<{ items: PersonExternalLinkDTO[] }>(`/api/people/${id}/external-links`);
      setExtLinks(links.items);
    } catch {
      setExtLinks([]);
    }
    try {
      setTimeline(await api<PersonTimelineDTO>(`/api/people/${id}/timeline`));
    } catch {
      setTimeline(null);
    }
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

      <div className="panel stack" id="timeline">
        <h2 style={{ margin: 0 }}>Timeline</h2>
        <p className="muted" style={{ margin: 0 }}>
          Chronological dossier, reviews, concerns, and rating decisions. Use this to prep a 1:1 or reconstruct
          why the story changed.
        </p>
        {!timeline || timeline.entries.length === 0 ? (
          <p className="muted">No timeline events yet.</p>
        ) : (
          <ul className="timeline-list person-timeline">
            {timeline.entries.slice(0, 40).map((e, idx) => (
              <li key={`${e.kind}-${e.sourceId ?? idx}-${e.at}`}>
                <span className="mono muted">{e.at}</span>{" "}
                <span className="flag">{e.kind}</span> <strong>{e.title}</strong>
                {e.detail ? <div className="muted">{e.detail}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel stack" id="integrations">
        <h2>Jira & Bitbucket</h2>
        <p className="muted">
          Link remote accounts, then pull tickets / merged PRs into achievements. Configure credentials in{" "}
          <Link to="/settings">Settings → Integrations</Link>.
        </p>
        {extLinks.length === 0 ? (
          <p className="muted">No external accounts linked yet.</p>
        ) : (
          <ul>
            {extLinks.map((l) => (
              <li key={l.id} style={{ marginBottom: 8 }}>
                <strong>{l.provider}</strong> — {l.externalDisplayName ?? l.externalAccountId}
                {l.externalEmail ? <span className="muted"> · {l.externalEmail}</span> : null}
                {l.externalUsername ? <span className="muted"> · @{l.externalUsername}</span> : null}{" "}
                <button
                  type="button"
                  className="btn ghost"
                  onClick={async () => {
                    await api(`/api/people/${id}/external-links/${l.provider}`, { method: "DELETE" });
                    await load();
                  }}
                >
                  Unlink
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="row" style={{ flexWrap: "wrap", gap: 8, alignItems: "end" }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Provider</label>
            <select
              value={linkProvider}
              onChange={(e) => setLinkProvider(e.target.value as IntegrationProvider)}
            >
              <option value="jira">Jira</option>
              <option value="bitbucket">Bitbucket</option>
            </select>
          </div>
          <div className="field" style={{ margin: 0, flex: 1, minWidth: 180 }}>
            <label>Search remote users</label>
            <input
              value={linkQuery}
              onChange={(e) => setLinkQuery(e.target.value)}
              placeholder={person.email ?? person.name}
            />
          </div>
          <button
            type="button"
            className="btn secondary"
            onClick={async () => {
              const q = linkQuery.trim() || person.email || person.name;
              try {
                const res = await api<{ items: IntegrationRemoteUser[] }>(
                  `/api/integrations/${linkProvider}/users?q=${encodeURIComponent(q)}`,
                );
                setLinkResults(res.items);
                setLinkMsg(res.items.length ? null : "No users found");
              } catch (e) {
                setLinkResults([]);
                setLinkMsg(e instanceof Error ? e.message : "Search failed");
              }
            }}
          >
            Search
          </button>
          <button
            type="button"
            className="btn"
            disabled={syncBusy || extLinks.length === 0}
            onClick={async () => {
              setSyncBusy(true);
              try {
                const res = await api<IntegrationSyncResult>(`/api/people/${id}/integrations/sync`, {
                  method: "POST",
                  body: "{}",
                });
                const parts = [
                  !res.jira.skipped
                    ? `Jira +${res.jira.imported}/~${res.jira.updated}${res.jira.error ? ` (${res.jira.error})` : ""}`
                    : null,
                  !res.bitbucket.skipped
                    ? `BB +${res.bitbucket.imported}/~${res.bitbucket.updated}${
                        res.bitbucket.error ? ` (${res.bitbucket.error})` : ""
                      }`
                    : null,
                ].filter(Boolean);
                setLinkMsg(parts.join(" · ") || "Nothing synced");
                setCaptureMsg("Integration sync finished");
                await load();
              } catch (e) {
                setLinkMsg(e instanceof Error ? e.message : "Sync failed");
              } finally {
                setSyncBusy(false);
              }
            }}
          >
            Sync linked accounts
          </button>
        </div>
        {linkResults.length > 0 && (
          <ul>
            {linkResults.map((u) => (
              <li key={u.accountId} className="row" style={{ gap: 8, marginBottom: 6 }}>
                <span>
                  {u.displayName}
                  {u.email ? <span className="muted"> · {u.email}</span> : null}
                  {u.username ? <span className="muted"> · @{u.username}</span> : null}
                </span>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={async () => {
                    await api(`/api/people/${id}/external-links/${linkProvider}`, {
                      method: "PUT",
                      body: JSON.stringify({
                        externalAccountId: u.accountId,
                        externalDisplayName: u.displayName,
                        externalEmail: u.email ?? null,
                        externalUsername: u.username ?? null,
                      }),
                    });
                    setLinkResults([]);
                    setLinkMsg(`Linked ${linkProvider} → ${u.displayName}`);
                    await load();
                  }}
                >
                  Link
                </button>
              </li>
            ))}
          </ul>
        )}
        {linkMsg && <p className="muted">{linkMsg}</p>}
      </div>

      <div className="grid-2">
        <div className="panel" id="capture-achievements">
          <h2>Achievements</h2>
          <ul>
            {dossier.achievements.map((a) => (
              <li key={a.id}>
                <strong>{a.title}</strong> <span className="muted">({a.occurredAt})</span>
                {a.sourceProvider ? <span className="flag"> {a.sourceProvider}</span> : null}
                {a.externalUrl ? (
                  <>
                    {" "}
                    <a href={a.externalUrl} target="_blank" rel="noreferrer">
                      open
                    </a>
                  </>
                ) : null}
              </li>
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
          <p key={f.id}>
            <strong>{f.fromName ?? "Someone"}</strong> ({f.kind})
            {f.themes && f.themes.length > 0 ? (
              <span className="muted"> · {f.themes.join(", ")}</span>
            ) : null}
            : {f.body}
          </p>
        ))}
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const themes = fbThemes
              .split(/[,;]/)
              .map((t) => t.trim())
              .filter(Boolean);
            await api(`/api/people/${id}/feedback`, {
              method: "POST",
              body: JSON.stringify({
                body: fbBody,
                fromName: fbFrom || undefined,
                kind: fbKind,
                themes: themes.length ? themes : undefined,
              }),
            });
            setFbBody("");
            setFbFrom("");
            setFbThemes("");
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
                <option value="coaching">Coaching / 1:1</option>
                <option value="praise">Praise</option>
                <option value="incident">Incident</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>1:1 themes (comma-separated)</label>
            <input
              value={fbThemes}
              onChange={(e) => setFbThemes(e.target.value)}
              placeholder="growth, stakeholder mgmt, on-call"
            />
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
                fetch(apiUrl(`/api/documents/${d.id}/download`), { headers: { "x-prm-token": getToken() ?? "" } })
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
            const headers: Record<string, string> = { "x-prm-token": getToken() ?? "" };
            if (typeof window !== "undefined" && window.__PRM_LAUNCH_TOKEN__) {
              headers["x-prm-launch-token"] = window.__PRM_LAUNCH_TOKEN__;
            }
            const res = await fetch(apiUrl(`/api/people/${id}/documents`), {
              method: "POST",
              headers,
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

      <div className="panel stack">
        <h2>Meeting summaries</h2>
        <p className="muted">
          Structured notes from 1:1s / meetings. Default visibility is <strong>EM only</strong>. Raw transcripts stay
          private on the dossier. Confirm consent before storing — local vault notes are not a legal privilege.
        </p>
        {meetings.length === 0 ? (
          <p className="muted">No meeting summaries yet.</p>
        ) : (
          <ul>
            {meetings.map((m) => (
              <li key={m.id} style={{ marginBottom: 10 }}>
                <strong>{m.title}</strong>{" "}
                <span className="muted">
                  {m.occurredAt} · {m.visibility}
                  {m.themes.length ? ` · ${m.themes.join(", ")}` : ""}
                </span>
                <p style={{ margin: "4px 0", whiteSpace: "pre-wrap" }}>{m.summaryText}</p>
              </li>
            ))}
          </ul>
        )}
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!id) return;
            await api(`/api/people/${id}/meeting-summaries`, {
              method: "POST",
              body: JSON.stringify({
                title: meetTitle || "1:1 notes",
                transcript: meetTranscript,
                consentNoted: meetConsent,
                useAi: meetUseAi,
                visibility: "em_only",
              }),
            });
            setMeetTitle("");
            setMeetTranscript("");
            setMeetConsent(false);
            setCaptureMsg("Meeting summary saved (em_only)");
            await load();
          }}
        >
          <div className="field">
            <label>Title</label>
            <input value={meetTitle} onChange={(e) => setMeetTitle(e.target.value)} placeholder="1:1 — week of…" />
          </div>
          <div className="field">
            <label>Transcript / paste</label>
            <textarea
              value={meetTranscript}
              onChange={(e) => setMeetTranscript(e.target.value)}
              required
              rows={6}
              placeholder="Paste notes or transcript…"
            />
          </div>
          <label className="row" style={{ gap: 8, alignItems: "flex-start" }}>
            <input type="checkbox" checked={meetConsent} onChange={(e) => setMeetConsent(e.target.checked)} required />
            <span>
              I confirmed with the participant (or policy) that these notes may be stored in my local EM vault. Private
              by default — not legal privilege or HRIS custody.
            </span>
          </label>
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" checked={meetUseAi} onChange={(e) => setMeetUseAi(e.target.checked)} />
            <span>Use AI to summarize (requires Settings → AI / meeting egress or local-only)</span>
          </label>
          <button className="btn" type="submit" disabled={!meetConsent || !meetTranscript.trim()}>
            Save meeting summary
          </button>
        </form>
      </div>

      <div className="panel stack">
        <h2>Concern log</h2>
        <p className="muted">
          Private performance concerns and follow-up plans. AI is off by default — these stay out of digests and drafts unless you later opt a concern in.
        </p>
        {concerns.length === 0 ? (
          <p className="muted">No concerns logged.</p>
        ) : (
          <ul>
            {concerns.map((c) => (
              <li key={c.id} style={{ marginBottom: 10 }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <strong>{c.title}</strong>
                  <span className={`status-pill ${c.status === "closed" ? "ok" : "warn"}`}>{c.status}</span>
                </div>
                <p style={{ margin: "4px 0" }}>{c.body}</p>
                {c.expectationText && (
                  <p className="muted" style={{ margin: "2px 0" }}>Expectation: {c.expectationText}</p>
                )}
                {c.planText && <p className="muted" style={{ margin: "2px 0" }}>Plan: {c.planText}</p>}
                <p className="muted" style={{ margin: "2px 0" }}>
                  {c.occurredAt}
                  {c.aiAllowed ? " · AI opted in" : " · AI off"}
                </p>
                <div className="row" style={{ gap: 8 }}>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={async () => {
                      await api(`/api/concerns/${c.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ status: c.status === "open" ? "closed" : "open" }),
                      });
                      await load();
                    }}
                  >
                    Mark {c.status === "open" ? "closed" : "open"}
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={async () => {
                      await api(`/api/concerns/${c.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ aiAllowed: !c.aiAllowed }),
                      });
                      await load();
                    }}
                  >
                    {c.aiAllowed ? "Exclude from AI" : "Allow in AI digests"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!id) return;
            await api(`/api/people/${id}/concerns`, {
              method: "POST",
              body: JSON.stringify({
                title: concernTitle,
                body: concernBody,
                expectationText: concernExpectation || undefined,
                planText: concernPlan || undefined,
                aiAllowed: false,
              }),
            });
            setConcernTitle("");
            setConcernBody("");
            setConcernExpectation("");
            setConcernPlan("");
            setCaptureMsg("Concern logged");
            await load();
          }}
        >
          <div className="field">
            <label>Title</label>
            <input value={concernTitle} onChange={(e) => setConcernTitle(e.target.value)} required />
          </div>
          <div className="field">
            <label>Body</label>
            <textarea value={concernBody} onChange={(e) => setConcernBody(e.target.value)} required />
          </div>
          <div className="field">
            <label>Expectation</label>
            <textarea
              value={concernExpectation}
              onChange={(e) => setConcernExpectation(e.target.value)}
              placeholder="What good looks like…"
            />
          </div>
          <div className="field">
            <label>Plan</label>
            <textarea
              value={concernPlan}
              onChange={(e) => setConcernPlan(e.target.value)}
              placeholder="Follow-up steps…"
            />
          </div>
          <button className="btn">Add concern</button>
        </form>
      </div>

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
