import type { BiasFinding } from "@prm/shared";
import { extractCitationIds } from "./citations.js";

const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z("[])|(?:\n+)/;

/** Claims that look substantive but lack any [id] citation nearby. */
export function runFaithfulnessLint(text: string, allowlist: string[] = []): BiasFinding[] {
  const findings: BiasFinding[] = [];
  const body = text.trim();
  if (!body) return findings;

  const allowed = new Set(allowlist);
  const cited = extractCitationIds(body);
  for (const id of cited) {
    if (allowlist.length && !allowed.has(id)) {
      findings.push({
        id: `unknown_cite_${id}`,
        severity: "warn",
        category: "invention",
        message: `Citation [${id}] is not in the evidence allowlist — remove or replace with a real evidence id.`,
        excerpt: `[${id}]`,
      });
    }
  }

  const sentences = body
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter((s) => s.length > 40);

  let ungrounded = 0;
  const samples: string[] = [];
  for (const sentence of sentences) {
    if (/^(summary|strengths|growth|overall|note|private)\b/i.test(sentence)) continue;
    if (!/\[[a-z]+_[A-Za-z0-9_-]+\]/.test(sentence)) {
      // Skip questions / instructions
      if (/\?$/.test(sentence) || /^(please|consider|remember)\b/i.test(sentence)) continue;
      // Skip name-ish lists (mostly Title Case tokens, almost no verbs/stopwords)
      const words = sentence.split(/\s+/).filter(Boolean);
      const titleish = words.filter((w) => /^[A-Z][a-z]+/.test(w.replace(/[.,]/g, ""))).length;
      if (words.length >= 3 && titleish / words.length >= 0.7) continue;
      ungrounded += 1;
      if (samples.length < 3) samples.push(sentence.slice(0, 120));
    }
  }

  if (ungrounded >= 2) {
    findings.push({
      id: "ungrounded_claims",
      severity: "warn",
      category: "invention",
      message: `${ungrounded} long sentence(s) lack evidence citations. Prefer claims tied to [ach_…]/[fb_…]/[goal_…] ids.`,
      excerpt: samples[0],
    });
  }

  // Numeric claims without citations are high invention risk (% is non-word — no trailing \b)
  const metricClaims = [
    ...body.matchAll(/(\d+%|\$\d[\d,]*(?:\.\d+)?|\b\d{2,}\s*(?:users|PRs|tickets|customers)\b)/gi),
  ];
  for (const m of metricClaims.slice(0, 5)) {
    const idx = m.index ?? 0;
    const window = body.slice(Math.max(0, idx - 80), idx + 80);
    if (!/\[[a-z]+_[A-Za-z0-9_-]+\]/.test(window)) {
      findings.push({
        id: `metric_${idx}`,
        severity: "warn",
        category: "invention",
        message: `Metric “${m[0]}” appears without a nearby evidence citation — verify or cite the source.`,
        excerpt: m[0],
      });
    }
  }

  return findings;
}

export function mergeLintFindings(...groups: BiasFinding[][]): BiasFinding[] {
  const seen = new Set<string>();
  const out: BiasFinding[] = [];
  for (const group of groups) {
    for (const f of group) {
      const key = `${f.category}:${f.id}:${f.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(f);
    }
  }
  return out;
}
