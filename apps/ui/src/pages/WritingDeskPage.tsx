import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { BiasFinding, DecisionLogEntry, DeliveryCiteSuggestion, GapMark, PacketDTO, PromoReadiness } from "@prm/shared";
import { COMPETENCY_CATALOG, MIDDLE_BAND, competencyLabel } from "@prm/shared";
import { api, authHeaders, apiUrl } from "../lib/api";
import { estimateThenConfirm } from "../lib/aiEstimate";
import { openHtmlExport } from "../lib/exports";
import { NextStep, PageHeader, Section } from "../components/PageChrome";
import { PageSectionsLayout, type SectionNavItem } from "../components/PageSectionsLayout";
import { DeliveryRollupPanel } from "../components/DeliveryRollupPanel";

type EvidenceLinkDraft = {
  targetType: string;
  targetKey: string;
  sourceType: string;
  sourceId: string;
};

function formatWritingTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

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
  const [citeSuggestions, setCiteSuggestions] = useState<DeliveryCiteSuggestion[]>([]);
  const [skipLevel, setSkipLevel] = useState<string | null>(null);
  const [peerSynth, setPeerSynth] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subjectExport, setSubjectExport] = useState<unknown>(null);
  const [biasFindings, setBiasFindings] = useState<BiasFinding[] | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [decisions, setDecisions] = useState<DecisionLogEntry[]>([]);
  const [writingSeconds, setWritingSeconds] = useState(0);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const writingSecondsRef = useRef(0);
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

  function markDirty() {
    dirtyRef.current = true;
    setDirty(true);
  }

  function clearDirty() {
    dirtyRef.current = false;
    setDirty(false);
  }

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
    const seededSeconds = p.writingSecondsTotal ?? 0;
    writingSecondsRef.current = seededSeconds;
    setWritingSeconds(seededSeconds);
    clearDirty();
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

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      writingSecondsRef.current += 1;
      setWritingSeconds(writingSecondsRef.current);
    };
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [cycleId, personId]);

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
    const oow = (flag?: boolean) => (flag ? " · out of window" : "");
    return [
      ...packet.achievements.map((a) => ({
        sourceType: "achievement",
        sourceId: a.id,
        label: `Achievement: ${a.title}${oow(a.outOfWindow)}`,
      })),
      ...packet.goals.map((g) => ({
        sourceType: "goal",
        sourceId: g.id,
        label: `Goal: ${g.title}`,
      })),
      ...packet.feedback.map((f) => ({
        sourceType: "feedback",
        sourceId: f.id,
        label: `Feedback: ${(f.body ?? "").slice(0, 60)}${oow(f.outOfWindow)}`,
      })),
      ...packet.documents.map((d) => ({
        sourceType: "document",
        sourceId: d.id,
        label: `Document: ${d.title}${oow(d.outOfWindow)}`,
      })),
    ];
  }, [packet]);

  const outOfWindowTray = packet?.outOfWindow;
  const hasOutOfWindow =
    !!outOfWindowTray &&
    (outOfWindowTray.achievements.length > 0 ||
      outOfWindowTray.feedback.length > 0 ||
      outOfWindowTray.documents.length > 0);
  const writingUnderBudget = writingSeconds <= 45 * 60;

  function linksFor(key: string) {
    return links.filter((l) => l.targetType === "competency" && l.targetKey === key);
  }

  function toggleLink(key: string, sourceType: string, sourceId: string) {
    markDirty();
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
    const distinct = new Set(links.map((l) => `${l.sourceType}:${l.sourceId}`)).size;
    if ((overall === 1 || overall === 5) && distinct < 2) {
      missing.push("extreme overall (1 or 5) needs ≥2 distinct evidence links");
    }
    return missing;
  }

  function ratingChanges() {
    if (!baseline) return [] as Array<{ field: string; from: unknown; to: unknown }>;
    const changes: Array<{ field: string; from: unknown; to: unknown }> = [];
    if (baseline.overall !== overall) {
      if (overall !== MIDDLE_BAND || baseline.overall !== MIDDLE_BAND) {
        changes.push({ field: "overall", from: baseline.overall, to: overall });
      }
    }
    for (const [key, score] of Object.entries(competencies)) {
      const prev = baseline.competencies[key];
      if (prev === score) continue;
      if (score !== MIDDLE_BAND || (prev != null && prev !== MIDDLE_BAND)) {
        changes.push({ field: `competency:${key}`, from: prev ?? null, to: score });
      }
    }
    if (baseline.promo !== promo) {
      if (promo !== "not_applicable" || baseline.promo) {
        changes.push({ field: "promo_readiness", from: baseline.promo || null, to: promo });
      }
    }
    return changes;
  }

  async function runAiAction(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI request failed");
    }
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
    const reopening = finalized && nextStatus === "draft";
    if ((changes.length || reopening) && !decisionReason.trim()) {
      setError(
        reopening
          ? "Add a decision reason to reopen a finalized review."
          : "Add a decision reason when overall, competency, or promo readiness scores change.",
      );
      return;
    }
    try {
      await api("/api/reviews/manager", {
        method: "PUT",
        body: JSON.stringify({
          cycleId,
          subjectPersonId: personId,
          status: nextStatus,
          decisionReason: changes.length || reopening ? decisionReason.trim() : undefined,
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
            writing_seconds_total: writingSecondsRef.current,
          },
          gapAssessments: showGaps
            ? Object.entries(gaps).map(([roleExpectationId, mark]) => ({ roleExpectationId, mark }))
            : [],
          evidenceLinks: links,
        }),
      });
      setStatus(`Saved (${nextStatus})`);
      if (changes.length || reopening) setDecisionReason("");
      clearDirty();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  useEffect(() => {
    if (finalized || !packet) return;
    const id = window.setInterval(() => {
      if (!dirtyRef.current) return;
      void save("draft");
    }, 8000);
    return () => window.clearInterval(id);
    // Intentionally re-bind when draft fields change so autosave sees fresh closures.
  }, [
    finalized,
    packet?.managerReview?.status,
    cycleId,
    personId,
    summary,
    strengths,
    growth,
    devPlan,
    overall,
    roleFit,
    promo,
    privateNotes,
    competencies,
    links,
    gaps,
    decisionReason,
    dirty,
  ]);

  async function openSubjectHtml() {
    if (!cycleId || !personId) return;
    const res = await fetch(apiUrl(`/api/exports/subject/${cycleId}/${personId}?format=html`), {
      headers: authHeaders(),
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

  const sections: SectionNavItem[] = [
    ...(hasOutOfWindow ? [{ id: "desk-oow", label: "Out of window" }] : []),
    { id: "desk-digest", label: "Digest" },
    { id: "desk-expectations", label: "Expectations" },
    { id: "desk-peer", label: "Peer synth" },
    ...(packet.priorCycle ? [{ id: "desk-prior", label: "Prior cycle" }] : []),
    { id: "desk-timeline", label: "Timeline" },
    { id: "desk-imports", label: "Imports" },
    { id: "desk-draft", label: "Manager draft" },
  ];

  return (
    <div className="stack">
      <PageHeader
        title={packet.person.name}
        job={`${packet.currentRole?.title ?? "No role"}${packet.nextRole ? ` → ${packet.nextRole.title}` : ""} · Score competencies with evidence, lint tone, finalize (freezes citations), then share HTML/PDF.`}
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
            {finalized ? (
              <button className="btn secondary" type="button" onClick={() => void openSubjectHtml()}>
                Open subject packet (HTML)
              </button>
            ) : (
              <button className="btn secondary" type="button" onClick={() => void save("finalized")}>
                Finalize review
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
          label="Review finalized — citations & timeline frozen"
          detail={`${packet.citationSnapshots.length} citation snapshot(s). Subject HTML requires finalize. Reopen to draft only with a decision reason.`}
          action={
            <>
              <button className="btn" type="button" onClick={() => void openSubjectHtml()}>
                Open HTML packet
              </button>
              <button
                className="btn secondary"
                type="button"
                onClick={() => {
                  if (!decisionReason.trim()) {
                    setError("Add a decision reason, then click Reopen.");
                    return;
                  }
                  void save("draft");
                }}
              >
                Reopen to draft
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
        <div className="row" style={{ flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {flags.map((f) => (
            <span className="flag" key={f}>
              {f}
            </span>
          ))}
          {flags.includes("missing_self_import") && (
            <button
              className="btn secondary"
              type="button"
              onClick={async () => {
                const reason = window.prompt("Reason for waiving self-review import?");
                if (!reason?.trim() || !cycleId || !personId) return;
                try {
                  await api(`/api/cycles/${cycleId}/participants/${personId}/waive`, {
                    method: "POST",
                    body: JSON.stringify({ phase: "self", reason: reason.trim() }),
                  });
                  setStatus("Self-import waived");
                  await load();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Waive failed");
                }
              }}
            >
              Waive self-import
            </button>
          )}
        </div>
      )}
      <p className="muted" style={{ margin: 0 }}>
        Writing time {formatWritingTime(writingSeconds)}{" "}
        <span className={`status-pill ${writingUnderBudget ? "ok" : "warn"}`}>≤45 min</span>
        {dirty && !finalized ? " · unsaved changes" : ""}
      </p>
      {status && <p className="muted">{status}</p>}
      {error && <p className="chat-error" style={{ padding: 0 }}>{error}</p>}

      <PageSectionsLayout sections={sections}>
      {hasOutOfWindow && outOfWindowTray && (
        <Section
          id="desk-oow"
          title="Out of window"
          when="Use when evidence falls outside the cycle window but you still want to cite it."
          how="Scan dated-out achievements, feedback, and documents below — they remain citable."
        >
          <ul>
            {outOfWindowTray.achievements.map((a) => (
              <li key={a.id}>
                {a.title} <span className="muted">out of window · {a.occurredAt}</span>
              </li>
            ))}
            {outOfWindowTray.feedback.map((f) => (
              <li key={f.id}>
                {(f.body ?? "").slice(0, 80)} <span className="muted">out of window · {f.occurredAt}</span>
              </li>
            ))}
            {outOfWindowTray.documents.map((d) => (
              <li key={d.id}>
                {d.title}{" "}
                <span className="muted">out of window{d.occurredAt ? ` · ${d.occurredAt}` : ""}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="writing">
        <div className="stack">
          {personId ? <DeliveryRollupPanel personId={personId} cycleId={cycleId} /> : null}
          <Section
            id="desk-digest"
            title="Evidence digest"
            when="Use before drafting to ground the story in dossier and import evidence."
            how="Generate a digest, optional skip-level talking points, or open a director briefing card."
            action={
              <>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() =>
                    void runAiAction(async () => {
                      const ok = await estimateThenConfirm(
                        "evidence_digest",
                        { cycleId, personId },
                        "Generate evidence digest",
                      );
                      if (!ok) return;
                      const res = await api<{ outputText: string; citeSuggestions?: DeliveryCiteSuggestion[] }>(
                        "/api/ai/digest",
                        {
                          method: "POST",
                          body: JSON.stringify({ cycleId, personId }),
                        },
                      );
                      setDigest(res.outputText);
                      setCiteSuggestions(res.citeSuggestions ?? []);
                    })
                  }
                >
                  Generate evidence digest
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() =>
                    void runAiAction(async () => {
                      const ok = await estimateThenConfirm(
                        "skip_level_talking_points",
                        { cycleId, personId },
                        "Generate skip-level talking points",
                      );
                      if (!ok) return;
                      const res = await api<{ outputText: string }>("/api/ai/skip-level-talking-points", {
                        method: "POST",
                        body: JSON.stringify({ cycleId, personId }),
                      });
                      setSkipLevel(res.outputText);
                    })
                  }
                >
                  Generate skip-level talking points
                </button>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() =>
                    void openHtmlExport(
                      `/api/exports/director-briefing/${cycleId}?personId=${encodeURIComponent(personId ?? "")}&format=html`,
                    )
                  }
                >
                  Open director briefing card
                </button>
              </>
            }
          >
            <div className="digest">{digest ?? "Generate a grounded digest from dossier + imports before drafting."}</div>
            {skipLevel && (
              <div>
                <p className="muted" style={{ marginBottom: 4 }}>
                  Skip-level talking points (copy for a 15‑min with your director)
                </p>
                <pre className="digest" style={{ whiteSpace: "pre-wrap" }}>
                  {skipLevel}
                </pre>
              </div>
            )}
            {citeSuggestions.length > 0 && (
              <div>
                <p className="muted" style={{ marginBottom: 4 }}>
                  Auto-suggested cites from Done-in-window delivery
                </p>
                <ul className="delivery-cite-list">
                  {citeSuggestions.map((c) => (
                    <li key={c.achievementId}>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => {
                          navigator.clipboard?.writeText(c.citeToken).catch(() => undefined);
                          setStatus(`Copied ${c.citeToken}`);
                        }}
                      >
                        <code>{c.citeToken}</code>
                      </button>{" "}
                      {c.label} <span className="muted">({c.reason})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>
          <Section
            id="desk-expectations"
            title="Current role expectations"
            when="Use while scoring role fit so ratings stay tied to the assigned role definition."
            how="Read each expectation kind and text below as you draft competencies and narrative."
          >
            <ol>
              {(packet.currentRole?.expectations ?? []).map((e) => (
                <li key={e.id}>
                  <span className="flag">{e.kind}</span> {e.text}
                </li>
              ))}
            </ol>
          </Section>
          <Section
            id="desk-peer"
            title="Peer synthesize"
            when="Use when peer imports exist and you want themes instead of raw JSON."
            how="Run the roll-up to get strength/growth themes (authors stay EM-visible here)."
            action={
              <button
                className="btn secondary"
                type="button"
                disabled={!packet.peerReviews.length}
                onClick={() =>
                  void runAiAction(async () => {
                    const ok = await estimateThenConfirm(
                      "peer_synthesize",
                      { cycleId, personId },
                      "Synthesize peer themes",
                    );
                    if (!ok) return;
                    const res = await api<{ outputText: string }>("/api/ai/peer-synthesize", {
                      method: "POST",
                      body: JSON.stringify({ cycleId, personId }),
                    });
                    setPeerSynth(res.outputText);
                  })
                }
              >
                Synthesize peer themes
              </button>
            }
          >
            <p className="muted">
              {packet.peerReviews.length
                ? `${packet.peerReviews.length} peer import(s) available.`
                : "No peer imports yet — import peer bundles from Cycles first."}
            </p>
            <div className="digest">
              {peerSynth ??
                (packet.peerReviews.length
                  ? "Run synthesize to get strength/growth themes (authors stay EM-visible here; hidden in subject packet)."
                  : "Import peer bundles from Cycles first.")}
            </div>
          </Section>

          {packet.priorCycle && (
            <Section
              id="desk-prior"
              title={`Prior cycle — ${packet.priorCycle.cycleName}`}
              when="Use to compare continuity with the previous review window before changing scores."
              how="Read prior overall, summary, strengths, and growth — then mirror or deliberately diverge with a reason."
            >
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
            </Section>
          )}

          <Section
            id="desk-timeline"
            title="Person timeline"
            when="Use for quick dossier context while writing without leaving the desk."
            how="Scan recent milestones below; open the person page for the full chronology."
            action={
              personId ? (
                <Link className="btn secondary" to={`/team/${personId}`}>
                  Open person dossier
                </Link>
              ) : undefined
            }
          >
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
          </Section>

          <Section
            id="desk-imports"
            title="Imports & dossier"
            when="Use to verify self-review, achievements, feedback, and frozen citations before finalize."
            how="Check self-review status, then cite achievement/feedback IDs from the lists below."
          >
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
          </Section>
        </div>

        <Section
          id="desk-draft"
          title="Manager draft"
          when="Use throughout the cycle to score, write narrative, and finalize the manager review."
          how="Set overall and competencies with evidence links, draft the narrative fields, then save or finalize."
          action={
            !finalized ? (
              <>
                <button className="btn secondary" type="button" onClick={() => void save("draft")}>
                  Save manager draft
                </button>
                <button className="btn secondary" type="button" onClick={() => void save("finalized")}>
                  Finalize review
                </button>
              </>
            ) : (
              <button
                className="btn secondary"
                type="button"
                onClick={() => void openSubjectHtml()}
              >
                Open HTML packet
              </button>
            )
          }
        >
          <div className="field">
            <label>Overall (1–5)</label>
            <input
              type="number"
              min={1}
              max={5}
              value={overall}
              disabled={finalized}
              onChange={(e) => {
                markDirty();
                setOverall(Number(e.target.value));
              }}
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

          {(ratingChanges().length > 0 || decisions.length > 0 || finalized) && (
            <div className="field">
              <label>Decision reason (required when scores change or reopening)</label>
              <textarea
                value={decisionReason}
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
                      onChange={(e) => {
                        markDirty();
                        setCompetencies((c) => ({ ...c, [key]: Number(e.target.value) }));
                      }}
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
              onChange={(e) => {
                markDirty();
                setRoleFit(e.target.value);
              }}
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
                onClick={() =>
                  void runAiAction(async () => {
                    const ok = await estimateThenConfirm(
                      "draft_section",
                      { cycleId, personId, section: "summary" },
                      "AI draft: summary",
                    );
                    if (!ok) return;
                    const res = await api<{ outputText: string }>("/api/ai/draft-section", {
                      method: "POST",
                      body: JSON.stringify({ cycleId, personId, section: "summary" }),
                    });
                    setSummary(res.outputText);
                    markDirty();
                  })
                }
              >
                AI draft this section
              </button>
            </label>
            <textarea
              value={summary}
              disabled={finalized}
              onChange={(e) => {
                markDirty();
                setSummary(e.target.value);
              }}
            />
          </div>
          <div className="field">
            <label className="row" style={{ justifyContent: "space-between" }}>
              <span>Strengths</span>
              <button
                type="button"
                className="btn ghost"
                disabled={finalized}
                onClick={() =>
                  void runAiAction(async () => {
                    const ok = await estimateThenConfirm(
                      "draft_section",
                      { cycleId, personId, section: "strengths" },
                      "AI draft: strengths",
                    );
                    if (!ok) return;
                    const res = await api<{ outputText: string }>("/api/ai/draft-section", {
                      method: "POST",
                      body: JSON.stringify({ cycleId, personId, section: "strengths" }),
                    });
                    setStrengths(res.outputText);
                    markDirty();
                  })
                }
              >
                AI draft this section
              </button>
            </label>
            <textarea
              value={strengths}
              disabled={finalized}
              onChange={(e) => {
                markDirty();
                setStrengths(e.target.value);
              }}
            />
          </div>
          <div className="field">
            <label className="row" style={{ justifyContent: "space-between" }}>
              <span>Growth areas</span>
              <button
                type="button"
                className="btn ghost"
                disabled={finalized}
                onClick={() =>
                  void runAiAction(async () => {
                    const ok = await estimateThenConfirm(
                      "draft_section",
                      { cycleId, personId, section: "growth_areas" },
                      "AI draft: growth areas",
                    );
                    if (!ok) return;
                    const res = await api<{ outputText: string }>("/api/ai/draft-section", {
                      method: "POST",
                      body: JSON.stringify({ cycleId, personId, section: "growth_areas" }),
                    });
                    setGrowth(res.outputText);
                    markDirty();
                  })
                }
              >
                AI draft this section
              </button>
            </label>
            <textarea
              value={growth}
              disabled={finalized}
              onChange={(e) => {
                markDirty();
                setGrowth(e.target.value);
              }}
            />
          </div>
          <div className="field">
            <label>Development plan</label>
            <textarea
              value={devPlan}
              disabled={finalized}
              onChange={(e) => {
                markDirty();
                setDevPlan(e.target.value);
              }}
            />
          </div>
          <div className="field">
            <label>Promotion readiness</label>
            <select
              value={promo}
              disabled={finalized}
              onChange={(e) => {
                markDirty();
                setPromo(e.target.value as PromoReadiness);
              }}
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
                    onChange={(ev) => {
                      markDirty();
                      setGaps((g) => ({ ...g, [e.id]: ev.target.value as GapMark }));
                    }}
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
              onChange={(e) => {
                markDirty();
                setPrivateNotes(e.target.value);
              }}
            />
          </div>

          <div className="panel" style={{ background: "var(--panel-alt)" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h3 style={{ margin: 0 }}>Bias / faithfulness lint</h3>
              <div className="row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() =>
                    void runAiAction(async () => {
                      const res = await api<{ findings: BiasFinding[] }>("/api/ai/bias-lint", {
                        method: "POST",
                        body: JSON.stringify({
                          cycleId,
                          personId,
                          text: [summary, strengths, growth, devPlan, roleFit].join("\n\n"),
                        }),
                      });
                      setBiasFindings(res.findings);
                    })
                  }
                >
                  Run lint
                </button>
                {!finalized && (
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() =>
                      void runAiAction(async () => {
                        const res = await api<{
                          fields: Record<string, string>;
                          applied: number;
                          findings: BiasFinding[];
                        }>("/api/ai/apply-all-faithfulness-fixes", {
                          method: "POST",
                          body: JSON.stringify({
                            cycleId,
                            personId,
                            fields: {
                              summary,
                              strengths,
                              growth_areas: growth,
                              dev_plan: devPlan,
                              role_fit: roleFit,
                            },
                          }),
                        });
                        markDirty();
                        setSummary(res.fields.summary ?? summary);
                        setStrengths(res.fields.strengths ?? strengths);
                        setGrowth(res.fields.growth_areas ?? growth);
                        setDevPlan(res.fields.dev_plan ?? devPlan);
                        setRoleFit(res.fields.role_fit ?? roleFit);
                        setBiasFindings(res.findings);
                        setStatus(`Applied ${res.applied} faithfulness fix(es)`);
                      })
                    }
                  >
                    Apply all fixes
                  </button>
                )}
              </div>
            </div>
            <p className="muted">
              Advisory groundedness checks. Cite/soften patches draft text in place; allowlist is built from this
              person’s evidence.
            </p>
            {biasFindings && (
              <ul className="bias-list">
                {biasFindings.map((f) => (
                  <li key={f.id} className={`bias-${f.severity}`}>
                    <strong>{f.category}</strong> — {f.message}
                    {f.excerpt ? <span className="muted"> (“{f.excerpt}”)</span> : null}
                    {f.suggestedFix && !finalized && f.excerpt ? (
                      <button
                        type="button"
                        className="btn ghost"
                        style={{ marginLeft: 8 }}
                        onClick={() => {
                          const fix = f.suggestedFix!;
                          const excerpt = f.excerpt!;
                          const apply = (field: string, setter: (v: string) => void) => {
                            if (!field.includes(excerpt)) return false;
                            let next = field;
                            if (fix.action === "strip_cite") {
                              next = field.replace(excerpt, "").replace(/  +/g, " ").replace(/ \./g, ".");
                            } else if (fix.newText) {
                              next = field.replace(excerpt, fix.newText);
                            } else {
                              return false;
                            }
                            markDirty();
                            setter(next);
                            return true;
                          };
                          const applied =
                            apply(summary, setSummary) ||
                            apply(strengths, setStrengths) ||
                            apply(growth, setGrowth) ||
                            apply(devPlan, setDevPlan) ||
                            apply(roleFit, setRoleFit);
                          if (applied) {
                            setBiasFindings((prev) => (prev ? prev.filter((x) => x.id !== f.id) : prev));
                            setStatus(`Applied: ${fix.label}`);
                          } else {
                            setError("Could not find that excerpt in the draft fields — it may have changed.");
                          }
                        }}
                      >
                        {f.suggestedFix.label}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="cta-primary-row">
            {!finalized && (
              <>
                <button className="btn secondary" type="button" onClick={() => void save("draft")}>
                  Save manager draft
                </button>
                <button className="btn secondary" type="button" onClick={() => void save("finalized")}>
                  Finalize review
                </button>
              </>
            )}
            <button
              className="btn secondary"
              type="button"
              disabled={!finalized}
              title={finalized ? "Open subject HTML (Print → PDF)" : "Finalize before exporting"}
              onClick={() => void openSubjectHtml()}
            >
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
              Preview JSON export
            </button>
          </div>
          {subjectExport != null ? <pre className="digest">{JSON.stringify(subjectExport, null, 2)}</pre> : null}
        </Section>
      </div>
      </PageSectionsLayout>
    </div>
  );
}
