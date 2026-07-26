import { useEffect, useState } from "react";
import type { DeliveryRollupDTO } from "@prm/shared";
import { api } from "../lib/api";

function thinLabel(flag: DeliveryRollupDTO["flags"]["thinDeliveryEvidence"]) {
  if (flag === "jira_rich_dossier_thin") {
    return "Thin delivery evidence: integrations look busy, but the dossier is light — add coaching notes or docs.";
  }
  if (flag === "dossier_rich_integrations_empty_window") {
    return "Thin delivery evidence: dossier is rich, but nothing landed in this review window from Jira/PRs.";
  }
  return null;
}

export function DeliveryRollupPanel({
  personId,
  cycleId,
}: {
  personId: string;
  cycleId?: string | null;
}) {
  const [rollup, setRollup] = useState<DeliveryRollupDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!personId) return;
    const qs = cycleId ? `?cycleId=${encodeURIComponent(cycleId)}` : "";
    api<DeliveryRollupDTO>(`/api/people/${personId}/delivery-rollup${qs}`)
      .then((r) => {
        setRollup(r);
        setError(null);
      })
      .catch((e) => {
        setRollup(null);
        setError(e instanceof Error ? e.message : "Failed to load delivery rollup");
      });
  }, [personId, cycleId]);

  if (error) return <p className="muted">{error}</p>;
  if (!rollup) return <p className="muted">Loading delivery rollup…</p>;

  const thin = thinLabel(rollup.flags.thinDeliveryEvidence);
  const bands = Object.entries(rollup.sizeBands);

  return (
    <div className="panel stack delivery-rollup">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Delivery in window</h2>
        <span className="muted mono">
          {rollup.windowStart} → {rollup.windowEnd}
        </span>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Cycle-scoped rollup from synced Jira / Bitbucket / GitHub — volume and collaboration signals, not a score.
      </p>
      {thin ? <p className="flag">{thin}</p> : null}
      <div className="delivery-rollup-grid">
        <div>
          <strong>{rollup.issuesDone}</strong>
          <div className="muted">Issues done</div>
        </div>
        <div>
          <strong>{rollup.issuesInProgress}</strong>
          <div className="muted">In progress</div>
        </div>
        <div>
          <strong>{rollup.storyPointsDone ?? "—"}</strong>
          <div className="muted">Story points</div>
        </div>
        <div>
          <strong>{rollup.prsMerged}</strong>
          <div className="muted">PRs merged</div>
        </div>
        <div>
          <strong>{rollup.reviewsGiven}</strong>
          <div className="muted">Reviews given</div>
        </div>
        <div>
          <strong>{rollup.openBugs}</strong>
          <div className="muted">Open bugs</div>
        </div>
      </div>
      {(rollup.blockedHours != null || rollup.reverts > 0 || bands.length > 0) && (
        <p className="muted" style={{ margin: 0 }}>
          {rollup.blockedHours != null ? `Blocked ~${rollup.blockedHours}h · ` : ""}
          {rollup.reverts > 0 ? `${rollup.reverts} revert-like PR(s) · ` : ""}
          {bands.length
            ? `PR size bands: ${bands.map(([k, v]) => `${k}×${v}`).join(", ")}`
            : null}
        </p>
      )}
      {rollup.themes.length > 0 && (
        <p className="muted" style={{ margin: 0 }}>
          Themes: {rollup.themes.map((t) => `${t.theme} (${t.count})`).join(", ")}
        </p>
      )}
      {rollup.citeSuggestions.length > 0 && (
        <div>
          <p className="muted" style={{ marginBottom: 4 }}>
            Suggested cites for AI digests / drafts
          </p>
          <ul className="delivery-cite-list">
            {rollup.citeSuggestions.map((c) => (
              <li key={c.achievementId}>
                <code>{c.citeToken}</code> {c.label}{" "}
                <span className="muted">({c.reason})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
