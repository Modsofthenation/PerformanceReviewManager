import type { BiasFinding } from "@prm/shared";

const ABSOLUTES =
  /\b(always|never|everyone|no one|nobody|invariably|undeniably|completely|totally)\b/gi;

const UNEVEN_PRAISE =
  /\b(brilliant|genius|rockstar|ninja|superstar|amazing|incredible|unparalleled)\b/gi;

/** Lightweight advisory lint — no model required. Ephemeral findings. */
export function runBiasToneLint(text: string): BiasFinding[] {
  const findings: BiasFinding[] = [];
  const body = text.trim();
  if (!body) {
    return [
      {
        id: "empty",
        severity: "info",
        category: "coverage",
        message: "Draft is empty — nothing to lint yet.",
      },
    ];
  }

  const absMatches = [...body.matchAll(ABSOLUTES)];
  if (absMatches.length) {
    const uniq = [...new Set(absMatches.map((m) => m[0].toLowerCase()))];
    findings.push({
      id: "absolutes",
      severity: "warn",
      category: "absolutist_language",
      message: `Absolutist language can overclaim: ${uniq.join(", ")}. Prefer specific frequency/context.`,
      excerpt: absMatches[0]?.[0],
    });
  }

  const praiseMatches = [...body.matchAll(UNEVEN_PRAISE)];
  if (praiseMatches.length >= 2) {
    findings.push({
      id: "praise_density",
      severity: "warn",
      category: "uneven_praise",
      message:
        "Dense superlatives detected. Check whether praise is evidence-backed and consistent with how you write about other directs.",
      excerpt: praiseMatches.map((m) => m[0]).slice(0, 4).join(", "),
    });
  }

  if (/\b(he|she)\b/i.test(body) && !/\bthey\b/i.test(body)) {
    const he = (body.match(/\bhe\b/gi) ?? []).length;
    const she = (body.match(/\bshe\b/gi) ?? []).length;
    if (he + she >= 4 && (he === 0 || she === 0)) {
      findings.push({
        id: "gendered_refs",
        severity: "info",
        category: "gendered_language",
        message:
          "Heavy use of a single gendered pronoun. Prefer the person’s name or they/them if that matches how you write for others.",
      });
    }
  }

  if (/\b(aggressive|abrasive|emotional|shrill|bossy|cultural fit)\b/i.test(body)) {
    findings.push({
      id: "stereotype_risk",
      severity: "warn",
      category: "stereotype_risk",
      message:
        "Language that often maps to stereotype risk appeared. Rewrite as observed behavior + impact with citations.",
    });
  }

  if (!/\[[a-z]+_[A-Za-z0-9_-]+\]/.test(body)) {
    findings.push({
      id: "no_citations",
      severity: "info",
      category: "grounding",
      message: "No evidence ids cited in brackets. Link specific achievements/feedback before sharing.",
    });
  }

  if (!findings.length) {
    findings.push({
      id: "clean",
      severity: "info",
      category: "ok",
      message: "No heuristic tone flags. Still review for fairness across your directs before share.",
    });
  }

  return findings;
}
