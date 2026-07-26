import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { CalibBundleDTO, ConsistencyDTO, CycleDTO } from "@prm/shared";
import { competencyLabel } from "@prm/shared";
import { api } from "../lib/api";
import { downloadBinaryExport, openHtmlExport } from "../lib/exports";
import { NextStep, PageHeader } from "../components/PageChrome";
import { PageSectionsLayout } from "../components/PageSectionsLayout";

export function ConsistencyPage() {
  const [params, setParams] = useSearchParams();
  const [cycles, setCycles] = useState<CycleDTO[]>([]);
  const [data, setData] = useState<ConsistencyDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calibMsg, setCalibMsg] = useState<string | null>(null);
  const [importJson, setImportJson] = useState("");
  const [exportedBundle, setExportedBundle] = useState<CalibBundleDTO | null>(null);
  const [directorDecisions, setDirectorDecisions] = useState<
    Record<string, { overall: string; note: string }>
  >({});
  const [bundlePass, setBundlePass] = useState("");
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
        <PageSectionsLayout
          sections={[
            { id: "cons-calib", label: "Calibration" },
            { id: "cons-distribution", label: "Distribution" },
            { id: "cons-cards", label: "People" },
          ]}
        >
<div className="panel stack page-section" id="cons-calib">
          <h2>Calibration bundles</h2>
          <p className="muted" style={{ margin: 0 }}>
            Director round-trip: export cards, capture decisions in the form (or paste JSON), then import
            back into draft manager reviews for the same cycle.
          </p>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn secondary"
              onClick={async () => {
                const bundle = await api<CalibBundleDTO>("/api/calib/export", {
                  method: "POST",
                  body: JSON.stringify({ cycleId: data.cycleId }),
                });
                const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `calib-${data.cycleName.replace(/\s+/g, "-").toLowerCase()}.json`;
                a.click();
                URL.revokeObjectURL(url);
                setExportedBundle(bundle);
                const seed: Record<string, { overall: string; note: string }> = {};
                for (const card of bundle.cards) {
                  seed[card.personId] = {
                    overall: card.overall != null ? String(card.overall) : "",
                    note: "",
                  };
                }
                setDirectorDecisions(seed);
                setCalibMsg(`Exported ${bundle.cards.length} card(s) — fill director decisions below`);
              }}
            >
              Export calib JSON
            </button>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                try {
                  await openHtmlExport(`/api/exports/calib-room/${data.cycleId}?format=html`);
                  setCalibMsg("Opened calibration room pack — Print → Save as PDF");
                } catch (e) {
                  setCalibMsg(e instanceof Error ? e.message : "Calib pack failed");
                }
              }}
            >
              Print calib room pack
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={async () => {
                try {
                  await openHtmlExport(`/api/exports/director-briefing/${data.cycleId}?format=html`);
                  setCalibMsg("Opened director briefing — Print → Save as PDF");
                } catch (e) {
                  setCalibMsg(e instanceof Error ? e.message : "Briefing failed");
                }
              }}
            >
              Director briefing
            </button>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "end" }}>
            <div className="field" style={{ margin: 0, minWidth: 180 }}>
              <label>Encrypted handoff passphrase</label>
              <input
                type="password"
                value={bundlePass}
                onChange={(e) => setBundlePass(e.target.value)}
                placeholder="min 8 characters"
              />
            </div>
            <button
              type="button"
              className="btn secondary"
              disabled={bundlePass.trim().length < 8}
              onClick={async () => {
                try {
                  await downloadBinaryExport(
                    "/api/exports/readonly-bundle",
                    {
                      method: "POST",
                      body: JSON.stringify({
                        cycleId: data.cycleId,
                        passphrase: bundlePass,
                        include: ["director_briefing", "calib_room"],
                      }),
                    },
                    `prm-readonly-${data.cycleName.replace(/\s+/g, "-").toLowerCase()}.prm.enc`,
                  );
                  setCalibMsg("Downloaded encrypted read-only bundle");
                } catch (e) {
                  setCalibMsg(e instanceof Error ? e.message : "Bundle failed");
                }
              }}
            >
              Encrypted read-only bundle
            </button>
          </div>

          {exportedBundle && (
            <div className="stack" style={{ marginTop: 8 }}>
              <h3 style={{ margin: 0 }}>Director decisions</h3>
              <p className="muted" style={{ margin: 0 }}>
                Capture the room’s calls here, then apply — no hand-editing JSON required.
              </p>
              {exportedBundle.cards.map((card) => {
                const row = directorDecisions[card.personId] ?? { overall: "", note: "" };
                return (
                  <div key={card.personId} className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "end" }}>
                    <div style={{ minWidth: 140 }}>
                      <strong>{card.personName}</strong>
                      <div className="muted">was {card.overall ?? "—"}</div>
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Overall</label>
                      <select
                        value={row.overall}
                        onChange={(e) =>
                          setDirectorDecisions({
                            ...directorDecisions,
                            [card.personId]: { ...row, overall: e.target.value },
                          })
                        }
                      >
                        <option value="">Keep</option>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={String(n)}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ margin: 0, flex: 1, minWidth: 160 }}>
                      <label>Note</label>
                      <input
                        value={row.note}
                        onChange={(e) =>
                          setDirectorDecisions({
                            ...directorDecisions,
                            [card.personId]: { ...row, note: e.target.value },
                          })
                        }
                        placeholder="Director rationale"
                      />
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  const decisions = exportedBundle.cards
                    .map((card) => {
                      const row = directorDecisions[card.personId];
                      if (!row) return null;
                      const overall = row.overall ? Number(row.overall) : undefined;
                      if (overall == null && !row.note.trim()) return null;
                      return {
                        personId: card.personId,
                        overall,
                        note: row.note.trim() || undefined,
                      };
                    })
                    .filter(Boolean);
                  const payload = { bundle: exportedBundle, decisions };
                  const res = await api<{ applied: number }>("/api/calib/import", {
                    method: "POST",
                    body: JSON.stringify(payload),
                  });
                  setCalibMsg(`Applied ${res.applied} decision(s) from director form`);
                  setImportJson(JSON.stringify(payload, null, 2));
                  await load(data.cycleId);
                }}
              >
                Apply director decisions
              </button>
            </div>
          )}

          <div className="field">
            <label>Import decisions JSON (advanced)</label>
            <textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              rows={5}
              placeholder='{ "bundle": {…}, "decisions": [{ "personId": "…", "overall": 4, "note": "…" }] }'
            />
          </div>
          <button
            type="button"
            className="btn"
            disabled={!importJson.trim()}
            onClick={async () => {
              const parsed = JSON.parse(importJson) as {
                bundle: CalibBundleDTO;
                decisions: Array<{ personId: string; overall?: number; note?: string }>;
              };
              const res = await api<{ applied: number }>("/api/calib/import", {
                method: "POST",
                body: JSON.stringify(parsed),
              });
              setCalibMsg(`Applied ${res.applied} decision(s)`);
              await load(data.cycleId);
            }}
          >
            Import decisions
          </button>
          {calibMsg && <p className="muted">{calibMsg}</p>}
        </div>

          {thin.length > 0 ? (
            <NextStep
              tone="warn"
              label={`${thin.length} draft(s) need evidence outside the middle band`}
              detail="Extreme overall/competency scores without links will block finalize. Gaps listed per card."
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

          <div className="panel page-section" id="cons-distribution">
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

          <div className="consistency-grid page-section" id="cons-cards">
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
                  {card.evidenceGaps > 0 ? ` · ${card.evidenceGaps} gap(s)` : ""}
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
        </PageSectionsLayout>
      )}
    </div>
  );
}
