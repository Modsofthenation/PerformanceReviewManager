import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { GapMark, PacketDTO, PromoReadiness } from "@prm/shared";
import { api } from "../lib/api";

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
  const [gaps, setGaps] = useState<Record<string, GapMark>>({});
  const [digest, setDigest] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [subjectExport, setSubjectExport] = useState<unknown>(null);

  async function load() {
    if (!cycleId || !personId) return;
    const p = await api<PacketDTO>(`/api/packets/${cycleId}/${personId}`);
    setPacket(p);
    const payload = p.managerReview?.payload ?? {};
    setSummary(String(payload.summary ?? ""));
    setStrengths(String(payload.strengths ?? ""));
    setGrowth(String(payload.growth_areas ?? ""));
    setDevPlan(String(payload.dev_plan ?? ""));
    setOverall(Number(payload.overall ?? 3));
    setRoleFit(String(payload.role_fit ?? ""));
    setPromo((payload.promo_readiness as PromoReadiness) ?? "not_applicable");
    setPrivateNotes(String(payload.private_notes ?? ""));
  }

  useEffect(() => {
    load();
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

  async function save(nextStatus = "draft") {
    if (!cycleId || !personId) return;
    await api("/api/reviews/manager", {
      method: "PUT",
      body: JSON.stringify({
        cycleId,
        subjectPersonId: personId,
        status: nextStatus,
        payload: {
          overall,
          summary,
          strengths,
          growth_areas: growth,
          dev_plan: devPlan,
          role_fit: roleFit,
          promo_readiness: promo,
          private_notes: privateNotes,
        },
        gapAssessments: showGaps
          ? Object.entries(gaps).map(([roleExpectationId, mark]) => ({ roleExpectationId, mark }))
          : [],
      }),
    });
    setStatus(`Saved (${nextStatus})`);
    await load();
  }

  if (!packet) return <p>Loading packet…</p>;

  return (
    <div className="stack">
      <div className="row">
        <div>
          <h1>{packet.person.name}</h1>
          <p>
            {packet.currentRole?.title ?? "No role"}
            {packet.nextRole ? ` → ${packet.nextRole.title}` : ""} ·{" "}
            <Link to={`/team/${packet.person.id}`}>Dossier</Link>
          </p>
        </div>
        <button className="btn secondary" onClick={() => save("draft")}>Save draft</button>
        <button className="btn" onClick={() => save("finalized")}>Finalize</button>
      </div>
      {flags.length > 0 && (
        <div>{flags.map((f) => <span className="flag" key={f}>{f}</span>)}</div>
      )}
      {status && <p className="muted">{status}</p>}

      <div className="writing">
        <div className="stack">
          <div className="panel stack">
            <div className="row">
              <h2 style={{ flex: 1, margin: 0 }}>Evidence digest</h2>
              <button
                className="btn secondary"
                onClick={async () => {
                  const res = await api<{ outputText: string }>("/api/ai/digest", {
                    method: "POST",
                    body: JSON.stringify({ cycleId, personId }),
                  });
                  setDigest(res.outputText);
                }}
              >
                Generate
              </button>
            </div>
            <div className="digest">{digest ?? "Generate a grounded local digest from dossier + imports."}</div>
          </div>
          <div className="panel">
            <h2>Current role expectations</h2>
            <ol>
              {(packet.currentRole?.expectations ?? []).map((e) => (
                <li key={e.id}><span className="flag">{e.kind}</span> {e.text}</li>
              ))}
            </ol>
          </div>
          <div className="panel">
            <h2>Imports & dossier</h2>
            <p><strong>Self:</strong> {packet.selfReview ? "imported" : "missing"}</p>
            {packet.selfReview && (
              <pre className="digest">{JSON.stringify(packet.selfReview.payload, null, 2)}</pre>
            )}
            <p><strong>Peers:</strong> {packet.peerReviews.length}</p>
            {packet.peerReviews.map((p) => (
              <div key={p.id} className="digest" style={{ marginBottom: 8 }}>
                <div className="muted">Author (EM-visible): {p.authorName}</div>
                <pre style={{ margin: 0 }}>{JSON.stringify(p.payload, null, 2)}</pre>
              </div>
            ))}
            <p><strong>Achievements</strong></p>
            <ul>{packet.achievements.map((a) => <li key={a.id}>{a.title}</li>)}</ul>
            <p><strong>Goals</strong></p>
            <ul>{packet.goals.map((g) => <li key={g.id}>{g.title} ({g.status})</li>)}</ul>
          </div>
        </div>

        <div className="panel stack">
          <h2>Manager draft</h2>
          <div className="field">
            <label>Overall (1–5)</label>
            <input type="number" min={1} max={5} value={overall} onChange={(e) => setOverall(Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Role fit</label>
            <textarea value={roleFit} onChange={(e) => setRoleFit(e.target.value)} placeholder="Against current RoleDefinition…" />
          </div>
          <div className="field">
            <label className="row" style={{ justifyContent: "space-between" }}>
              <span>Summary</span>
              <button
                type="button"
                className="btn ghost"
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
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} />
          </div>
          <div className="field">
            <label className="row" style={{ justifyContent: "space-between" }}>
              <span>Strengths</span>
              <button
                type="button"
                className="btn ghost"
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
            <textarea value={strengths} onChange={(e) => setStrengths(e.target.value)} />
          </div>
          <div className="field">
            <label className="row" style={{ justifyContent: "space-between" }}>
              <span>Growth areas</span>
              <button
                type="button"
                className="btn ghost"
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
            <textarea value={growth} onChange={(e) => setGrowth(e.target.value)} />
          </div>
          <div className="field">
            <label>Development plan</label>
            <textarea value={devPlan} onChange={(e) => setDevPlan(e.target.value)} />
          </div>
          <div className="field">
            <label>Promotion readiness</label>
            <select value={promo} onChange={(e) => setPromo(e.target.value as PromoReadiness)}>
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
                <button
                  type="button"
                  className="btn ghost"
                  onClick={async () => {
                    const res = await api<{ outputText: string }>("/api/ai/role-gap", {
                      method: "POST",
                      body: JSON.stringify({ cycleId, personId }),
                    });
                    setDigest((d) => `${d ?? ""}\n\n— Role gap —\n${res.outputText}`);
                  }}
                >
                  AI gap analysis
                </button>
                <Link className="btn secondary" to="/promotions">Promotion packet</Link>
              </div>
              {nextExpectations.map((e) => (
                <div key={e.id} className="field">
                  <label>{e.text}</label>
                  <select
                    value={gaps[e.id] ?? "emerging"}
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
            <textarea value={privateNotes} onChange={(e) => setPrivateNotes(e.target.value)} />
          </div>
          <button
            className="btn secondary"
            onClick={async () => {
              await save("finalized");
              const exp = await api(`/api/exports/subject/${cycleId}/${personId}`);
              setSubjectExport(exp);
            }}
          >
            Preview subject export
          </button>
          {subjectExport && (
            <pre className="digest">{JSON.stringify(subjectExport, null, 2)}</pre>
          )}
        </div>
      </div>
    </div>
  );
}
