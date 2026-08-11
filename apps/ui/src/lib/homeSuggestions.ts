export type HomeSuggestionTone = "brand" | "warn" | "ok";

export type HomeSuggestion = {
  id: string;
  tone: HomeSuggestionTone;
  title: string;
  detail: string;
  href: string;
  cta: string;
  secondaryHref?: string;
  secondaryCta?: string;
};

export type HomeSuggestionPerson = {
  id: string;
  name: string;
  roleTitle: string | null;
};

export type HomeSuggestionCommandItem = {
  person: HomeSuggestionPerson | null;
  hasSelf: boolean;
  managerStatus: string;
  selfStatus?: string;
};

export type BuildHomeSuggestionsInput = {
  cycleId: string | null;
  thinEvidenceCount: number;
  items: HomeSuggestionCommandItem[];
  nudgeCount: number;
  nudgeDays: number | null;
  attentionCount: number;
  /** Cap writing-desk suggestions so the list stays scannable. */
  maxWriteSuggestions?: number;
};

function selfMissing(item: HomeSuggestionCommandItem): boolean {
  if (!item.person) return false;
  const self = item.selfStatus ?? (item.hasSelf ? "returned" : "pending");
  return self !== "returned" && self !== "waived";
}

/**
 * Prioritized “what should I do next?” queue for the command center.
 * Cleared / reordered automatically as pipeline state changes.
 */
export function buildHomeSuggestions(input: BuildHomeSuggestionsInput): HomeSuggestion[] {
  const {
    cycleId,
    thinEvidenceCount,
    items,
    nudgeCount,
    nudgeDays,
    attentionCount,
    maxWriteSuggestions = 3,
  } = input;

  if (!cycleId) return [];

  const withPerson = items.filter((i): i is HomeSuggestionCommandItem & { person: HomeSuggestionPerson } =>
    Boolean(i.person),
  );
  const unassigned = withPerson.filter((i) => !i.person.roleTitle);
  const needSelf = withPerson.filter(selfMissing);
  const readyToWrite = withPerson.filter(
    (i) => i.hasSelf && i.managerStatus !== "finalized" && i.managerStatus !== "shared",
  );
  const done = withPerson.filter((i) => i.managerStatus === "finalized" || i.managerStatus === "shared");
  const out: HomeSuggestion[] = [];

  if (unassigned.length > 0) {
    const first = unassigned[0].person;
    out.push({
      id: "assign-roles",
      tone: "warn",
      title:
        unassigned.length === 1
          ? `Assign a role for ${first.name}`
          : `Assign roles for ${unassigned.length} people`,
      detail: `${first.name}${unassigned.length > 1 ? ` and ${unassigned.length - 1} more` : ""} need a RoleDefinition before fair ratings.`,
      href: "/roles",
      cta: "Assign roles",
    });
  }

  if (needSelf.length > 0) {
    const first = needSelf[0].person;
    out.push({
      id: "self-bundles",
      tone: "brand",
      title:
        needSelf.length === 1
          ? `Get ${first.name}'s self-review in`
          : `Get self-reviews in (${needSelf.length})`,
      detail: `Export JSON, send outside the app, then import — ICs never log in.`,
      href: "/cycles",
      cta: "Export / import bundles",
      secondaryHref: `/cycles/${cycleId}/write/${first.id}`,
      secondaryCta: "Write anyway",
    });
  }

  if (nudgeCount > 0 && nudgeDays != null && nudgeDays <= 14) {
    out.push({
      id: "deadline-nudges",
      tone: "warn",
      title: `Nudge ${nudgeCount} missing self-review${nudgeCount === 1 ? "" : "s"}`,
      detail:
        nudgeDays <= 0
          ? "Window end is today or past — send mailto nudges from Home."
          : `${nudgeDays} day${nudgeDays === 1 ? "" : "s"} until window end.`,
      href: "#home-nudges",
      cta: "Jump to nudges",
    });
  }

  if (thinEvidenceCount > 0) {
    const writeAnyway = readyToWrite[0]?.person;
    out.push({
      id: "backfill",
      tone: "brand",
      title: `Backfill ${thinEvidenceCount} thin dossier${thinEvidenceCount === 1 ? "" : "s"}`,
      detail: "Cold-start dossiers block grounded reviews. Capture achievements or notes first.",
      href: "/backfill",
      cta: "Open backfill",
      ...(writeAnyway
        ? {
            secondaryHref: `/cycles/${cycleId}/write/${writeAnyway.id}`,
            secondaryCta: "Write anyway",
          }
        : {}),
    });
  }

  for (const item of readyToWrite.slice(0, maxWriteSuggestions)) {
    const p = item.person;
    const isDraft = item.managerStatus === "draft";
    out.push({
      id: `write-${p.id}`,
      tone: "brand",
      title: `${isDraft ? "Continue" : "Start"} writing: ${p.name}`,
      detail: isDraft
        ? "Draft in progress — finish competencies and finalize when ready."
        : "Self import is in. Draft the manager review against the assigned role.",
      href: `/cycles/${cycleId}/write/${p.id}`,
      cta: isDraft ? "Continue writing" : "Start writing",
    });
  }

  if (readyToWrite.length > maxWriteSuggestions) {
    const leftover = readyToWrite.length - maxWriteSuggestions;
    out.push({
      id: "write-more",
      tone: "brand",
      title: `${leftover} more review${leftover === 1 ? "" : "s"} ready to write`,
      detail: "See the writing queue below for the full list.",
      href: "#home-queue",
      cta: "Jump to queue",
    });
  }

  if (attentionCount > 0) {
    out.push({
      id: "consistency",
      tone: "warn",
      title: `Review ${attentionCount} consistency flag${attentionCount === 1 ? "" : "s"}`,
      detail: "Director-attention signals before you finalize or export packets.",
      href: `/consistency?cycleId=${cycleId}`,
      cta: "Open consistency",
    });
  }

  if (withPerson.length > 0 && done.length === withPerson.length) {
    out.push({
      id: "cycle-complete",
      tone: "ok",
      title: "Cycle writing complete",
      detail: "All manager reviews are finalized. Export subject packets, or open promotions where readiness is set.",
      href: "/promotions",
      cta: "Review promotions",
    });
  }

  if (out.length === 0) {
    out.push({
      id: "capture-evidence",
      tone: "brand",
      title: "Capture evidence year-round",
      detail: "Between cycles, keep dossiers current — achievements, feedback, and documents make writing faster.",
      href: "/team",
      cta: "Open team",
    });
  }

  return out;
}
