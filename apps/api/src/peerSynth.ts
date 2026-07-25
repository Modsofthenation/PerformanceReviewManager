/** Local peer theme rollup when cloud AI is off / fails. */
export function localPeerSynthesize(
  peers: Array<{ authorName: string | null; payload: Record<string, unknown> }>,
) {
  if (!peers.length) return "No peer imports yet.";
  const strengths: string[] = [];
  const growth: string[] = [];
  const context: string[] = [];
  for (const p of peers) {
    const s = String(p.payload.strengths ?? "").trim();
    const g = String(p.payload.growth ?? "").trim();
    const c = String(p.payload.context ?? "").trim();
    if (s) strengths.push(`• ${s} _(peer: ${p.authorName ?? "hidden in subject export"})_`);
    if (g) growth.push(`• ${g}`);
    if (c) context.push(`• ${c}`);
  }
  const parts = [`Peer synthesize (${peers.length} import${peers.length === 1 ? "" : "s"}) — local rollup:`];
  if (strengths.length) parts.push(`\n**Strength themes**\n${strengths.join("\n")}`);
  if (growth.length) parts.push(`\n**Growth themes**\n${growth.join("\n")}`);
  if (context.length) parts.push(`\n**Context**\n${context.join("\n")}`);
  parts.push("\n_Deduplicate and ground claims against dossier evidence before drafting._");
  return parts.join("\n");
}
