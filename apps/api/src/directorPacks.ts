import { competencyLabel } from "@prm/shared";
import type { DirectorBriefingDTO, DirectorBriefingPersonDTO } from "@prm/shared";

function esc(s: unknown) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const PRINT_CSS = `
  :root { color-scheme: light; }
  body { font-family: "Segoe UI", system-ui, sans-serif; max-width: 860px; margin: 2rem auto; padding: 0 1.25rem 3rem; color: #0f172a; line-height: 1.55; }
  h1 { font-size: 1.75rem; margin: 0 0 0.25rem; letter-spacing: -0.02em; }
  h2 { font-size: 1.15rem; margin: 1.75rem 0 0.5rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.35rem; }
  h3 { font-size: 1rem; margin: 1.1rem 0 0.35rem; }
  .meta { color: #64748b; font-size: 0.9rem; margin-bottom: 1.25rem; }
  .notice { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.85rem 1rem; font-size: 0.88rem; color: #334155; margin-bottom: 1rem; }
  .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem 1.1rem; margin: 1rem 0; page-break-inside: avoid; }
  .flags span { display: inline-block; background: #fef3c7; color: #92400e; border-radius: 6px; padding: 0.1rem 0.45rem; font-size: 0.75rem; margin: 0 0.25rem 0.25rem 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 0.35rem; }
  th, td { text-align: left; padding: 0.4rem 0.3rem; border-bottom: 1px solid #e2e8f0; font-size: 0.92rem; }
  .muted { color: #94a3b8; font-size: 0.82rem; }
  .metrics { display: flex; flex-wrap: wrap; gap: 0.75rem 1.25rem; margin: 0.5rem 0; }
  .metrics div strong { display: block; font-size: 1.15rem; }
  ul.bullets { margin: 0.35rem 0 0; padding-left: 1.15rem; }
  .decision-row { display: grid; grid-template-columns: 1.4fr 0.6fr 1.4fr; gap: 0.5rem; border-bottom: 1px solid #e2e8f0; padding: 0.45rem 0; }
  .decision-row .line { border-bottom: 1px solid #cbd5e1; min-height: 1.4rem; }
  @media print {
    body { margin: 0; max-width: none; }
    .no-print { display: none !important; }
    .card { break-inside: avoid; }
  }
`;

/** Build short share-safe bullets from narrative + cite ids (no private notes). */
export function buildCitedBullets(args: {
  summary?: string;
  strengths?: string;
  growth?: string;
  citeIds: string[];
  max?: number;
}): Array<{ text: string; citeId: string | null }> {
  const max = args.max ?? 8;
  const citeIds = args.citeIds;
  let citeIdx = 0;
  const nextCite = () => {
    const id = citeIds[citeIdx] ?? null;
    if (citeIds.length) citeIdx = (citeIdx + 1) % citeIds.length;
    return id;
  };
  const chunks: string[] = [];
  for (const block of [args.summary, args.strengths, args.growth]) {
    if (!block?.trim()) continue;
    for (const part of block.split(/(?<=[.!?])\s+/)) {
      const t = part.trim();
      if (t.length < 24) continue;
      chunks.push(t.replace(/\s+/g, " ").slice(0, 220));
      if (chunks.length >= max) break;
    }
    if (chunks.length >= max) break;
  }
  return chunks.slice(0, max).map((text) => {
    const embedded = text.match(/\[(ach|fb|goal|doc)_[A-Za-z0-9_-]+\]/);
    return {
      text: text.replace(/\s*\[(ach|fb|goal|doc)_[A-Za-z0-9_-]+\]\s*/g, " ").trim(),
      citeId: embedded ? embedded[0].slice(1, -1) : nextCite(),
    };
  });
}

