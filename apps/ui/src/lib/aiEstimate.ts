import type { AiEstimateDTO } from "@prm/shared";
import { api } from "./api";

export function formatEstimate(est: AiEstimateDTO): string {
  const cost =
    est.costUsdApprox == null
      ? "cost n/a"
      : est.costUsdApprox < 0.01
        ? `~$${est.costUsdApprox.toFixed(4)}`
        : `~$${est.costUsdApprox.toFixed(3)}`;
  return `~${est.inputTokensApprox} in / ≤${est.outputTokensMax} out · ${cost} · ${est.provider}:${est.model}`;
}

/** Fetch estimate then confirm before running the real AI call. */
export async function estimateThenConfirm(
  feature: string,
  body: Record<string, unknown>,
  label: string,
): Promise<boolean> {
  try {
    const est = await api<AiEstimateDTO>("/api/ai/estimate", {
      method: "POST",
      body: JSON.stringify({ feature, ...body }),
    });
    const line = formatEstimate(est);
    const classes = est.dataClassesSent.length ? `\nData classes: ${est.dataClassesSent.join(", ")}` : "";
    return window.confirm(`${label}\n\n${line}${classes}\n\n${est.note}\n\nRun now?`);
  } catch (e) {
    return window.confirm(
      `${label}\n\n(Estimate unavailable: ${e instanceof Error ? e.message : "error"})\n\nRun anyway?`,
    );
  }
}
