import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { DeliveryRollupDTO, RatingTrendsDTO, TeamPerformanceDTO } from "@prm/shared";
import { api } from "../lib/api";
import { MixBarChart, SeriesChart, TrendSparkline } from "./charts";

/**
 * Person-level performance graphs from delivery rollup + cycle history.
 * Volume signals only — not a score.
 */
export function PersonPerformanceCharts({
  personId,
  cycleId,
}: {
  personId: string;
  cycleId?: string | null;
}) {
  const [rollup, setRollup] = useState<DeliveryRollupDTO | null>(null);
  const [team, setTeam] = useState<TeamPerformanceDTO | null>(null);
  const [trends, setTrends] = useState<RatingTrendsDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!personId) return;
    let cancelled = false;
    void (async () => {
      try {
        const qs = cycleId ? `?cycleId=${encodeURIComponent(cycleId)}` : "";
        const [r, tp, rt] = await Promise.all([
          api<DeliveryRollupDTO>(`/api/people/${personId}/delivery-rollup${qs}`),
          api<TeamPerformanceDTO>(`/api/team-performance${qs}`).catch(() => null),
          api<RatingTrendsDTO>("/api/rating-trends").catch(() => null),
        ]);
        if (cancelled) return;
        setRollup(r);
        setTeam(tp);
        setTrends(rt);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load performance graphs");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [personId, cycleId]);

  if (error) return <p className="muted">{error}</p>;
  if (!rollup) return <p className="muted">Loading performance graphs…</p>;

  const personRow = team?.people.find((p) => p.personId === personId);
  const priorTrend = personRow?.deliveryTrend ?? [];
  const deliverySeries = personRow
    ? [
        ...priorTrend.map((v, i) => ({
          label: priorTrend.length === 1 ? "Prior" : `−${priorTrend.length - i}`,
          value: v,
        })),
        { label: team?.cycleName ?? "Current", value: personRow.deliveryDone },
      ]
    : [{ label: "This window", value: rollup.issuesDone + rollup.prsMerged }];

  const ratingPerson = trends?.people.find((p) => p.personId === personId);
  const mixRows = [
    { key: "done", label: "Issues done", count: rollup.issuesDone },
    { key: "wip", label: "In progress", count: rollup.issuesInProgress },
    { key: "prs", label: "PRs merged", count: rollup.prsMerged },
    { key: "reviews", label: "Reviews given", count: rollup.reviewsGiven },
    { key: "bugs", label: "Open bugs", count: rollup.openBugs },
  ];

  return (
    <div className="tp-grid person-perf-grid">
      <div className="panel stack">
        <h3 style={{ margin: 0 }}>Work in this window</h3>
        <p className="muted" style={{ margin: 0 }}>
          Synced delivery volume for {rollup.windowStart} → {rollup.windowEnd}
          {rollup.storyPointsDone != null ? ` · ${rollup.storyPointsDone} story points done` : ""}.
        </p>
        <MixBarChart rows={mixRows} />
      </div>

      <div className="panel stack">
        <h3 style={{ margin: 0 }}>Delivery across cycles</h3>
        <p className="muted" style={{ margin: 0 }}>
          Issues done + PRs merged (oldest → newest). Not a performance score.
        </p>
        <SeriesChart points={deliverySeries} label="Delivery across cycles" />
        {team ? (
          <p className="muted" style={{ margin: 0 }}>
            <Link to={`/team-performance?cycleId=${team.cycleId}`}>Compare with team</Link>
          </p>
        ) : null}
      </div>

      {ratingPerson && ratingPerson.overall.some((p) => p.value != null) ? (
        <div className="panel stack tp-span-2">
          <h3 style={{ margin: 0 }}>Overall rating trend</h3>
          <p className="muted" style={{ margin: 0 }}>
            Manager overall scores across cycles where a draft was rated.
          </p>
          <div className="row" style={{ gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <TrendSparkline
              label={`${ratingPerson.personName} overall`}
              points={ratingPerson.overall.map((p) => ({
                value: p.value,
                cycleName: p.cycleName,
              }))}
            />
            <div className="person-rating-series muted">
              {ratingPerson.overall.map((p) => (
                <span key={p.cycleId}>
                  {p.cycleName}: <strong>{p.value ?? "—"}</strong>
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