export function renderDirectorBriefingHtml(pack: DirectorBriefingDTO): string {
  const distRows = ["5", "4", "3", "2", "1", "unset"]
    .map((k) => {
      const n = pack.distribution[k] ?? 0;
      return `<tr><td>${esc(k === "unset" ? "—" : k)}</td><td>${esc(n)}</td></tr>`;
    })
    .join("");

  const people = pack.people
    .map((p) => {
      const comps = Object.entries(p.competencies)
        .map(([k, v]) => `<tr><td>${esc(competencyLabel(k))}</td><td>${esc(v)}</td></tr>`)
        .join("");
      const bullets = p.citedBullets
        .map(
          (b) =>
            `<li>${esc(b.text)}${b.citeId ? ` <span class="muted">[${esc(b.citeId)}]</span>` : ""}</li>`,
        )
        .join("");
      const flags = p.flags.map((f) => `<span>${esc(f)}</span>`).join("");
      const delta = p.delta == null ? "—" : p.delta > 0 ? `+${p.delta}` : String(p.delta);
      return `<article class="card">
  <h3>${esc(p.personName)}</h3>
  <div class="meta">${esc(p.roleTitle ?? p.title ?? "—")} · Overall ${esc(p.overall ?? "—")}/5
    ${p.priorOverall != null ? ` · Δ vs prior ${esc(delta)} (was ${esc(p.priorOverall)})` : ""}
    ${p.promoReadiness ? ` · Promo: ${esc(p.promoReadiness)}` : ""}
    · ${esc(p.managerStatus)}
  </div>
  ${flags ? `<div class="flags">${flags}</div>` : ""}
  <div class="metrics">
    <div><strong>${esc(p.delivery.issuesDone)}</strong><span class="muted">Issues done</span></div>
    <div><strong>${esc(p.delivery.prsMerged)}</strong><span class="muted">PRs merged</span></div>
    <div><strong>${esc(p.delivery.storyPointsDone ?? "—")}</strong><span class="muted">Story points</span></div>
    <div><strong>${esc(p.openConcernCount)}</strong><span class="muted">Open concerns</span></div>
  </div>
  ${comps ? `<table><thead><tr><th>Competency</th><th>Score</th></tr></thead><tbody>${comps}</tbody></table>` : ""}
  ${bullets ? `<h3 style="font-size:0.95rem;margin-top:0.85rem">Evidence highlights</h3><ul class="bullets">${bullets}</ul>` : `<p class="muted">No shareable narrative bullets yet.</p>`}
</article>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Director briefing — ${esc(pack.cycleName)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
  <p class="no-print notice">Tip: Print → Save as PDF. ${esc(pack.notice)}</p>
  <h1>Director briefing</h1>
  <div class="meta">${esc(pack.cycleName)} · ${esc(pack.windowStart)} → ${esc(pack.windowEnd)} · ${esc(pack.people.length)} people · Exported ${esc(pack.exportedAt)}</div>
  <div class="notice">${esc(pack.notice)}</div>
  <section>
    <h2>Rating distribution</h2>
    <table><thead><tr><th>Overall</th><th>Count</th></tr></thead><tbody>${distRows}</tbody></table>
  </section>
  <section>
    <h2>People</h2>
    ${people || `<p class="muted">No participants.</p>`}
  </section>
</body>
</html>`;
}

export function renderCalibRoomHtml(opts: {
  cycleName: string;
  exportedAt: string;
  distribution: Record<string, number>;
  cards: Array<{
    personName: string;
    roleTitle: string | null;
    overall: number | null;
    competencies: Record<string, number>;
    flags: string[];
    summaryExcerpt: string;
    evidenceLinkCount: number;
    evidenceGaps: number;
    managerStatus: string;
  }>;
}): string {
  const dist = ["5", "4", "3", "2", "1", "unset"]
    .map((k) => `<tr><td>${esc(k === "unset" ? "—" : k)}</td><td>${esc(opts.distribution[k] ?? 0)}</td></tr>`)
    .join("");
  const outliers = opts.cards.filter((c) => c.flags.length > 0 || c.evidenceGaps > 0 || c.overall == null);
  const cards = opts.cards
    .map((c) => {
      const comps = Object.entries(c.competencies)
        .map(([k, v]) => `${competencyLabel(k)} ${v}`)
        .join(" · ");
      const flags = c.flags.map((f) => `<span>${esc(f)}</span>`).join("");
      return `<article class="card">
  <h3>${esc(c.personName)}</h3>
  <div class="meta">${esc(c.roleTitle ?? "—")} · Overall ${esc(c.overall ?? "—")} · ${esc(c.managerStatus)}
    · ${esc(c.evidenceLinkCount)} cites${c.evidenceGaps ? ` · ${esc(c.evidenceGaps)} gaps` : ""}</div>
  ${flags ? `<div class="flags">${flags}</div>` : ""}
  ${comps ? `<p class="muted">${esc(comps)}</p>` : ""}
  ${c.summaryExcerpt ? `<p>${esc(c.summaryExcerpt)}</p>` : ""}
</article>`;
    })
    .join("");

  const decisionRows = opts.cards
    .map(
      (c) => `<div class="decision-row">
  <div><strong>${esc(c.personName)}</strong><div class="muted">was ${esc(c.overall ?? "—")}</div></div>
  <div><span class="muted">New overall</span><div class="line"></div></div>
  <div><span class="muted">Note</span><div class="line"></div></div>
</div>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Calibration room — ${esc(opts.cycleName)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
  <p class="no-print notice">Print → Save as PDF for the director deck. Capture decisions below or apply them later in Consistency.</p>
  <h1>Calibration room pack</h1>
  <div class="meta">${esc(opts.cycleName)} · ${esc(opts.cards.length)} cards · ${esc(outliers.length)} flagged · ${esc(opts.exportedAt)}</div>
  <section>
    <h2>Distribution</h2>
    <table><thead><tr><th>Overall</th><th>Count</th></tr></thead><tbody>${dist}</tbody></table>
  </section>
  <section>
    <h2>Outliers &amp; thin evidence</h2>
    ${
      outliers.length
        ? outliers
            .map(
              (c) =>
                `<p><strong>${esc(c.personName)}</strong> — ${esc(c.flags.join(", ") || "evidence gaps")} (overall ${esc(c.overall ?? "—")})</p>`,
            )
            .join("")
        : `<p class="muted">No flagged outliers.</p>`
    }
  </section>
  <section>
    <h2>Candidate cards</h2>
    ${cards}
  </section>
  <section>
    <h2>Director decision sheet</h2>
    <p class="muted">Fill in the room, then enter decisions in Consistency → Apply director decisions (or import JSON).</p>
    ${decisionRows}
  </section>
</body>
</html>`;
}

export function enhancePromotionCommitteeHtml(args: {
  baseHtml: string;
  citedEvidence: Array<{ title: string; citeId: string }>;
  deliveryThemes: Array<{ theme: string; count: number }>;
}): string {
  const cites = args.citedEvidence
    .map((c) => `<li><strong>${esc(c.title)}</strong> <span class="muted">[${esc(c.citeId)}]</span></li>`)
    .join("");
  const themes = args.deliveryThemes
    .map((t) => `<li>${esc(t.theme)} <span class="muted">(${esc(t.count)})</span></li>`)
    .join("");
  const extra = `${
    cites ? `<section><h2>Allowlisted cites</h2><ul>${cites}</ul></section>` : ""
  }${themes ? `<section><h2>Delivery themes (cycle window)</h2><ul>${themes}</ul></section>` : ""}`;
  if (!extra) return args.baseHtml;
  return args.baseHtml.replace("</body>", `${extra}</body>`);
}

export function emptyDistribution(): Record<string, number> {
  return { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, unset: 0 };
}

export function bumpDistribution(dist: Record<string, number>, overall: number | null) {
  if (overall != null && overall >= 1 && overall <= 5) dist[String(Math.round(overall))] += 1;
  else dist.unset += 1;
}

export type { DirectorBriefingPersonDTO };
