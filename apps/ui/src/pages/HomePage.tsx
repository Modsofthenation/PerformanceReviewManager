import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { CycleDTO } from "@prm/shared";
import { api } from "../lib/api";

type CommandItem = {
  person: { id: string; name: string; roleTitle: string | null } | null;
  hasSelf: boolean;
  peerCount: number;
  managerStatus: string;
  phaseStatus: Record<string, string>;
};

export function HomePage() {
  const [cycles, setCycles] = useState<CycleDTO[]>([]);
  const [items, setItems] = useState<CommandItem[]>([]);
  const [cycleId, setCycleId] = useState<string | null>(null);

  useEffect(() => {
    api<CycleDTO[]>("/api/cycles").then((c) => {
      setCycles(c);
      if (c[0]) setCycleId(c[0].id);
    });
  }, []);

  useEffect(() => {
    if (!cycleId) return;
    api<{ items: CommandItem[] }>(`/api/cycles/${cycleId}/command-center`).then((r) => setItems(r.items));
  }, [cycleId]);

  const active = cycles.find((c) => c.id === cycleId);

  return (
    <div className="stack">
      <div>
        <h1>Command center</h1>
        <p>Bundle pipeline and writing queue for your directs. Author names stay visible to you; subject exports can hide peer names.</p>
      </div>
      <div className="panel row">
        <label className="muted">Cycle</label>
        <select value={cycleId ?? ""} onChange={(e) => setCycleId(e.target.value)}>
          {cycles.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {active && <span className="muted">{active.windowStart} → {active.windowEnd} · {active.status}</span>}
        <Link className="btn secondary" to="/cycles">Manage cycles</Link>
      </div>
      <div className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
              <th>Self</th>
              <th>Peers</th>
              <th>Manager</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.person?.id}>
                <td>{item.person?.name}</td>
                <td className="muted">{item.person?.roleTitle ?? "—"}</td>
                <td>{item.hasSelf ? "Imported" : <span className="flag">missing</span>}</td>
                <td>{item.peerCount}</td>
                <td>{item.managerStatus}</td>
                <td>
                  {cycleId && item.person && (
                    <Link className="btn secondary" to={`/cycles/${cycleId}/write/${item.person.id}`}>
                      Write
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
