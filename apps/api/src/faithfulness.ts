import type { BiasFinding } from "@prm/shared";
import { extractCitationIds } from "./citations.js";

const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z("[])|(?:\n+)/;

const ABSOLUTE_WORDS =
  /\b(always|never|completely|entirely|dramatically|everyone|no one|all regions|every squad)\b/gi;

function softenText(excerpt: string): string {
  return excerpt
    .replace(/\balways\b/gi, "often")
    .replace(/\bnever\b/gi, "rarely")
    .replace(/\bcompletely\b/gi, "substantially")
    .replace(/\bentirely\b/gi, "largely")
    .replace(/\bdramatically\b/gi, "notably")
    .replace(/\beveryone\b/gi, "many teammates")
    .replace(/\bno one\b/gi, "few people")
    .replace(/\ball regions\b/gi, "several regions")
    .replace(/\bevery squad\b/gi, "multiple squads")
    .replace(/(\d+%)/g, "about $1 (verify)")
    .replace(/(\$\d[\d,]*(?:\.\d+)?)/g, "about $1 (verify)");
}

function pickCiteId(allowlist: string[]): string | undefined {
  return allowlist.find((id) => /^(ach|fb|goal|doc|rexp)_/.test(id));
}

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
        suggestedFix: {
          action: "strip_cite",
          label: "Remove unknown cite",
          newText: "",
        },
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
      if (/\?$/.test(sentence) || /^(please|consider|remember)\b/i.test(sentence)) continue;
      const words = sentence.split(/\s+/).filter(Boolean);
      const titleish = words.filter((w) => /^[A-Z][a-z]+/.test(w.replace(/[.,]/g, ""))).length;
      if (words.length >= 3 && titleish / words.length >= 0.7) continue;
      ungrounded += 1;
      if (samples.length < 3) samples.push(sentence.slice(0, 120));
    }
  }

  if (ungrounded >= 2) {
    const sample = samples[0];
    const citeId = pickCiteId(allowlist);
    const softened = sample ? softenText(sample) : undefined;
    findings.push({
      id: "ungrounded_claims",
      severity: "warn",
      category: "invention",
      message: `${ungrounded} long sentence(s) lack evidence citations. Prefer claims tied to [ach_…]/[fb_…]/[goal_…] ids.`,
      excerpt: sample,
      suggestedFix: citeId
        ? {
            action: "cite",
            label: `Cite [${citeId}]`,
            citeId,
            newText: sample ? `${sample.replace(/\.*$/, "")} [${citeId}].` : undefined,
          }
        : softened && sample
          ? {
              action: "soften",
              label: "Soften absolute language",
              newText: softened,
            }
          : undefined,
    });
  }

  const metricClaims = [
    ...body.matchAll(/(\d+%|\$\d[\d,]*(?:\.\d+)?|\b\d{2,}\s*(?:users|PRs|tickets|customers)\b)/gi),
  ];
  for (const m of metricClaims.slice(0, 5)) {
    const idx = m.index ?? 0;
    const window = body.slice(Math.max(0, idx - 80), idx + 80);
    if (!/\[[a-z]+_[A-Za-z0-9_-]+\]/.test(window)) {
      const citeId = pickCiteId(allowlist);
      const excerpt = m[0];
      findings.push({
        id: `metric_${idx}`,
        severity: "warn",
        category: "invention",
        message: `Metric “${excerpt}” appears without a nearby evidence citation — verify or cite the source.`,
        excerpt,
        suggestedFix: citeId
          ? {
              action: "cite",
              label: `Cite [${citeId}] near metric`,
              citeId,
              newText: `${excerpt} [${citeId}]`,
            }
          : {
              action: "soften",
              label: "Soften / qualify metric",
              newText: softenText(excerpt),
            },
      });
    }
  }

  // Absolute phrasing without cites
  for (const m of body.matchAll(ABSOLUTE_WORDS)) {
    const idx = m.index ?? 0;
    const window = body.slice(Math.max(0, idx - 40), idx + (m[0]?.length ?? 0) + 40);
    if (/\[[a-z]+_[A-Za-z0-9_-]+\]/.test(window)) continue;
    const word = m[0];
    findings.push({
      id: `absolute_${idx}`,
      severity: "info",
      category: "invention",
      message: `Absolute wording “${word}” is easy to overclaim without evidence.`,
      excerpt: word,
      suggestedFix: {
        action: "soften",
        label: "Soften wording",
        newText: softenText(word),
      },
    });
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

/** Apply a suggested faithfulness fix to draft text. Returns null if excerpt not found. */
export function applyFaithfulnessFix(
  text: string,
  finding: Pick<BiasFinding, "excerpt" | "suggestedFix">,
): string | null {
  const fix = finding.suggestedFix;
  const excerpt = finding.excerpt;
  if (!fix || !excerpt) return null;
  if (fix.action === "strip_cite") {
    if (!text.includes(excerpt)) return null;
    return text.replace(excerpt, "").replace(/  +/g, " ").replace(/ \./g, ".");
  }
  if (!fix.newText) return null;
  if (!text.includes(excerpt)) return null;
  return text.replace(excerpt, fix.newText);
}
