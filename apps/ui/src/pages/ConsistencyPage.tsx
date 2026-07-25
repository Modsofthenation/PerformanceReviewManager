import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { ConsistencyDTO, CycleDTO } from "@prm/shared";
import { competencyLabel } from "@prm/shared";
import { api } from "../lib/api";
import { NextStep, PageHeader } from "../components/PageChrome";

export function ConsistencyPage() {
  const [params, setParams] = useSearchParams();
  const [cycles, setCycles] = useState<CycleDTO[]>([]);
  const [data, setData] = useState<ConsistencyDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cycleId = params.get("cycleId") ?? "";

  async function load(cid?: string) {
    try {
      const qs = cid ? `?cycleId=${encodeURIComponent(cid)}` : "";
      const res = await api<ConsistencyDTO>(`/api/consistency${qs}`);
      setData(res);
      setError(null);
      if (!cid && res.cycleId) setParams({ cycleId: res.cycleId }, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load consistency");
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

  const maxBar = data
    ? Math.max(1, ...Object.values(data.distribution).filter((n) => typeof n === "number"))
    : 1;

  const thin = data?.cards.filter((c) => c.flags.some((f) => f.startsWith("thin:") || f === "missing_evidence")) ?? [];

  return (
    <div className="stack">
      <PageHeader
        title="Consistency"
        job="Check rating distribution and side-by-side drafts across your directs before you finalize."
        primary={
          data?.cards[0] ? (
            <Link className="btn" to={`/cycles/${data.cycleId}/write/${data.cards[0].personId}`}>
              Open first writing desk
            </Link>
          ) : undefined
        }
      />

      {error && (
        <NextStep
          tone="warn"
          label="Could not load consistency"
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
          <label htmlFor="consistency-cycle">Cycle</label>
          <select
            id="consistency-cycle"
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
          {thin.length > 0 ? (
            <NextStep
              tone="warn"
              label={`${thin.length} draft(s) need evidence outside the middle band`}
              detail="Extreme overall/competency scores without links will block finalize."
              action={
                <Link className="btn" to={`/cycles/${data.cycleId}/write/${thin[0].personId}`}>
                  Fix {thin[0].personName}
                </Link>
              }
            />
          ) : (
            <NextStep
              tone="ok"
              label={`Distribution for ${data.cycleName}`}
              detail="Scan for clustering (everyone a 4) and uneven evidence before sharing packets."
              action={<Link className="btn secondary" to="/cycles">Back to cycles</Link>}
            />
          )}

          <div className="panel">
            <h2>Overall distribution</h2>
            <div className="consistency-bars">
              {["1", "2", "3", "4", "5", "unset"].map((bucket) => {
                const n = data.distribution[bucket] ?? 0;
                return (
                  <div key={bucket} className="consistency-bar-row">
                    <div className="consistency-bar-label">{bucket === "unset" ? "—" : bucket}</div>
                    <div className="consistency-bar-track">
                      <div
                        className="consistency-bar-fill"
                        style={{ width: `${(n / maxBar) * 100}%` }}
                      />
                    </div>
                    <div className="consistency-bar-count">{n}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="consistency-grid">
            {data.cards.map((card) => (
              <div key={card.personId} className="panel consistency-card">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{card.personName}</h3>
                    <p className="muted" style={{ margin: 0 }}>
                      {card.roleTitle ?? "No role"} · {card.managerStatus}
                    </p>
                  </div>
                  <div className="consistency-overall">{card.overall ?? "—"}</div>
                </div>
                <div className="muted" style={{ fontSize: "0.82rem" }}>
                  Evidence links: {card.evidenceLinkCount}
                </div>
                {card.flags.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    {card.flags.map((f) => (
                      <span className="flag" key={f}>
                        {f}
                      </span>
                    ))}
                  </div>
                )}
                <ul className="consistency-comps">
                  {Object.entries(card.competencies).map(([k, v]) => (
                    <li key={k}>
                      <span>{competencyLabel(k)}</span>
                      <strong>{v}</strong>
                    </li>
                  ))}
                </ul>
                <Link className="btn secondary" to={`/cycles/${data.cycleId}/write/${card.personId}`}>
                  Writing desk
                </Link>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
