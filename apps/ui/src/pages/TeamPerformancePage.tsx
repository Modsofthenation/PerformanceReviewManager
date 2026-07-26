import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { CycleCompareDTO, CycleDTO, RatingTrendsDTO, TeamPerformanceDTO } from "@prm/shared";
import { competencyLabel } from "@prm/shared";
import { api } from "../lib/api";
import { NextStep, PageHeader } from "../components/PageChrome";

const PROMO_LABELS: Record<string, string> = {
  ready: "Ready",
  not_yet: "Not yet",
  too_early: "Too early",
  not_applicable: "N/A",
  unset: "Unset",
};

function maxCount(values: number[]) {
  return Math.max(1, ...values);
}

function formatMinutes(seconds: number) {
  if (seconds <= 0) return "—";
  const m = Math.round(seconds / 60);
  return `${m}m`;
}

function BarChart({
  rows,
  max,
}: {
  rows: Array<{ key: string; label: string; count: number }>;
  max: number;
}) {
  return (
    <div className="consistency-bars">
      {rows.map((row) => (
        <div key={row.key} className="consistency-bar-row tp-bar-row">
          <div className="consistency-bar-label tp-bar-label" title={row.label}>
            {row.label}
          </div>
          <div className="consistency-bar-track">
            <div
              className="consistency-bar-fill"
              style={{ width: `${(row.count / max) * 100}%` }}
            />
          </div>
          <div className="consistency-bar-count">{row.count}</div>
        </div>
      ))}
    </div>
  );
}

