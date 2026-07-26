import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ReviewSearchHit, StagnationHint } from "@prm/shared";
import { api } from "../lib/api";
import { NextStep, PageHeader } from "../components/PageChrome";

export function SearchPage() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ReviewSearchHit[]>([]);
  const [hints, setHints] = useState<StagnationHint[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<{ hints: StagnationHint[] }>("/api/stagnation")
      .then((r) => setHints(r.hints))
      .catch(() => setHints([]));
  }, []);

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await api<{ hits: ReviewSearchHit[] }>(
        `/api/search/reviews?q=${encodeURIComponent(q.trim())}`,
      );
      setHits(res.hits);
      if (!res.hits.length) setMsg("No finalized reviews matched. Try Reindex if you just finalized.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <PageHeader
        title="Search & stagnation"
        job="Find finalized packets by text, and spot flat ratings or thin evidence across cycles."
      />

      <form className="panel row" onSubmit={(e) => void runSearch(e)} style={{ gap: 8, alignItems: "flex-end" }}>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label htmlFor="review-search">Search finalized reviews</label>
          <input
            id="review-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="latency, ownership, checkout…"
          />
        </div>
        <button className="btn" type="submit" disabled={busy || !q.trim()}>
          Search
        </button>
        <button
          className="btn secondary"
          type="button"
          onClick={async () => {
            const res = await api<{ indexed: number }>("/api/search/reviews/reindex", {
              method: "POST",
              body: "{}",
            });
            setMsg(`Reindexed ${res.indexed} finalized review(s)`);
          }}
        >
          Reindex
        </button>
      </form>

      {msg && <p className="muted">{msg}</p>}

      {hits.length > 0 && (
        <div className="panel stack">
          <h2>Results</h2>
          <ul>
            {hits.map((h) => (
              <li key={h.reviewId} style={{ marginBottom: 10 }}>
                <Link to={`/cycles/${h.cycleId}/write/${h.personId}`}>
                  <strong>{h.personName}</strong> · {h.cycleName}
                </Link>{" "}
                <span className="muted">
                  overall {h.overall ?? "—"} · {h.status}
                </span>
                <p className="muted" style={{ margin: "2px 0" }}>
                  {h.snippet}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel stack">
        <h2>Stagnation hints</h2>
        {hints.length === 0 ? (
          <NextStep
            tone="ok"
            label="No stagnation flags"
            detail="Needs ≥3 finalized cycles with flat overall or repeatedly thin evidence."
          />
        ) : (
          <ul>
            {hints.map((h) => (
              <li key={`${h.personId}-${h.kind}`}>
                <Link to={`/team/${h.personId}`}>
                  <strong>{h.personName}</strong>
                </Link>{" "}
                <span className="flag">{h.kind}</span>
                <p className="muted" style={{ margin: "2px 0" }}>
                  {h.detail}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
