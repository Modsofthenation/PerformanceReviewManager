import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { GapMark, RoleDefinitionDTO } from "@prm/shared";
import { api, getToken } from "../lib/api";
import { NextStep, PageHeader } from "../components/PageChrome";

type PromoDetail = {
  id: string;
  status: string;
  person: { id: string; name: string } | null;
  currentRole: RoleDefinitionDTO | null;
  targetRole: RoleDefinitionDTO | null;
  review: { id: string; status: string; payload: Record<string, unknown> } | null;
  assessments: Array<{ id: string; roleExpectationId: string; mark: string }>;
};

export function PromotionDetailPage() {
  const { id } = useParams();
  const [detail, setDetail] = useState<PromoDetail | null>(null);
  const [summary, setSummary] = useState("");
  const [scope, setScope] = useState("");
  const [gaps, setGapsText] = useState("");
  const [recommendation, setRecommendation] = useState<"ready" | "not_yet">("not_yet");
  const [marks, setMarks] = useState<Record<string, GapMark>>({});
  const [aiOut, setAiOut] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [baseline, setBaseline] = useState<{ status: string; recommendation: string } | null>(null);

  async function load() {
    if (!id) return;
    const d = await api<PromoDetail>(`/api/promotions/${id}`);
    setDetail(d);
    const p = d.review?.payload ?? {};
    setSummary(String(p.case_summary ?? ""));
    setScope(String(p.scope_examples ?? ""));
    setGapsText(String(p.remaining_gaps ?? ""));
    const rec = (p.recommendation as "ready" | "not_yet") ?? "not_yet";
    setRecommendation(rec);
    setBaseline({ status: d.status, recommendation: rec });
    const m: Record<string, GapMark> = {};
    for (const a of d.assessments) m[a.roleExpectationId] = a.mark as GapMark;
    for (const e of d.targetRole?.expectations ?? []) {
      if (!m[e.id]) m[e.id] = "emerging";
    }
    setMarks(m);
  }

  useEffect(() => {
    load();
  }, [id]);

  async function save(status = "draft") {
    if (!id) return;
    setError(null);
    const changes: string[] = [];
    if (baseline && status !== baseline.status) changes.push(`status ${baseline.status}→${status}`);
    if (baseline && recommendation !== baseline.recommendation) {
      changes.push(`recommendation ${baseline.recommendation}→${recommendation}`);
    }
    if (changes.length && !decisionReason.trim()) {
      setError("Add a decision reason when status or recommendation changes.");
      return;
    }
    try {
      await api(`/api/promotions/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          status,
          decisionReason: changes.length ? decisionReason.trim() : undefined,
          payload: {
            case_summary: summary,
            scope_examples: scope,
            remaining_gaps: gaps,
            recommendation,
          },
          assessments: Object.entries(marks).map(([roleExpectationId, mark]) => ({ roleExpectationId, mark })),
        }),
      });
      setMsg(`Saved (${status})`);
      if (changes.length) setDecisionReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function openHtmlPacket() {
    if (!id) return;
    const token = getToken();
    const res = await fetch(`/api/exports/promotion/${id}?format=html`, {
      headers: token ? { "x-prm-token": token } : {},
    });
    const html = await res.text();
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (!detail) return <p>Loading…</p>;

  const submitted = detail.status === "submitted";
  const thinNarrative = !summary.trim() || !scope.trim();

  return (
    <div className="stack">
      <PageHeader
        title={`Promotion: ${detail.person?.name}`}
        job={`${detail.currentRole?.title ?? "—"} → ${detail.targetRole?.title ?? "—"} · Mark next-role expectations, write the case, then submit.`}
        primary={
          submitted ? (
            <button className="btn" type="button" onClick={() => void openHtmlPacket()}>
              Open HTML packet
            </button>
          ) : (
            <button className="btn" onClick={() => save("submitted")}>Submit packet</button>
          )
        }
        secondary={
          <>
            <Link className="btn ghost" to="/promotions">All packets</Link>
            {!submitted && <button className="btn secondary" onClick={() => save("draft")}>Save draft</button>}
          </>
        }
      />

      {submitted ? (
        <NextStep
          tone="ok"
          label="Packet submitted"
          detail="Case is marked submitted. Open the HTML packet for skip-level discussion (Print → Save as PDF)."
          action={
            <>
              <button className="btn" type="button" onClick={() => void openHtmlPacket()}>
                Open HTML packet
              </button>
              <Link className="btn secondary" to="/promotions">
                Back to promotions
              </Link>
            </>
          }
        />
      ) : thinNarrative ? (
        <NextStep
          tone="brand"
          label="Complete the case narrative"
          detail="Mark each next-role expectation, then fill summary + demonstrated scope. AI draft can scaffold — you own the final text."
          action={
            <button
              className="btn"
              onClick={async () => {
                const res = await api<{ outputText: string }>("/api/ai/promotion-draft", {
                  method: "POST",
                  body: JSON.stringify({ promotionId: id }),
                });
                setAiOut(res.outputText);
                try {
                  const jsonMatch = res.outputText.match(/\{[\s\S]*\}/);
                  if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>;
                    if (parsed.case_summary) setSummary(parsed.case_summary);
                    if (parsed.scope_examples) setScope(parsed.scope_examples);
                    if (parsed.remaining_gaps) setGapsText(parsed.remaining_gaps);
                    if (parsed.recommendation === "ready" || parsed.recommendation === "not_yet") {
                      setRecommendation(parsed.recommendation);
                    }
                  }
                } catch {
                  /* keep raw */
                }
              }}
            >
              AI draft case
            </button>
          }
        />
      ) : (
        <NextStep
          tone="brand"
          label="Ready to submit?"
          detail="Save a draft anytime. Submit when marks and narrative are ready for skip-level review."
          action={
            <>
              <button className="btn secondary" onClick={() => save("draft")}>Save draft</button>
              <button className="btn" onClick={() => save("submitted")}>Submit packet</button>
            </>
          }
        />
      )}

      {msg && <p className="muted">{msg}</p>}
      {error && <p className="chat-error" style={{ padding: 0 }}>{error}</p>}

      <div className="writing">
        <div className="panel stack">
          <div className="row">
            <h2 style={{ flex: 1, margin: 0 }}>Next-role expectations</h2>
            <button
              className="btn secondary"
              onClick={async () => {
                const res = await api<{ outputText: string }>("/api/ai/promotion-draft", {
                  method: "POST",
                  body: JSON.stringify({ promotionId: id }),
                });
                setAiOut(res.outputText);
                try {
                  const jsonMatch = res.outputText.match(/\{[\s\S]*\}/);
                  if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>;
                    if (parsed.case_summary) setSummary(parsed.case_summary);
                    if (parsed.scope_examples) setScope(parsed.scope_examples);
                    if (parsed.remaining_gaps) setGapsText(parsed.remaining_gaps);
                    if (parsed.recommendation === "ready" || parsed.recommendation === "not_yet") {
                      setRecommendation(parsed.recommendation);
                    }
                  }
                } catch {
                  /* keep raw */
                }
              }}
            >
              AI draft case
            </button>
          </div>
          {(detail.targetRole?.expectations ?? []).map((e) => (
            <div key={e.id} className="field">
              <label><span className="flag">{e.kind}</span> {e.text}</label>
              <select
                value={marks[e.id] ?? "emerging"}
                onChange={(ev) => setMarks((m) => ({ ...m, [e.id]: ev.target.value as GapMark }))}
              >
                <option value="demonstrating">Demonstrating</option>
                <option value="emerging">Emerging</option>
                <option value="not_yet">Not yet</option>
              </select>
            </div>
          ))}
          {aiOut && <pre className="digest">{aiOut}</pre>}
        </div>

        <div className="panel stack">
          <h2>Case narrative</h2>
          <div className="field">
            <label>Case summary</label>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} />
          </div>
          <div className="field">
            <label>Next-level scope already demonstrated</label>
            <textarea value={scope} onChange={(e) => setScope(e.target.value)} />
          </div>
          <div className="field">
            <label>Remaining gaps & mitigation</label>
            <textarea value={gaps} onChange={(e) => setGapsText(e.target.value)} />
          </div>
          <div className="field">
            <label>Recommendation</label>
            <select value={recommendation} onChange={(e) => setRecommendation(e.target.value as "ready" | "not_yet")}>
              <option value="not_yet">Not yet</option>
              <option value="ready">Ready</option>
            </select>
          </div>
          <div className="field">
            <label>Decision reason (when recommendation or status changes)</label>
            <textarea
              value={decisionReason}
              onChange={(e) => setDecisionReason(e.target.value)}
              placeholder="Why ready vs not yet / why submitting now…"
              rows={2}
            />
          </div>
          {!submitted && (
            <div className="cta-primary-row">
              <button className="btn secondary" onClick={() => save("draft")}>Save draft</button>
              <button className="btn" onClick={() => save("submitted")}>Submit packet</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