function Histogram({
  buckets,
}: {
  buckets: Array<{ key: string; label: string; count: number }>;
}) {
  const max = maxCount(buckets.map((b) => b.count));
  const height = 140;
  const gap = 10;
  const barW = 36;
  const width = buckets.length * (barW + gap) + gap;
  return (
    <svg
      className="tp-histogram"
      viewBox={`0 0 ${width} ${height + 28}`}
      role="img"
      aria-label="Overall rating distribution"
    >
      {buckets.map((b, i) => {
        const h = b.count === 0 ? 0 : Math.max(4, (b.count / max) * height);
        const x = gap + i * (barW + gap);
        const y = height - h;
        return (
          <g key={b.key}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={h}
              rx={6}
              className="tp-hist-bar"
            />
            <text x={x + barW / 2} y={height + 16} textAnchor="middle" className="tp-hist-label">
              {b.label}
            </text>
            <text x={x + barW / 2} y={y - 6} textAnchor="middle" className="tp-hist-count">
              {b.count}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function EvidenceScatter({
  people,
}: {
  people: TeamPerformanceDTO["people"];
}) {
  const rated = people.filter((p) => p.overall != null);
  if (rated.length === 0) {
    return <p className="muted">No overall ratings yet — points appear once you score drafts.</p>;
  }
  const maxEvidence = Math.max(1, ...rated.map((p) => p.evidenceCount));
  const w = 420;
  const h = 200;
  const pad = { left: 36, right: 16, top: 16, bottom: 32 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  return (
    <svg className="tp-scatter" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Evidence vs overall">
      <line
        x1={pad.left}
        y1={pad.top + plotH}
        x2={pad.left + plotW}
        y2={pad.top + plotH}
        className="tp-axis"
      />
      <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + plotH} className="tp-axis" />
      {[1, 2, 3, 4, 5].map((n) => {
        const x = pad.left + ((n - 1) / 4) * plotW;
        return (
          <text key={n} x={x} y={h - 8} textAnchor="middle" className="tp-hist-label">
            {n}
          </text>
        );
      })}
      <text
        x={12}
        y={pad.top + plotH / 2}
        textAnchor="middle"
        className="tp-hist-label"
        transform={`rotate(-90 12 ${pad.top + plotH / 2})`}
      >
        Evidence
      </text>
      {rated.map((p) => {
        const x = pad.left + (((p.overall ?? 1) - 1) / 4) * plotW;
        const y = pad.top + plotH - (p.evidenceCount / maxEvidence) * plotH;
        return (
          <g key={p.personId}>
            <circle cx={x} cy={y} r={7} className={p.thin ? "tp-dot thin" : "tp-dot"} />
            <title>
              {p.personName}: overall {p.overall}, {p.evidenceCount} evidence
            </title>
          </g>
        );
      })}
    </svg>
  );
}

function TrendSparkline({
  points,
  label,
}: {
  points: Array<{ value: number | null; cycleName: string }>;
  label: string;
}) {
  const w = 160;
  const h = 36;
  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  if (vals.length < 1) return <span className="muted">—</span>;
  const min = 1;
  const max = 5;
  const coords = points
    .map((p, i) => {
      if (p.value == null) return null;
      const x = points.length === 1 ? w / 2 : (i / (points.length - 1)) * (w - 8) + 4;
      const y = h - 4 - ((p.value - min) / (max - min)) * (h - 8);
      return `${x},${y}`;
    })
    .filter(Boolean);
  return (
    <svg className="tp-trend" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      <polyline points={coords.join(" ")} className="tp-trend-line" fill="none" />
      {points.map((p, i) => {
        if (p.value == null) return null;
        const x = points.length === 1 ? w / 2 : (i / (points.length - 1)) * (w - 8) + 4;
        const y = h - 4 - ((p.value - min) / (max - min)) * (h - 8);
        return <circle key={p.cycleName} cx={x} cy={y} r={2.5} className="tp-trend-dot" />;
      })}
    </svg>
  );
}

function DeliverySparkline({ values, label }: { values: number[]; label: string }) {
  const w = 100;
  const h = 28;
  if (values.length < 1) return <span className="muted">—</span>;
  const max = Math.max(1, ...values);
  const coords = values.map((v, i) => {
    const x = values.length === 1 ? w / 2 : (i / (values.length - 1)) * (w - 8) + 4;
    const y = h - 4 - (v / max) * (h - 8);
    return `${x},${y}`;
  });
  return (
    <svg className="tp-trend" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      <polyline points={coords.join(" ")} className="tp-trend-line" fill="none" />
      {values.map((v, i) => {
        const x = values.length === 1 ? w / 2 : (i / (values.length - 1)) * (w - 8) + 4;
        const y = h - 4 - (v / max) * (h - 8);
        return <circle key={i} cx={x} cy={y} r={2} className="tp-trend-dot" />;
      })}
    </svg>
  );
}

export function TeamPerformancePage() {
  const [params, setParams] = useSearchParams();
  const [cycles, setCycles] = useState<CycleDTO[]>([]);
  const [data, setData] = useState<TeamPerformanceDTO | null>(null);
  const [trends, setTrends] = useState<RatingTrendsDTO | null>(null);
  const [compare, setCompare] = useState<CycleCompareDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cycleId = params.get("cycleId") ?? "";

  async function load(cid?: string) {
    try {
      const qs = cid ? `?cycleId=${encodeURIComponent(cid)}` : "";
      const [res, trendRes, compareRes] = await Promise.all([
        api<TeamPerformanceDTO>(`/api/team-performance${qs}`),
        api<RatingTrendsDTO>("/api/rating-trends"),
        api<CycleCompareDTO>(`/api/cycle-compare${qs}`),
      ]);
      setData(res);
      setTrends(trendRes);
      setCompare(compareRes);
      setError(null);
      if (!cid && res.cycleId) setParams({ cycleId: res.cycleId }, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load team performance");
    }
  }

  useEffect(() => {
    void (async () => {
      const list = await api<CycleDTO[]>("/api/cycles");
      setCycles(list);
      await load(cycleId || undefined);
    })();
  }, []);

  useEffect(() => {
    if (cycleId) void load(cycleId);
  }, [cycleId]);

  const overallBuckets = ["1", "2", "3", "4", "5", "unset"].map((key) => ({
    key,
    label: key === "unset" ? "—" : key,
    count: data?.distribution[key] ?? 0,
  }));

  const competencyRows =
    data?.competencies.map((c) => ({
      key: c.key,
      label: c.label,
      count: c.avg ?? 0,
    })) ?? [];
  const competencyMax = 5;

  return (
    <div className="stack">
      <PageHeader
        title="Team performance"
        job="See rating shape, competency averages, writing effort, and coaching themes across the cycle."
        primary={
          data ? (
            <>
              <Link className="btn secondary" to="/sprint-pulse">
                Sprint pulse
              </Link>
              <Link className="btn secondary" to={`/consistency?cycleId=${data.cycleId}`}>
                Consistency view
              </Link>
            </>
          ) : undefined
        }
      />

      {error && (
        <NextStep
          tone="warn"
          label="Could not load team performance"
          detail={error}
          action={
            <button className="btn" type="button" onClick={() => void load(cycleId || undefined)}>
              Retry
            </button>
          }
        />
      )}

      <div className="panel">
        <div className="field" style={{ marginBottom: 0, maxWidth: 360 }}>
          <label htmlFor="tp-cycle">Cycle</label>
          <select
            id="tp-cycle"
            value={cycleId || data?.cycleId || ""}
            onChange={(e) => setParams({ cycleId: e.target.value })}
          >
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.status})
              </option>
            ))}
          </select>
        </div>
      </div>

      {!data ? (
        <p>Loading…</p>
      ) : (
        <>
          <NextStep
            tone={data.evidence.thinDossierCount > 0 ? "warn" : "ok"}
            label={`${data.cycleName} · ${data.ratedCount}/${data.participantCount} rated`}
            detail={
              data.priorCycle
                ? `Compared with prior cycle ${data.priorCycle.cycleName} where available.`
                : "Pick a later cycle once you have history for prior-overall deltas."
            }
            action={<Link className="btn secondary" to="/">Command center</Link>}
          />

          <div className="tp-metrics">
            <div className="tp-metric">
              <div className="muted">Avg overall</div>
              <strong>{data.avgOverall ?? "—"}</strong>
            </div>
            <div className="tp-metric">
              <div className="muted">Evidence coverage</div>
              <strong>{data.evidence.coveragePct}%</strong>
              <span className="muted"> · avg {data.evidence.avgLinkedSources} sources</span>
            </div>
            <div className="tp-metric">
              <div className="muted">Thin dossiers</div>
              <strong>{data.evidence.thinDossierCount}</strong>
              <span className="muted"> / {data.participantCount}</span>
            </div>
            <div className="tp-metric">
              <div className="muted">Open concerns</div>
              <strong>{data.openConcerns}</strong>
            </div>
          </div>

          <div className="tp-grid">
            <div className="panel stack">
              <h2 style={{ margin: 0 }}>Overall distribution</h2>
              <p className="muted" style={{ margin: 0 }}>
                Watch for clustering (everyone a 3 or 4) before you finalize.
              </p>
              <Histogram buckets={overallBuckets} />
            </div>

            <div className="panel stack">
              <h2 style={{ margin: 0 }}>Evidence vs overall</h2>
              <p className="muted" style={{ margin: 0 }}>
                Thin dossiers sit lower; extreme scores should sit higher.
              </p>
              <EvidenceScatter people={data.people} />
            </div>

            <div className="panel stack">
              <h2 style={{ margin: 0 }}>Competency averages</h2>
              <p className="muted" style={{ margin: 0 }}>
                Team mean on the 1–5 scale (people with that competency scored).
              </p>
              {competencyRows.length === 0 ? (
                <p className="muted">No competency scores yet.</p>
              ) : (
                <div className="consistency-bars">
                  {data.competencies.map((c) => (
                    <div key={c.key} className="consistency-bar-row tp-bar-row">
                      <div className="consistency-bar-label tp-bar-label" title={c.label}>
                        {c.label}
                      </div>
                      <div className="consistency-bar-track">
                        <div
                          className="consistency-bar-fill"
                          style={{ width: `${((c.avg ?? 0) / competencyMax) * 100}%` }}
                        />
                      </div>
                      <div className="consistency-bar-count">{c.avg ?? "—"}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="panel stack">
              <h2 style={{ margin: 0 }}>Promo readiness</h2>
              <BarChart
                rows={Object.entries(data.promoReadiness).map(([key, count]) => ({
                  key,
                  label: PROMO_LABELS[key] ?? key,
                  count,
                }))}
                max={maxCount(Object.values(data.promoReadiness))}
              />
            </div>

            <div className="panel stack">
              <h2 style={{ margin: 0 }}>Writing time</h2>
              <BarChart
                rows={data.writingBuckets.map((b) => ({
                  key: b.id,
                  label: b.label,
                  count: b.count,
                }))}
                max={maxCount(data.writingBuckets.map((b) => b.count))}
              />
            </div>

            <div className="panel stack">
              <h2 style={{ margin: 0 }}>Levels</h2>
              {data.levels.length === 0 ? (
                <p className="muted">No people in this cycle.</p>
              ) : (
                <BarChart
                  rows={data.levels.map((l) => ({
                    key: l.levelKey,
                    label: l.levelKey,
                    count: l.count,
                  }))}
                  max={maxCount(data.levels.map((l) => l.count))}
                />
              )}
            </div>

            <div className="panel stack tp-span-2">
              <h2 style={{ margin: 0 }}>1:1 themes</h2>
              <p className="muted" style={{ margin: 0 }}>
                Tags from feedback notes across the team (year-round coaching signal).
              </p>
              {data.themes.length === 0 ? (
                <p className="muted">No themes tagged yet — add them on person dossiers.</p>
              ) : (
                <BarChart
                  rows={data.themes.map((t) => ({
                    key: t.theme,
                    label: t.theme,
                    count: t.count,
                  }))}
                  max={maxCount(data.themes.map((t) => t.count))}
                />
              )}
            </div>
          </div>

          <div className="panel stack">
            <h2 style={{ margin: 0 }}>People</h2>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Level</th>
                    <th>Overall</th>
                    {data.priorCycle ? <th>Δ vs prior</th> : null}
                    <th>Writing</th>
                    <th>Delivery</th>
                    <th>Evidence</th>
                    <th>Competencies</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.people.map((p) => {
                    const delta =
                      p.overall != null && p.priorOverall != null ? p.overall - p.priorOverall : null;
                    const comps = Object.entries(p.competencies);
                    const trend = [...(p.deliveryTrend ?? []), p.deliveryDone ?? 0];
                    return (
                      <tr key={p.personId}>
                        <td>
                          <Link to={`/team/${p.personId}`}>{p.personName}</Link>
                          {p.thin ? <span className="flag">thin</span> : null}
                          {p.thinDeliveryEvidence ? (
                            <span className="flag" title={p.thinDeliveryEvidence}>
                              thin delivery
                            </span>
                          ) : null}
                        </td>
                        <td className="muted">{p.levelKey ?? "—"}</td>
                        <td>
                          <strong>{p.overall ?? "—"}</strong>
                          <span className="muted"> · {p.managerStatus}</span>
                        </td>
                        {data.priorCycle ? (
                          <td className={delta == null ? "muted" : delta > 0 ? "tp-up" : delta < 0 ? "tp-down" : "muted"}>
                            {delta == null ? "—" : delta > 0 ? `+${delta}` : String(delta)}
                          </td>
                        ) : null}
                        <td>{formatMinutes(p.writingSeconds)}</td>
                        <td>
                          <div className="row" style={{ gap: 8, alignItems: "center" }}>
                            <span>
                              {p.deliveryDone ?? 0}
                              {p.storyPointsDone != null ? (
                                <span className="muted"> · {p.storyPointsDone} pts</span>
                              ) : null}
                            </span>
                            <DeliverySparkline values={trend} label={`${p.personName} delivery trend`} />
                          </div>
                        </td>
                        <td>
                          {p.evidenceCount}
                          <span className="muted"> · {p.linkedSources} linked</span>
                        </td>
                        <td>
                          {comps.length === 0 ? (
                            <span className="muted">—</span>
                          ) : (
                            <div className="tp-spark" title={comps.map(([k, v]) => `${competencyLabel(k)} ${v}`).join(", ")}>
                              {comps.map(([k, v]) => (
                                <span
                                  key={k}
                                  className="tp-spark-bar"
                                  style={{ height: `${(v / 5) * 100}%` }}
                                />
                              ))}
                            </div>
                          )}
                        </td>
                        <td>
                          <Link className="btn secondary" to={`/cycles/${data.cycleId}/write/${p.personId}`}>
                            Desk
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {trends && trends.cycles.length > 0 && (
            <div className="tp-grid">
              <div className="panel stack tp-span-2">
                <h2 style={{ margin: 0 }}>Rating trends across cycles</h2>
                <p className="muted" style={{ margin: 0 }}>
                  Team averages (manager ratings). Spot stagnation or sudden jumps before the next packet.
                </p>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Series</th>
                        <th>Sparkline</th>
                        {trends.cycles.map((c) => (
                          <th key={c.cycleId}>{c.cycleName}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trends.team.map((series) => (
                        <tr key={series.key}>
                          <td>{series.label}</td>
                          <td>
                            <TrendSparkline
                              label={series.label}
                              points={series.points.map((p) => ({
                                value: p.value,
                                cycleName: p.cycleName,
                              }))}
                            />
                          </td>
                          {series.points.map((p) => (
                            <td key={p.cycleId}>{p.value ?? "—"}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {compare && (
            <div className="panel stack">
              <h2 style={{ margin: 0 }}>Cycle compare</h2>
              <p className="muted" style={{ margin: 0 }}>
                {compare.prior
                  ? `${compare.prior.cycleName} → ${compare.current.cycleName}`
                  : `${compare.current.cycleName} (no prior cycle yet)`}
              </p>
              {compare.prior ? (
                <div className="tp-grid">
                  <div className="stack">
                    <h3 style={{ margin: 0 }}>Distribution shift</h3>
                    <div className="consistency-bars">
                      {["1", "2", "3", "4", "5", "unset"].map((bucket) => {
                        const cur = compare.current.distribution[bucket] ?? 0;
                        const prev = compare.prior?.distribution[bucket] ?? 0;
                        const max = Math.max(1, cur, prev);
                        return (
                          <div key={bucket} className="consistency-bar-row tp-bar-row">
                            <div className="consistency-bar-label">{bucket === "unset" ? "—" : bucket}</div>
                            <div className="consistency-bar-track compare-track">
                              <div className="compare-fill prior" style={{ width: `${(prev / max) * 100}%` }} />
                              <div className="compare-fill current" style={{ width: `${(cur / max) * 100}%` }} />
                            </div>
                            <div className="consistency-bar-count">
                              {prev}→{cur}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="muted" style={{ margin: 0 }}>
                      Avg overall {compare.prior.avgOverall ?? "—"} → {compare.current.avgOverall ?? "—"}
                    </p>
                  </div>
                  <div className="stack">
                    <h3 style={{ margin: 0 }}>Movers (±1+)</h3>
                    {compare.movers.length === 0 ? (
                      <p className="muted">No overall moves between cycles.</p>
                    ) : (
                      <ul className="timeline-list">
                        {compare.movers.map((m) => (
                          <li key={m.personId}>
                            <Link to={`/team/${m.personId}`}>{m.personName}</Link>{" "}
                            <span className={m.delta && m.delta > 0 ? "tp-up" : "tp-down"}>
                              {m.from ?? "—"} → {m.to ?? "—"} ({m.delta && m.delta > 0 ? "+" : ""}
                              {m.delta})
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <h3 style={{ margin: "0.75rem 0 0" }}>Repeat thin dossiers</h3>
                    {compare.repeatThin.length === 0 ? (
                      <p className="muted">None repeating from the prior cycle.</p>
                    ) : (
                      <ul className="timeline-list">
                        {compare.repeatThin.map((p) => (
                          <li key={p.personId}>
                            <Link to={`/team/${p.personId}`}>{p.personName}</Link>
                          </li>
                        ))}
                      </ul>
                    )}
                    <h3 style={{ margin: "0.75rem 0 0" }}>Theme drift</h3>
                    <p className="muted" style={{ margin: 0 }}>
                      Appeared: {compare.themeDrift.appeared.join(", ") || "—"}
                      <br />
                      Disappeared: {compare.themeDrift.disappeared.join(", ") || "—"}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="muted">Add another cycle with ratings to unlock compare.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
