/** Lightweight SVG/CSS charts shared by Team performance, Sprint pulse, and dossiers. */

export function maxCount(values: number[]) {
  return Math.max(1, ...values);
}

export function BarChart({
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
            <div className="consistency-bar-fill" style={{ width: `${(row.count / max) * 100}%` }} />
          </div>
          <div className="consistency-bar-count">{row.count}</div>
        </div>
      ))}
    </div>
  );
}

export function Histogram({
  buckets,
  ariaLabel = "Distribution",
}: {
  buckets: Array<{ key: string; label: string; count: number }>;
  ariaLabel?: string;
}) {
  const max = maxCount(buckets.map((b) => b.count));
  const height = 140;
  const gap = 10;
  const barW = 36;
  const width = buckets.length * (barW + gap) + gap;
  return (
    <svg className="tp-histogram" viewBox={`0 0 ${width} ${height + 28}`} role="img" aria-label={ariaLabel}>
      {buckets.map((b, i) => {
        const h = b.count === 0 ? 0 : Math.max(4, (b.count / max) * height);
        const x = gap + i * (barW + gap);
        const y = height - h;
        return (
          <g key={b.key}>
            <rect x={x} y={y} width={barW} height={h} rx={6} className="tp-hist-bar" />
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

export function TrendSparkline({
  points,
  label,
  min = 1,
  max = 5,
}: {
  points: Array<{ value: number | null; cycleName: string }>;
  label: string;
  min?: number;
  max?: number;
}) {
  const w = 160;
  const h = 36;
  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  if (vals.length < 1) return <span className="muted">—</span>;
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

export function DeliverySparkline({ values, label }: { values: number[]; label: string }) {
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

/** Larger cycle-series chart for dossier / team delivery history. */
export function SeriesChart({
  points,
  label,
  valueSuffix = "",
}: {
  points: Array<{ label: string; value: number | null }>;
  label: string;
  valueSuffix?: string;
}) {
  const w = 420;
  const h = 160;
  const pad = { left: 36, right: 16, top: 20, bottom: 36 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const nums = points.map((p) => p.value).filter((v): v is number => v != null);
  if (nums.length === 0) {
    return <p className="muted">No series data yet.</p>;
  }
  const max = Math.max(1, ...nums);
  const n = points.length;

  return (
    <svg className="tp-series" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      <line
        x1={pad.left}
        y1={pad.top + plotH}
        x2={pad.left + plotW}
        y2={pad.top + plotH}
        className="tp-axis"
      />
      <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + plotH} className="tp-axis" />
      {points.map((p, i) => {
        if (p.value == null) return null;
        const x = pad.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
        const barW = Math.min(48, plotW / Math.max(n, 1) - 8);
        const barH = Math.max(2, (p.value / max) * plotH);
        const y = pad.top + plotH - barH;
        return (
          <g key={`${p.label}-${i}`}>
            <rect x={x - barW / 2} y={y} width={barW} height={barH} rx={4} className="tp-hist-bar" />
            <text x={x} y={y - 6} textAnchor="middle" className="tp-hist-count">
              {p.value}
              {valueSuffix}
            </text>
            <text x={x} y={h - 10} textAnchor="middle" className="tp-hist-label">
              {p.label.length > 12 ? `${p.label.slice(0, 11)}…` : p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function MixBarChart({
  rows,
}: {
  rows: Array<{ key: string; label: string; count: number }>;
}) {
  const max = maxCount(rows.map((r) => r.count));
  return <BarChart rows={rows} max={max} />;
}
