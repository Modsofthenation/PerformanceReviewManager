import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { BiasFinding, DecisionLogEntry, GapMark, PacketDTO, PromoReadiness } from "@prm/shared";
import { COMPETENCY_CATALOG, MIDDLE_BAND, competencyLabel } from "@prm/shared";
import { api, getToken } from "../lib/api";
import { NextStep, PageHeader } from "../components/PageChrome";

type EvidenceLinkDraft = {
  targetType: string;
  targetKey: string;
  sourceType: string;
  sourceId: string;
};

export function WritingDeskPage() {
  const { cycleId, personId } = useParams();
  const [packet, setPacket] = useState<PacketDTO | null>(null);
  const [summary, setSummary] = useState("");
  const [strengths, setStrengths] = useState("");
  const [growth, setGrowth] = useState("");
  const [devPlan, setDevPlan] = useState("");
  const [overall, setOverall] = useState(3);
  const [roleFit, setRoleFit] = useState("");
  const [promo, setPromo] = useState<PromoReadiness>("not_applicable");
  const [privateNotes, setPrivateNotes] = useState("");
  const [competencies, setCompetencies] = useState<Record<string, number>>({});
  const [links, setLinks] = useState<EvidenceLinkDraft[]>([]);
  const [gaps, setGaps] = useState<Record<string, GapMark>>({});
  const [digest, setDigest] = useState<string | null>(null);
  const [peerSynth, setPeerSynth] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subjectExport, setSubjectExport] = useState<unknown>(null);
  const [biasFindings, setBiasFindings] = useState<BiasFinding[] | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [decisions, setDecisions] = useState<DecisionLogEntry[]>([]);
  const [baseline, setBaseline] = useState<{
    overall: number;
    competencies: Record<string, number>;
    promo: string;
  } | null>(null);

  const competencyKeys = useMemo(() => {
    const keys = packet?.currentRole?.competencyKeys?.length
      ? packet.currentRole.competencyKeys
      : COMPETENCY_CATALOG.filter((c) => !c.appliesToTracks || c.appliesToTracks.includes("ic")).map((c) => c.key);
    return keys;
  }, [packet?.currentRole?.competencyKeys, packet?.currentRole?.track]);

  async function load() {
    if (!cycleId || !personId) return;
    const p = await api<PacketDTO>(`/api/packets/${cycleId}/${personId}`);
    setPacket(p);
    const payload = p.managerReview?.payload ?? {};
    setSummary(String(payload.summary ?? ""));
    setStrengths(String(payload.strengths ?? ""));
    setGrowth(String(payload.growth_areas ?? ""));
    setDevPlan(String(payload.dev_plan ?? ""));
    const nextOverall = Number(payload.overall ?? 3);
    setOverall(nextOverall);
    setRoleFit(String(payload.role_fit ?? ""));
    const nextPromo = (payload.promo_readiness as PromoReadiness) ?? "not_applicable";
    setPromo(nextPromo);
    setPrivateNotes(String(payload.private_notes ?? ""));
    const comps = (payload.competencies ?? {}) as Record<string, number>;
    setCompetencies(comps);
    setBaseline({ overall: nextOverall, competencies: comps, promo: nextPromo });
    setLinks(
      (p.evidenceLinks ?? []).map((l) => ({
        targetType: l.targetType,
        targetKey: l.targetKey,
        sourceType: l.sourceType,
        sourceId: l.sourceId,
      })),
    );
    if (p.managerReview?.id) {
      const log = await api<{ entries: DecisionLogEntry[] }>(
        `/api/activity?action=review.decision&entityId=${encodeURIComponent(p.managerReview.id)}&limit=12`,
      );
      setDecisions(log.entries);
    } else {
      setDecisions([]);
    }
  }

  useEffect(() => {
    load();
  }, [cycleId, personId]);

  useEffect(() => {
    if (!packet) return;
    setCompetencies((prev) => {
      const next = { ...prev };
      for (const key of competencyKeys) {
        if (next[key] == null) next[key] = MIDDLE_BAND;
      }
      return next;
    });
  }, [packet?.currentRole?.id, competencyKeys.join("|")]);

  const showGaps = promo === "ready" || promo === "not_yet";
  const nextExpectations = packet?.nextRole?.expectations ?? [];

  useEffect(() => {
    if (!showGaps) return;
    setGaps((prev) => {
      const next = { ...prev };
      for (const e of nextExpectations) {
        if (!next[e.id]) next[e.id] = "emerging";
      }
      return next;
    });
  }, [showGaps, packet?.nextRole?.id]);

  const flags = packet?.flags ?? [];
  const reviewStatus = packet?.managerReview?.status ?? "missing";
  const finalized = reviewStatus === "finalized" || reviewStatus === "shared";

  const evidenceOptions = useMemo(() => {
    if (!packet) return [] as Array<{ sourceType: string; sourceId: string; label: string }>;
    return [
      ...packet.achievements.map((a) => ({
        sourceType: "achievement",
        sourceId: a.id,
        label: `Achievement: ${a.title}`,
      })),
      ...packet.goals.map((g) => ({
        sourceType: "goal",
        sourceId: g.id,
        label: `Goal: ${g.title}`,
      })),
      ...packet.feedback.map((f) => ({
        sourceType: "feedback",
        sourceId: f.id,
        label: `Feedback: ${(f.body ?? "").slice(0, 60)}`,
      })),
      ...packet.documents.map((d) => ({
        sourceType: "document",
        sourceId: d.id,
        label: `Document: ${d.title}`,
      })),
    ];
  }, [packet]);

  function linksFor(key: string) {
    return links.filter((l) => l.targetType === "competency" && l.targetKey === key);
  }

  function toggleLink(key: string, sourceType: string, sourceId: string) {
    setLinks((prev) => {
      const exists = prev.find(
        (l) => l.targetType === "competency" && l.targetKey === key && l.sourceId === sourceId,
      );
      if (exists) {
        return prev.filter((l) => l !== exists);
      }
      return [...prev, { targetType: "competency", targetKey: key, sourceType, sourceId }];
    });
  }

  function missingEvidenceForFinalize() {
    const missing: string[] = [];
    for (const key of competencyKeys) {
      const score = competencies[key] ?? MIDDLE_BAND;
      if (score !== MIDDLE_BAND && !linksFor(key).length) missing.push(competencyLabel(key));
    }
    if (overall !== MIDDLE_BAND && links.length === 0) missing.push("overall rating");
    if ((overall === 1 || overall === 5) && links.length < 2) {
      missing.push("extreme overall (1 or 5) needs ≥2 evidence links");
    }
    return missing;
  }

  function ratingChanges() {
    if (!baseline || !packet?.managerReview) return [] as Array<{ field: string; from: unknown; to: unknown }>;
    const changes: Array<{ field: string; from: unknown; to: unknown }> = [];
    if (baseline.overall !== overall) changes.push({ field: "overall", from: baseline.overall, to: overall });
    for (const [key, score] of Object.entries(competencies)) {
      if (baseline.competencies[key] != null && baseline.competencies[key] !== score) {
        changes.push({ field: `competency:${key}`, from: baseline.competencies[key], to: score });
      }
    }
    if (baseline.promo && promo && baseline.promo !== promo) {
      changes.push({ field: "promo_readiness", from: baseline.promo, to: promo });
    }
    return changes;
  }

  async function save(nextStatus = "draft") {
    if (!cycleId || !personId) return;
    setError(null);
    if (nextStatus === "finalized") {
      const missing = missingEvidenceForFinalize();
      if (missing.length) {
        setError(`Evidence density gate: ${missing.join(", ")}`);
        return;
      }
    }
    const changes = ratingChanges();
    if (changes.length && !decisionReason.trim()) {
      setError("Add a decision reason when overall, competency, or promo readiness scores change.");
      return;
    }
    try {
      await api("/api/reviews/manager", {
        method: "PUT",
        body: JSON.stringify({
          cycleId,
          subjectPersonId: personId,
          status: nextStatus,
          decisionReason: changes.length ? decisionReason.trim() : undefined,
          payload: {
            overall,
            summary,
            strengths,
            growth_areas: growth,
            dev_plan: devPlan,
            role_fit: roleFit,
            promo_readiness: promo,
            private_notes: privateNotes,
            competencies,
          },
          gapAssessments: showGaps
            ? Object.entries(gaps).map(([roleExpectationId, mark]) => ({ roleExpectationId, mark }))
            : [],
          evidenceLinks: links,
        }),
      });
      setStatus(`Saved (${nextStatus})`);
      if (changes.length) setDecisionReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function openSubjectHtml() {
    if (!cycleId || !personId) return;
    const token = getToken();
    const res = await fetch(`/api/exports/subject/${cycleId}/${personId}?format=html`, {
      headers: token ? { "x-prm-token": token } : {},
    });
    if (!res.ok) {
      setError("Could not load HTML packet");
      return;
    }
    const html = await res.text();
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (!packet) return <p>Loading packet…</p>;

  return (
    <div className="stack">
      <PageHeader
        title={packet.person.name}
        job={`${packet.currentRole?.title ?? "No role"}${packet.nextRole ? ` → ${packet.nextRole.title}` : ""} · Score competencies with evidence, lint tone, finalize (freezes citations), then share HTML/PDF.`}
        primary={
          finalized ? (
            <button className="btn" type="button" onClick={() => void openSubjectHtml()}>
              Open subject packet (HTML)
            </button>
          ) : (
            <button className="btn" type="button" onClick={() => void save("finalized")}>
              Finalize review
            </button>
          )
        }
        secondary={
          <>
            <Link className="btn ghost" to={`/team/${packet.person.id}`}>
              Dossier
            </Link>
            <Link className="btn ghost" to={`/consistency?cycleId=${cycleId}`}>
              Consistency
            </Link>
            {!finalized && (
              <button className="btn secondary" type="button" onClick={() => void save("draft")}>
                Save draft
              </button>
            )}
          </>
        }
      />

      {!packet.currentRole ? (
        <NextStep
          tone="warn"
          label="Assign a role before finalizing"
          detail="Ratings should be judged against a published RoleDefinition."
          action={<Link className="btn" to="/roles">Assign role</Link>}
        />
      ) : finalized ? (
        <NextStep
          tone="ok"
          label="Review finalized — citations frozen"
          detail={`${packet.citationSnapshots.length} citation snapshot(s). Share the HTML packet (Print → PDF). Private notes stay out.`}
          action={
            <>
              <button className="btn" type="button" onClick={() => void openSubjectHtml()}>
                Open HTML packet
              </button>
              {(promo === "ready" || promo === "not_yet") && (
                <Link className="btn secondary" to="/promotions">
                  Open promotions
                </Link>
              )}
            </>
          }
        />
      ) : (
        <NextStep
          tone="brand"
          label="Evidence → competencies → lint → finalize"
          detail={`Scores other than ${MIDDLE_BAND} need at least one linked achievement, feedback, goal, or document.`}
          action={
            <>
              <button className="btn secondary" type="button" onClick={() => void save("draft")}>
                Save draft
              </button>
              <button className="btn" type="button" onClick={() => void save("finalized")}>
                Finalize review
              </button>
            </>
          }
        />
      )}

      {flags.length > 0 && (
        <div>
          {flags.map((f) => (
            <span className="flag" key={f}>
              {f}
            </span>
          ))}
        </div>
      )}
      {status && <p className="muted">{status}</p>}
      {error && <p className="chat-error" style={{ padding: 0 }}>{error}</p>}

      <div className="writing">
        <div className="stack">
          <div className="panel stack">
            <div className="row">
              <h2 style={{ flex: 1, margin: 0 }}>Evidence digest</h2>
              <button
                className="btn secondary"
                type="button"
                onClick={async () => {
                  const res = await api<{ outputText: string }>("/api/ai/digest", {
                    method: "POST",
                    body: JSON.stringify({ cycleId, personId }),
                  });
                  setDigest(res.outputText);
                }}
              >
                Generate digest
              </button>
            </div>
            <div className="digest">{digest ?? "Generate a grounded digest from dossier + imports before drafting."}</div>
          </div>
          <div className="panel">
            <h2>Current role expectations</h2>
            <ol>
              {(packet.currentRole?.expectations ?? []).map((e) => (
                <li key={e.id}>
                  <span className="flag">{e.kind}</span> {e.text}
                </li>
              ))}
            </ol>
          </div>
          <div className="panel">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>Peer synthesize</h2>
              <button
                className="btn secondary"
                type="button"
                disabled={!packet.peerReviews.length}
                onClick={async () => {
                  const res = await api<{ outputText: string }>("/api/ai/peer-synthesize", {
                    method: "POST",
                    body: JSON.stringify({ cycleId, personId }),
                  });
                  setPeerSynth(res.outputText);
                }}
              >
                Roll up themes
              </button>
            </div>
            <p className="muted">
              {packet.peerReviews.length
                ? `${packet.peerReviews.length} peer import(s) — synthesize themes instead of reading raw JSON.`
                : "No peer imports yet."}
            </p>
            <div className="digest">
              {peerSynth ??
                (packet.peerReviews.length
                  ? "Run roll-up to get strength/growth themes (authors stay EM-visible here; hidden in subject packet)."
                  : "Import peer bundles from Cycles first.")}
            </div>
          </div>

          {packet.priorCycle && (
            <div className="panel">
              <h2>Prior cycle — {packet.priorCycle.cycleName}</h2>
              <p className="muted">
                Ended {packet.priorCycle.windowEnd}
                {packet.priorCycle.overall != null ? ` · Overall ${packet.priorCycle.overall}/5` : ""}
              </p>
              {packet.priorCycle.summary && (
                <p>
                  <strong>Summary:</strong> {packet.priorCycle.summary}
                </p>
              )}
              {packet.priorCycle.strengths && (
                <p>
                  <strong>Strengths:</strong> {packet.priorCycle.strengths}
                </p>
              )}
              {packet.priorCycle.growthAreas && (
                <p>
                  <strong>Growth:</strong> {packet.priorCycle.growthAreas}
                </p>
              )}
            </div>
          )}

          <div className="panel">
            <h2>Person timeline</h2>
            {(packet.timeline ?? []).length === 0 ? (
              <p className="muted">No dossier milestones yet.</p>
            ) : (
              <ul className="timeline-list">
                {(packet.timeline ?? []).slice(0, 16).map((t, i) => (
                  <li key={`${t.kind}-${t.sourceId ?? i}`}>
                    <span className="muted">
                      {t.at} · {t.kind}
                    </span>{" "}
                    — <strong>{t.title}</strong>
                    {t.detail ? <span className="muted"> — {String(t.detail).slice(0, 100)}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel">
            <h2>Imports & dossier</h2>
            <p>
              <strong>Self:</strong> {packet.selfReview ? "imported" : "missing"}
            </p>
            {packet.selfReview && (
              <pre className="digest">{JSON.stringify(packet.selfReview.payload, null, 2)}</pre>
            )}
            <p>
              <strong>Achievements</strong>
            </p>
            <ul>
              {packet.achievements.map((a) => (
                <li key={a.id}>
                  [{a.id}] {a.title}
                </li>
              ))}
            </ul>
            <p>
              <strong>Feedback</strong>
            </p>
            <ul>
              {packet.feedback.map((f) => (
                <li key={f.id}>
                  [{f.id}] {f.body.slice(0, 80)}
                </li>
              ))}
            </ul>
            {packet.citationSnapshots.length > 0 && (
              <>
                <p>
                  <strong>Frozen citations</strong>
                </p>
                <ul>
                  {packet.citationSnapshots.map((s) => (
                    <li key={s.id}>
                      {s.title} <span className="muted">[{s.sourceId}]</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        <div className="panel stack">
          <h2>Manager draft</h2>
          <div className="field">
            <label>Overall (1–5)</label>
            <input
              type="number"
              min={1}
              max={5}
              value={overall}
              disabled={finalized}
              onChange={(e) => setOverall(Number(e.target.value))}
            />
            {overall !== MIDDLE_BAND && (
              <p className="muted">Outside middle band — link evidence on competencies below.</p>
            )}
            {(overall === 1 || overall === 5) && (
              <p className="chat-error" style={{ padding: 0 }}>
                Extreme overall ({overall}) requires ≥2 evidence links before finalize.
              </p>
            )}
          </div>

          {(ratingChanges().length > 0 || decisions.length > 0) && (
            <div className="field">
              <label>Decision reason (required when scores change)</label>
              <textarea
                value={decisionReason}
                disabled={finalized}
                onChange={(e) => setDecisionReason(e.target.value)}
                placeholder="Why did overall / competency / promo readiness move?"
                rows={2}
              />
              {ratingChanges().length > 0 && (
                <p className="muted" style={{ fontSize: "0.82rem" }}>
                  Pending: {ratingChanges().map((c) => `${c.field} ${c.from}→${c.to}`).join("; ")}
                </p>
              )}
              {decisions.length > 0 && (
                <ul className="timeline-list" style={{ marginTop: 8 }}>
                  {decisions.map((d) => (
                    <li key={d.id}>
                      <span className="muted">{d.createdAt.slice(0, 16)}</span> —{" "}
                      {String(d.detail.reason ?? "")}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="stack competency-block">
            <h3>Competencies</h3>
            <p className="muted">
              Scores other than {MIDDLE_BAND} require ≥1 evidence link. Catalog keys come from the assigned role.
            </p>
            {competencyKeys.map((key) => {
              const score = competencies[key] ?? MIDDLE_BAND;
              const linked = linksFor(key);
              return (
                <div key={key} className="competency-row">
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <strong>{competencyLabel(key)}</strong>
                      <div className="muted" style={{ fontSize: "0.82rem" }}>
                        {COMPETENCY_CATALOG.find((c) => c.key === key)?.description}
                      </div>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      style={{ width: 64 }}
                      value={score}
                      disabled={finalized}
                      onChange={(e) =>
                        setCompetencies((c) => ({ ...c, [key]: Number(e.target.value) }))
                      }
                    />
                  </div>
                  {score !== MIDDLE_BAND && (
                    <div className="evidence-picker">
                      <div className="muted" style={{ fontSize: "0.8rem", marginBottom: 6 }}>
                        Evidence links ({linked.length})
                        {linked.length === 0 ? " — required before finalize" : ""}
                      </div>
                      <div className="evidence-options">
                        {evidenceOptions.map((opt) => {
                          const on = linked.some((l) => l.sourceId === opt.sourceId);
                          return (
                            <label key={`${key}-${opt.sourceId}`} className={`evidence-chip${on ? " on" : ""}`}>
                              <input
                                type="checkbox"
                                checked={on}
                                disabled={finalized}
                                onChange={() => toggleLink(key, opt.sourceType, opt.sourceId)}
                              />
                              {opt.label}
                            </label>
                          );
                        })}
                        {!evidenceOptions.length && (
                          <p className="muted">No dossier items yet — capture evidence on the person page.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="field">
            <label>Role fit</label>
            <textarea
              value={roleFit}
              disabled={finalized}
              onChange={(e) => setRoleFit(e.target.value)}
              placeholder="Against current RoleDefinition…"
            />
          </div>
          <div className="field">
            <label className="row" style={{ justifyContent: "space-between" }}>
              <span>Summary</span>
              <button
                type="button"
                className="btn ghost"
                disabled={finalized}
                onClick={async () => {
                  const res = await api<{ outputText: string }>("/api/ai/draft-section", {
                    method: "POST",
                    body: JSON.stringify({ cycleId, personId, section: "summary" }),
                  });
                  setSummary(res.outputText);
                }}
              >
                AI draft
              </button>
            </label>
            <textarea value={summary} disabled={finalized} onChange={(e) => setSummary(e.target.value)} />
          </div>
          <div className="field">
            <label className="row" style={{ justifyContent: "space-between" }}>
              <span>Strengths</span>
              <button
                type="button"
                className="btn ghost"
                disabled={finalized}
                onClick={async () => {
                  const res = await api<{ outputText: string }>("/api/ai/draft-section", {
                    method: "POST",
                    body: JSON.stringify({ cycleId, personId, section: "strengths" }),
                  });
                  setStrengths(res.outputText);
                }}
              >
                AI draft
              </button>
            </label>
            <textarea value={strengths} disabled={finalized} onChange={(e) => setStrengths(e.target.value)} />
          </div>
          <div className="field">
            <label className="row" style={{ justifyContent: "space-between" }}>
              <span>Growth areas</span>
              <button
                type="button"
                className="btn ghost"
                disabled={finalized}
                onClick={async () => {
                  const res = await api<{ outputText: string }>("/api/ai/draft-section", {
                    method: "POST",
                    body: JSON.stringify({ cycleId, personId, section: "growth_areas" }),
                  });
                  setGrowth(res.outputText);
                }}
              >
                AI draft
              </button>
            </label>
            <textarea value={growth} disabled={finalized} onChange={(e) => setGrowth(e.target.value)} />
          </div>
          <div className="field">
            <label>Development plan</label>
            <textarea value={devPlan} disabled={finalized} onChange={(e) => setDevPlan(e.target.value)} />
          </div>
          <div className="field">
            <label>Promotion readiness</label>
            <select
              value={promo}
              disabled={finalized}
              onChange={(e) => setPromo(e.target.value as PromoReadiness)}
            >
              <option value="not_applicable">Not applicable</option>
              <option value="too_early">Too early</option>
              <option value="not_yet">Not yet</option>
              <option value="ready">Ready</option>
            </select>
          </div>
          {showGaps && (
            <div className="stack">
              <div className="row">
                <h3 style={{ flex: 1 }}>Next-level gaps ({packet.nextRole?.title ?? "pick next role"})</h3>
                <Link className="btn secondary" to="/promotions">
                  Start promotion packet
                </Link>
              </div>
              {nextExpectations.map((e) => (
                <div key={e.id} className="field">
                  <label>{e.text}</label>
                  <select
                    value={gaps[e.id] ?? "emerging"}
                    disabled={finalized}
                    onChange={(ev) => setGaps((g) => ({ ...g, [e.id]: ev.target.value as GapMark }))}
                  >
                    <option value="demonstrating">Demonstrating</option>
                    <option value="emerging">Emerging</option>
                    <option value="not_yet">Not yet</option>
                  </select>
                </div>
              ))}
            </div>
          )}
          <div className="field">
            <label>Private notes (em_only — omitted from subject export)</label>
            <textarea
              value={privateNotes}
              disabled={finalized}
              onChange={(e) => setPrivateNotes(e.target.value)}
            />
          </div>

          <div className="panel" style={{ background: "var(--panel-alt)" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h3 style={{ margin: 0 }}>Bias / tone lint</h3>
              <button
                type="button"
                className="btn secondary"
                onClick={async () => {
                  const res = await api<{ findings: BiasFinding[] }>("/api/ai/bias-lint", {
                    method: "POST",
                    body: JSON.stringify({
                      cycleId,
                      personId,
                      text: [summary, strengths, growth, devPlan, roleFit].join("\n\n"),
                    }),
                  });
                  setBiasFindings(res.findings);
                }}
              >
                Run lint
              </button>
            </div>
            <p className="muted">Advisory only — ephemeral findings, not stored on the review.</p>
            {biasFindings && (
              <ul className="bias-list">
                {biasFindings.map((f) => (
                  <li key={f.id} className={`bias-${f.severity}`}>
                    <strong>{f.category}</strong> — {f.message}
                    {f.excerpt ? <span className="muted"> (“{f.excerpt}”)</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="cta-primary-row">
            {!finalized && (
              <>
                <button className="btn secondary" type="button" onClick={() => void save("draft")}>
                  Save draft
                </button>
                <button className="btn" type="button" onClick={() => void save("finalized")}>
                  Finalize review
                </button>
              </>
            )}
            <button className="btn secondary" type="button" onClick={() => void openSubjectHtml()}>
              Open HTML packet
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={async () => {
                const exp = await api(`/api/exports/subject/${cycleId}/${personId}`);
                setSubjectExport(exp);
              }}
            >
              Preview JSON
            </button>
          </div>
          {subjectExport && <pre className="digest">{JSON.stringify(subjectExport, null, 2)}</pre>}
        </div>
      </div>
    </div>
  );
}
