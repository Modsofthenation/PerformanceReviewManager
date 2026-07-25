function esc(s: unknown) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function section(title: string, body: string) {
  if (!body.trim()) return "";
  return `<section><h2>${esc(title)}</h2><div class="body">${esc(body).replace(/\n/g, "<br/>")}</div></section>`;
}

export function renderSubjectPacketHtml(opts: {
  subjectName: string;
  roleTitle?: string | null;
  cycleName?: string | null;
  summary?: string;
  strengths?: string;
  growthAreas?: string;
  devPlan?: string;
  roleFit?: string;
  overall?: number | null;
  competencies?: Record<string, number>;
  competencyLabels?: Record<string, string>;
  peerThemes?: Array<{ strengths?: string; growth?: string }>;
  citationSnapshots?: Array<{ title: string; excerpt?: string | null; sourceId: string }>;
  exportedAt: string;
}) {
  const comps = Object.entries(opts.competencies ?? {})
    .map(([k, v]) => {
      const label = opts.competencyLabels?.[k] ?? k;
      return `<tr><td>${esc(label)}</td><td>${esc(v)}</td></tr>`;
    })
    .join("");

  const peers = (opts.peerThemes ?? [])
    .map(
      (p, i) =>
        `<div class="peer"><h3>Peer theme ${i + 1}</h3><p><strong>Strengths:</strong> ${esc(p.strengths ?? "")}</p><p><strong>Growth:</strong> ${esc(p.growth ?? "")}</p></div>`,
    )
    .join("");

  const cites = (opts.citationSnapshots ?? [])
    .map(
      (s) =>
        `<li><strong>${esc(s.title)}</strong>${s.excerpt ? ` — ${esc(s.excerpt)}` : ""} <span class="muted">[${esc(s.sourceId)}]</span></li>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Review packet — ${esc(opts.subjectName)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: "Segoe UI", system-ui, sans-serif; max-width: 760px; margin: 2rem auto; padding: 0 1.25rem 3rem; color: #0f172a; line-height: 1.55; }
  h1 { font-size: 1.75rem; margin: 0 0 0.25rem; letter-spacing: -0.02em; }
  h2 { font-size: 1.1rem; margin: 1.75rem 0 0.5rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.35rem; }
  h3 { font-size: 0.95rem; margin: 0.75rem 0 0.35rem; }
  .meta { color: #64748b; font-size: 0.9rem; margin-bottom: 1.5rem; }
  .notice { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.85rem 1rem; font-size: 0.88rem; color: #334155; }
  .body { white-space: pre-wrap; }
  table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
  th, td { text-align: left; padding: 0.45rem 0.35rem; border-bottom: 1px solid #e2e8f0; }
  .muted { color: #94a3b8; font-size: 0.82rem; }
  .peer { margin-bottom: 0.75rem; }
  @media print {
    body { margin: 0; max-width: none; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
  <p class="no-print notice">Tip: use your browser’s Print → Save as PDF for a PDF copy.</p>
  <h1>${esc(opts.subjectName)}</h1>
  <div class="meta">
    ${esc(opts.roleTitle ?? "Role unassigned")}
    ${opts.cycleName ? ` · ${esc(opts.cycleName)}` : ""}
    ${opts.overall != null ? ` · Overall: ${esc(opts.overall)} / 5` : ""}
    · Exported ${esc(opts.exportedAt)}
  </div>
  <div class="notice">This packet is what is shared with the subject. Author names for peer input are hidden — not cryptographically anonymous. Private manager notes are omitted.</div>
  ${section("Summary", opts.summary ?? "")}
  ${section("Strengths", opts.strengths ?? "")}
  ${section("Growth areas", opts.growthAreas ?? "")}
  ${section("Development plan", opts.devPlan ?? "")}
  ${section("Role fit", opts.roleFit ?? "")}
  ${
    comps
      ? `<section><h2>Competencies</h2><table><thead><tr><th>Competency</th><th>Score</th></tr></thead><tbody>${comps}</tbody></table></section>`
      : ""
  }
  ${peers ? `<section><h2>Peer themes</h2>${peers}</section>` : ""}
  ${cites ? `<section><h2>Cited evidence (frozen at finalize)</h2><ul>${cites}</ul></section>` : ""}
</body>
</html>`;
}

export function renderPromotionPacketHtml(opts: {
  personName: string;
  currentRole?: string | null;
  targetRole?: string | null;
  caseSummary?: string;
  scopeExamples?: string;
  remainingGaps?: string;
  recommendation?: string;
  assessments?: Array<{ text: string; mark: string }>;
  exportedAt: string;
}) {
  const marks = (opts.assessments ?? [])
    .map((a) => `<tr><td>${esc(a.text)}</td><td>${esc(a.mark)}</td></tr>`)
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Promotion case — ${esc(opts.personName)}</title>
<style>
  body { font-family: "Segoe UI", system-ui, sans-serif; max-width: 760px; margin: 2rem auto; padding: 0 1.25rem 3rem; color: #0f172a; line-height: 1.55; }
  h1 { font-size: 1.75rem; margin: 0 0 0.25rem; }
  h2 { font-size: 1.1rem; margin: 1.75rem 0 0.5rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.35rem; }
  .meta { color: #64748b; margin-bottom: 1.25rem; }
  .body { white-space: pre-wrap; }
  table { width: 100%; border-collapse: collapse; }
  td, th { text-align: left; padding: 0.45rem 0.35rem; border-bottom: 1px solid #e2e8f0; }
  .notice { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.85rem 1rem; font-size: 0.88rem; }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>
  <p class="no-print notice">Tip: Print → Save as PDF for a PDF copy.</p>
  <h1>Promotion case: ${esc(opts.personName)}</h1>
  <div class="meta">${esc(opts.currentRole ?? "—")} → ${esc(opts.targetRole ?? "—")} · Recommendation: <strong>${esc(opts.recommendation ?? "")}</strong> · ${esc(opts.exportedAt)}</div>
  ${section("Case summary", opts.caseSummary ?? "")}
  ${section("Demonstrated scope", opts.scopeExamples ?? "")}
  ${section("Remaining gaps", opts.remainingGaps ?? "")}
  ${marks ? `<section><h2>Next-role expectation marks</h2><table><thead><tr><th>Expectation</th><th>Mark</th></tr></thead><tbody>${marks}</tbody></table></section>` : ""}
</body>
</html>`;
}
