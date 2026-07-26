import type { AiFeature, ChatMessage } from "./ai.js";
import { getAiConfig } from "./ai.js";

/** Rough tokenizer: ~4 chars per token for Latin prose. */
export function estimateTokensFromText(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return Math.max(1, Math.ceil(t.length / 4));
}

export function estimateTokensFromMessages(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTokensFromText(m.content) + 4, 0);
}

/** Static USD rates per 1M tokens (approx public list prices; Cursor/Ollama → null). */
const RATES: Record<string, { input: number; output: number } | null> = {
  anthropic: { input: 3, output: 15 },
  openai: { input: 0.15, output: 0.6 },
  cursor: null,
  ollama: null,
};

export function maxOutputTokensForFeature(feature: string): number {
  return feature === "framework_extract" ? 4096 : 1600;
}

export function estimateCostUsd(opts: {
  provider: string;
  inputTokens: number;
  outputTokens: number;
}): number | null {
  const rates = RATES[opts.provider] ?? null;
  if (!rates) return null;
  return Number(
    ((opts.inputTokens / 1_000_000) * rates.input + (opts.outputTokens / 1_000_000) * rates.output).toFixed(6),
  );
}

export function buildAiEstimate(opts: {
  feature: string;
  messages: ChatMessage[];
  dataClassesSent?: string[];
}) {
  const cfg = getAiConfig();
  const provider =
    cfg.localOnly || cfg.provider === "ollama" ? "ollama" : (cfg.provider as string);
  const model =
    opts.feature === "evidence_digest"
      ? cfg.modelDigest
      : cfg.modelDraft || (provider === "cursor" ? "composer-2.5" : "claude-sonnet-4-5");
  const inputTokensApprox = estimateTokensFromMessages(opts.messages);
  const outputTokensMax = maxOutputTokensForFeature(opts.feature);
  const costUsdApprox = estimateCostUsd({
    provider,
    inputTokens: inputTokensApprox,
    outputTokens: outputTokensMax,
  });
  return {
    feature: opts.feature,
    provider,
    model: model || "unknown",
    inputTokensApprox,
    outputTokensMax,
    costUsdApprox,
    localOnly: Boolean(cfg.localOnly || provider === "ollama"),
    dataClassesSent: opts.dataClassesSent ?? [],
    note:
      costUsdApprox == null
        ? "Token estimate only — Cursor/Ollama pricing is not modeled."
        : "Approximate list-price estimate; actual bill depends on provider discounts and true tokenizer.",
  };
}

export type { AiFeature };
