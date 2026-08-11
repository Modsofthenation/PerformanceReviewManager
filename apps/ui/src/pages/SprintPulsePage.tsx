import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { SprintPulseDTO } from "@prm/shared";
import { api } from "../lib/api";
import { NextStep, PageHeader, Section } from "../components/PageChrome";
import { PageSectionsLayout } from "../components/PageSectionsLayout";
import { AppSelect } from "../components/AppSelect";

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
        primary={<Link className="btn secondary" to="/team-performance">Open team performance</Link>}
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
      <Section
        id="pulse-window"
        title="Date window"
        when="Use mid-cycle when you want a coaching snapshot for a sprint or recent weeks."
        how="Pick a preset or custom from/to dates — counts and people rows update to that range."
      >
        <div className="row" style={{ flexWrap: "wrap", gap: 12, alignItems: "end" }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="pulse-preset">Preset</label>
            <AppSelect
              id="pulse-preset"
              value={preset}
              onChange={(v) => setParams({ preset: v })}
              isSearchable={false}
              options={PRESETS.map((p) => ({ value: p.id, label: p.label }))}
            />
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
      </Section>

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
            action={<Link className="btn secondary" to="/team">Open team roster</Link>}
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
            <Section
              id="pulse-themes"
              title="1:1 themes in window"
              when="Use after 1:1s to see which coaching themes recurred in this date range."
              how="Scan the bars — high counts flag topics to revisit in the next 1:1."
            >
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
            </Section>
            <Section
              id="pulse-freshness"
              title="Evidence freshness"
              when="Use before finalize when drafts may only cite older evidence."
              how="Check stale-only cite count, then open people rows below to refresh links in dossiers."
              action={<Link className="btn secondary" to="/team">Open team roster</Link>}
            >
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
            </Section>
          </div>

          <Section
            id="pulse-people"
            title="People"
            when="Use when coaching individuals mid-cycle or hunting stale cites."
            how="Scan each row, then open a dossier to capture fresh evidence or review open concerns."
            action={<Link className="btn secondary" to="/team">Open team roster</Link>}
          >
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
                          Open dossier
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
      </PageSectionsLayout>
    </div>
  );
}
