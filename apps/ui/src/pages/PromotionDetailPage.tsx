import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { GapMark, RoleDefinitionDTO } from "@prm/shared";
import { api } from "../lib/api";

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

  async function load() {
    if (!id) return;
    const d = await api<PromoDetail>(`/api/promotions/${id}`);
    setDetail(d);
    const p = d.review?.payload ?? {};
    setSummary(String(p.case_summary ?? ""));
    setScope(String(p.scope_examples ?? ""));
    setGapsText(String(p.remaining_gaps ?? ""));
    setRecommendation((p.recommendation as "ready" | "not_yet") ?? "not_yet");
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
    await api(`/api/promotions/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        status,
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
    await load();
  }

  if (!detail) return <p>Loading…</p>;

  return (
    <div className="stack">
      <div className="row">
        <div>
          <h1>Promotion: {detail.person?.name}</h1>
          <p>{detail.currentRole?.title} → <strong>{detail.targetRole?.title}</strong></p>
        </div>
        <Link className="btn ghost" to="/promotions">Back</Link>
        <button className="btn secondary" onClick={() => save("draft")}>Save draft</button>
        <button className="btn" onClick={() => save("submitted")}>Submit</button>
      </div>
      {msg && <p className="muted">{msg}</p>}

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
        </div>
      </div>
    </div>
  );
}
