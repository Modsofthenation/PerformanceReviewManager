import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { SprintPulseDTO } from "@prm/shared";
import { api } from "../lib/api";
import { NextStep, PageHeader } from "../components/PageChrome";
import { PageSectionsLayout } from "../components/PageSectionsLayout";

const PRESETS = [
  { id: "last_7", label: "Last 7 days" },
  { id: "last_14", label: "Last 14 days" },
  { id: "last_30", label: "Last 30 days" },
];

export function SprintPulsePage() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<SprintPulseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preset = params.get("preset") ?? "last_14";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  async function load() {
    try {
      const qs = new URLSearchParams();
      if (from && to) {
        qs.set("from", from);
        qs.set("to", to);
      } else {
        qs.set("preset", preset);
      }
      const res = await api<SprintPulseDTO>(`/api/sprint-pulse?${qs}`);
      setData(res);
      setError(null);
      if (!from && !to) {
        setParams({ preset: res.preset, from: res.from, to: res.to }, { replace: true });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sprint pulse");
    }
  }

  useEffect(() => {
    void load();
  }, [preset, from, to]);

  return (
    <div className="stack">
      <PageHeader
        title="Sprint pulse"
        job="Mid-cycle coaching view: what landed in a date window, not final ratings."
        primary={<Link className="btn secondary" to="/team-performance">Team performance</Link>}
      />

      {error && (
        <NextStep
          tone="warn"
          label="Could not load sprint pulse"
          detail={error}
          action={
            <button className="btn" type="button" onClick={() => void load()}>
              Retry
            </button>
          }
        />
      )}

      <PageSectionsLayout
        sections={[
          { id: "pulse-window", label: "Window" },
          { id: "pulse-themes", label: "Themes" },
          { id: "pulse-freshness", label: "Freshness" },
          { id: "pulse-people", label: "People" },
        ]}
      >
      <div className="panel stack page-section" id="pulse-window">
        <div className="row" style={{ flexWrap: "wrap", gap: 12, alignItems: "end" }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="pulse-preset">Preset</label>
            <select
              id="pulse-preset"
              value={preset}
              onChange={(e) => setParams({ preset: e.target.value })}
            >
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="pulse-from">From</label>
            <input
              id="pulse-from"
              type="date"
              value={from || data?.from || ""}
              onChange={(e) =>
                setParams({
                  from: e.target.value,
                  to: to || data?.to || e.target.value,
                  preset: "custom",
                })
              }
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="pulse-to">To</label>
            <input
              id="pulse-to"
              type="date"
              value={to || data?.to || ""}
              onChange={(e) =>
                setParams({
                  from: from || data?.from || e.target.value,
                  to: e.target.value,
                  preset: "custom",
                })
              }
            />
          </div>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Counts achievements (including Jira / Bitbucket sync), feedback themes, documents, and open
          concerns dated in the window. Flags people whose manager-draft cites are all older than the window.
        </p>
      </div>

      {!data ? (
        <p>Loading…</p>
      ) : (
        <>
          <NextStep
            tone={data.summary.staleCitePeople > 0 ? "warn" : "ok"}
            label={`${data.from} → ${data.to}`}
            detail={
              data.summary.staleCitePeople > 0
                ? `${data.summary.staleCitePeople} draft(s) only cite older evidence. Prefer fresher cites before finalize.`
                : "Evidence freshness looks healthy for drafts that have cites."
            }
            action={<Link className="btn secondary" to="/team">Open team</Link>}
          />

          <div className="tp-metrics">
            <div className="tp-metric">
              <div className="muted">Achievements</div>
              <strong>{data.summary.achievements}</strong>
              <span className="muted">
                {" "}
                · {data.summary.jira} Jira · {data.summary.bitbucket} Bitbucket ·{" "}
                {data.summary.github} GitHub
              </span>
            </div>
            <div className="tp-metric">
              <div className="muted">Feedback</div>
              <strong>{data.summary.feedback}</strong>
            </div>
            <div className="tp-metric">
              <div className="muted">Documents</div>
              <strong>{data.summary.documents}</strong>
            </div>
            <div className="tp-metric">
              <div className="muted">Open concerns</div>
              <strong>{data.summary.openConcerns}</strong>
            </div>
          </div>

          <div className="tp-grid">
            <div className="panel stack page-section" id="pulse-themes">
              <h2 style={{ margin: 0 }}>1:1 themes in window</h2>
              {data.themes.length === 0 ? (
                <p className="muted">No themes tagged on feedback in this range.</p>
              ) : (
                <div className="consistency-bars">
                  {data.themes.map((t) => (
                    <div key={t.theme} className="consistency-bar-row tp-bar-row">
                      <div className="consistency-bar-label tp-bar-label">{t.theme}</div>
                      <div className="consistency-bar-track">
                        <div
                          className="consistency-bar-fill"
                          style={{
                            width: `${(t.count / Math.max(1, data.themes[0].count)) * 100}%`,
                          }}
                        />
                      </div>
                      <div className="consistency-bar-count">{t.count}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="panel stack page-section" id="pulse-freshness">
              <h2 style={{ margin: 0 }}>Evidence freshness</h2>
              <p className="muted" style={{ margin: 0 }}>
                In-window dossier items vs older items, plus whether current draft cites are stale.
              </p>
              <ul className="muted" style={{ margin: 0 }}>
                <li>
                  <strong>{data.summary.staleCitePeople}</strong> people with stale-only cites
                </li>
                <li>
                  Throughput:{" "}
                  <strong>
                    {data.summary.jira + data.summary.bitbucket + data.summary.github}
                  </strong>{" "}
                  synced tickets / PRs in window
                </li>
              </ul>
            </div>
          </div>

          <div className="panel stack page-section" id="pulse-people">
            <h2 style={{ margin: 0 }}>People</h2>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Achievements</th>
                    <th>Jira / BB / GH</th>
                    <th>Feedback</th>
                    <th>Concerns</th>
                    <th>In window / older</th>
                    <th>Draft cites</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.people.map((p) => (
                    <tr key={p.personId}>
                      <td>
                        <Link to={`/team/${p.personId}`}>{p.personName}</Link>
                        {p.staleOnlyCites ? <span className="flag">stale cites</span> : null}
                      </td>
                      <td>{p.achievements}</td>
                      <td>
                        {p.jira} / {p.bitbucket} / {p.github}
                      </td>
                      <td>
                        {p.feedback}
                        {p.themes.length ? (
                          <span className="muted"> · {p.themes.slice(0, 3).join(", ")}</span>
                        ) : null}
                      </td>
                      <td>{p.openConcerns}</td>
                      <td>
                        {p.inWindowEvidence} / {p.olderEvidence}
                      </td>
                      <td>
                        {p.linkedInWindow} fresh · {p.linkedStale} stale
                      </td>
                      <td>
                        <Link className="btn secondary" to={`/team/${p.personId}`}>
                          Dossier
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      </PageSectionsLayout>
    </div>
  );
}
