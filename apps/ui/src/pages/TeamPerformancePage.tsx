import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { CycleCompareDTO, CycleDTO, RatingTrendsDTO, TeamPerformanceDTO } from "@prm/shared";
import { competencyLabel } from "@prm/shared";
import { api } from "../lib/api";
import { openHtmlExport } from "../lib/exports";
import { NextStep, PageHeader, Section } from "../components/PageChrome";
import { PageSectionsLayout, type SectionNavItem } from "../components/PageSectionsLayout";
import { AppSelect } from "../components/AppSelect";
import {
  BarChart,
  DeliverySparkline,
  Histogram,
  TrendSparkline,
  maxCount,
} from "../components/charts";

const PROMO_LABELS: Record<string, string> = {
  ready: "Ready",
  not_yet: "Not yet",
  too_early: "Too early",
  not_applicable: "N/A",
  unset: "Unset",
};

function formatMinutes(seconds: number) {
  if (seconds <= 0) return "—";
  const m = Math.round(seconds / 60);
  return `${m}m`;
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

function DeliveryScatter({
  people,
}: {
  people: TeamPerformanceDTO["people"];
}) {
  const rated = people.filter((p) => p.overall != null);
  if (rated.length === 0) {
    return <p className="muted">No overall ratings yet — points appear once you score drafts.</p>;
  }
  const maxDelivery = Math.max(1, ...rated.map((p) => p.deliveryDone ?? 0));
  const w = 420;
  const h = 200;
  const pad = { left: 36, right: 16, top: 16, bottom: 32 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  return (
    <svg className="tp-scatter" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Delivery vs overall">
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
        Delivery
      </text>
      {rated.map((p) => {
        const x = pad.left + (((p.overall ?? 1) - 1) / 4) * plotW;
        const y = pad.top + plotH - ((p.deliveryDone ?? 0) / maxDelivery) * plotH;
        return (
          <g key={p.personId}>
            <circle
              cx={x}
              cy={y}
              r={7}
              className={p.thinDeliveryEvidence ? "tp-dot thin" : "tp-dot"}
            />
            <title>
              {p.personName}: overall {p.overall}, {p.deliveryDone ?? 0} delivery
              {p.storyPointsDone != null ? `, ${p.storyPointsDone} pts` : ""}
            </title>
          </g>
        );
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

  const deliveryRows = [...(data?.people ?? [])]
    .map((p) => ({
      key: p.personId,
      label: p.personName,
      count: p.deliveryDone ?? 0,
    }))
    .sort((a, b) => b.count - a.count);
  const deliveryTotal = deliveryRows.reduce((s, r) => s + r.count, 0);
  const storyPointsTotal = (data?.people ?? []).reduce(
    (s, p) => s + (p.storyPointsDone ?? 0),
    0,
  );
  const storyPointsKnown = (data?.people ?? []).some((p) => p.storyPointsDone != null);

  return (
    <div className="stack">
      <PageHeader
        title="Team performance"
        job="See rating shape, work completed, competency averages, and coaching themes across the cycle."
        primary={
          data ? (
            <>
              <button
                type="button"
                className="btn"
                onClick={() => void openHtmlExport(`/api/exports/director-briefing/${data.cycleId}?format=html`)}
              >
                Director briefing
              </button>
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
          <AppSelect
            id="tp-cycle"
            value={cycleId || data?.cycleId || ""}
            onChange={(v) => setParams({ cycleId: v })}
            options={cycles.map((c) => ({
              value: c.id,
              label: `${c.name} (${c.status})`,
            }))}
          />
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

          <PageSectionsLayout
            sections={[
              { id: "tp-overview", label: "Overview" },
              { id: "tp-charts", label: "Charts" },
              { id: "tp-people", label: "People" },
              { id: "tp-trends", label: "Trends" },
              { id: "tp-compare", label: "Compare" },
            ] satisfies SectionNavItem[]}
          >
          <Section
            id="tp-overview"
            title="Overview"
            when="Use first to see whether this cycle’s ratings, evidence, and concerns look healthy."
            how="Read the five metrics below, then drill into charts or people when something looks off."
          >
            <div className="tp-metrics">
              <div className="tp-metric">
                <div className="muted">Avg overall</div>
                <strong>{data.avgOverall ?? "—"}</strong>
              </div>
              <div className="tp-metric">
                <div className="muted">Work completed</div>
                <strong>{deliveryTotal}</strong>
                <span className="muted">
                  {" "}
                  · issues + PRs
                  {storyPointsKnown ? ` · ${storyPointsTotal} pts` : ""}
                </span>
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
          </Section>

          <Section
            id="tp-charts"
            title="Charts"
            when="Use mid-cycle or before finalize to spot clustering, thin evidence, delivery skew, or promo skew."
            how="Scan each chart panel — distribution, work completed, delivery vs rating, evidence scatter, competencies, promo, writing time, levels, and themes."
          >
            <div className="tp-grid">
            <div className="panel stack">
              <h3 style={{ margin: 0 }}>Overall distribution</h3>
              <p className="muted" style={{ margin: 0 }}>
                Watch for clustering (everyone a 3 or 4) before you finalize.
              </p>
              <Histogram buckets={overallBuckets} ariaLabel="Overall rating distribution" />
            </div>

            <div className="panel stack">
              <h3 style={{ margin: 0 }}>Evidence vs overall</h3>
              <p className="muted" style={{ margin: 0 }}>
                Thin dossiers sit lower; extreme scores should sit higher.
              </p>
              <EvidenceScatter people={data.people} />
            </div>

            <div className="panel stack tp-span-2">
              <h3 style={{ margin: 0 }}>Work completed by person</h3>
              <p className="muted" style={{ margin: 0 }}>
                Issues done + PRs merged in this cycle window — delivery volume, not a score. Open a
                dossier for the breakdown.
              </p>
              {deliveryRows.every((r) => r.count === 0) ? (
                <p className="muted">
                  No synced delivery yet — connect Jira / Bitbucket / GitHub on person dossiers, or
                  check <Link to="/sprint-pulse">Sprint pulse</Link>.
                </p>
              ) : (
                <BarChart rows={deliveryRows} max={maxCount(deliveryRows.map((r) => r.count))} />
              )}
            </div>

            <div className="panel stack">
              <h3 style={{ margin: 0 }}>Delivery vs overall</h3>
              <p className="muted" style={{ margin: 0 }}>
                High ratings with near-zero delivery may need better cites — or a thin integration sync.
              </p>
              <DeliveryScatter people={data.people} />
            </div>

            <div className="panel stack">
              <h3 style={{ margin: 0 }}>Competency averages</h3>
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
              <h3 style={{ margin: 0 }}>Promo readiness</h3>
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
              <h3 style={{ margin: 0 }}>Writing time</h3>
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
              <h3 style={{ margin: 0 }}>Levels</h3>
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
              <h3 style={{ margin: 0 }}>1:1 themes</h3>
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
          </Section>

          <Section
            id="tp-people"
            title="People"
            when="Use to find individuals with thin evidence, rating deltas, or open writing work."
            how="Sort the table visually, then open a writing desk for anyone who needs a draft update."
          >
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
                            Open writing desk
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          {trends && trends.cycles.length > 0 && (
            <Section
              id="tp-trends"
              title="Rating trends across cycles"
              when="Use when you have multiple cycles and want to spot stagnation or sudden jumps."
              how="Read team average sparklines and per-cycle cells before the next packet."
            >
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
            </Section>
          )}

          {compare && (
            <Section
              id="tp-compare"
              title="Cycle compare"
              when="Use after a new cycle has ratings to see what moved versus the prior window."
              how="Compare distribution shift, movers (±1+), repeat thin dossiers, and theme drift below."
            >
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
            </Section>
          )}
          </PageSectionsLayout>
        </>
      )}
    </div>
  );
}
