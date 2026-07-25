export type Visibility = "em_only" | "em_and_subject" | "calib_export";

export type ReviewType = "self" | "peer" | "manager" | "promotion";
export type ReviewStatus = "draft" | "submitted" | "finalized" | "shared" | "superseded";

export type GapMark = "demonstrating" | "emerging" | "not_yet";

export type PromoReadiness = "ready" | "not_yet" | "too_early" | "not_applicable";
export type PromoInterest = "interested" | "not_interested" | "unsure";

export type ExpectationKind = "responsibility" | "expectation";

export type Track = "ic" | "manager" | "other";

export type EvidenceSourceType = "achievement" | "goal" | "feedback" | "document" | "role_expectation";

export interface CompetencyDef {
  key: string;
  name: string;
  description: string;
  appliesToTracks?: Track[];
}

/** Default eng competency catalog (from default_eng_template_pack). */
export const COMPETENCY_CATALOG: CompetencyDef[] = [
  {
    key: "execution",
    name: "Execution & delivery",
    description: "Ships reliable outcomes on meaningful timelines; manages scope and quality.",
  },
  {
    key: "technical_depth",
    name: "Technical depth",
    description: "Applies sound engineering judgment; improves system quality and correctness.",
  },
  {
    key: "ownership",
    name: "Ownership",
    description: "Drives problems to resolution; anticipates risk; follows through without heavy oversight.",
  },
  {
    key: "collaboration",
    name: "Collaboration",
    description: "Communicates clearly; elevates teammates; works effectively across boundaries.",
  },
  {
    key: "impact",
    name: "Impact",
    description: "Connects work to user/business outcomes; multiplies value beyond individual tasks.",
  },
  {
    key: "growth_leadership",
    name: "Growth & leadership",
    description: "Develops self and others; improves team practices; shows role-appropriate leadership.",
  },
  {
    key: "people_leadership",
    name: "People leadership",
    description: "Coaches, develops, and delivers results through a team; fair and clear.",
    appliesToTracks: ["manager"],
  },
  {
    key: "org_influence",
    name: "Organizational influence",
    description: "Aligns stakeholders; shapes priorities beyond the immediate team.",
    appliesToTracks: ["manager"],
  },
];

export function competencyLabel(key: string) {
  return COMPETENCY_CATALOG.find((c) => c.key === key)?.name ?? key;
}

/** Middle band on the 1–5 scale — scores outside this require evidence links. */
export const MIDDLE_BAND = 3;

export interface EvidenceLinkDTO {
  id: string;
  targetType: string;
  targetKey: string;
  sourceType: EvidenceSourceType | string;
  sourceId: string;
}

export interface CitationSnapshotDTO {
  id: string;
  sourceType: string;
  sourceId: string;
  title: string;
  excerpt: string | null;
  checksum: string | null;
}

export interface PersonDTO {
  id: string;
  name: string;
  email: string | null;
  title: string | null;
  levelKey: string | null;
  managerId: string | null;
  hireDate: string | null;
  roleDefinitionId: string | null;
  roleTitle: string | null;
  targetNextRoleDefinitionId: string | null;
  targetNextRoleTitle: string | null;
}

export interface RoleExpectationDTO {
  id: string;
  kind: ExpectationKind;
  text: string;
  sortOrder: number;
}

export interface RoleDefinitionDTO {
  id: string;
  key: string;
  title: string;
  track: Track;
  levelKey: string | null;
  summary: string | null;
  nextRoleKeys: string[];
  competencyKeys: string[];
  expectations: RoleExpectationDTO[];
}

export interface RoleDraftDTO {
  key: string;
  title: string;
  track: Track;
  levelKey: string | null;
  summary: string | null;
  nextRoleKeys: string[];
  expectations: Array<{ kind: ExpectationKind; text: string }>;
}

export interface RoleFrameworkInfo {
  frameworkId: string;
  frameworkName: string;
  versionId: string;
  versionLabel: string;
  sourceFilename: string | null;
  roleCount: number;
}

export interface CycleDTO {
  id: string;
  name: string;
  windowStart: string;
  windowEnd: string;
  status: string;
  participantCount: number;
}

export interface ReviewDTO {
  id: string;
  type: ReviewType;
  status: ReviewStatus;
  subjectPersonId: string;
  authorName: string | null;
  payload: Record<string, unknown>;
  updatedAt: string;
}

export interface PacketDTO {
  person: PersonDTO;
  currentRole: RoleDefinitionDTO | null;
  nextRole: RoleDefinitionDTO | null;
  selfReview: ReviewDTO | null;
  peerReviews: ReviewDTO[];
  managerReview: ReviewDTO | null;
  goals: Array<{ id: string; title: string; status: string; createdAt?: string }>;
  achievements: Array<{
    id: string;
    title: string;
    occurredAt: string;
    description?: string | null;
    outOfWindow?: boolean;
  }>;
  feedback: Array<{
    id: string;
    fromName: string | null;
    kind: string;
    body: string;
    occurredAt: string;
    outOfWindow?: boolean;
  }>;
  documents: Array<{
    id: string;
    title: string;
    visibility: Visibility;
    occurredAt?: string;
    outOfWindow?: boolean;
  }>;
  /** Evidence dated outside the cycle window — still citable, visually separated. */
  outOfWindow: {
    achievements: Array<{ id: string; title: string; occurredAt: string }>;
    feedback: Array<{ id: string; fromName: string | null; kind: string; body: string; occurredAt: string }>;
    documents: Array<{ id: string; title: string; occurredAt?: string }>;
  };
  evidenceLinks: EvidenceLinkDTO[];
  citationSnapshots: CitationSnapshotDTO[];
  /** Most recent prior finalized/shared manager review (other cycle), if any. */
  priorCycle: {
    cycleId: string;
    cycleName: string;
    windowEnd: string;
    overall: number | null;
    summary: string;
    strengths: string;
    growthAreas: string;
    competencies: Record<string, number>;
  } | null;
  /** Chronological dossier + review milestones for the subject. */
  timeline: Array<{
    at: string;
    kind: string;
    title: string;
    detail?: string | null;
    sourceId?: string;
  }>;
  flags: string[];
  /** Soft phase status from cycle participant (self/peer/manager). */
  phaseStatus?: Record<string, string>;
  writingSecondsTotal?: number;
}

export interface ConcernLogDTO {
  id: string;
  personId: string;
  occurredAt: string;
  title: string;
  body: string;
  expectationText: string | null;
  planText: string | null;
  status: string;
  aiAllowed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DeadlineNudge {
  personId: string;
  personName: string;
  email: string | null;
  cycleId: string;
  cycleName: string;
  windowEnd: string;
  daysUntilDue: number;
  missingSelf: boolean;
  selfStatus: string;
  mailtoHref: string;
}

export type IntegrationProvider = "jira" | "bitbucket";

export interface IntegrationSettingsDTO {
  id: IntegrationProvider;
  enabled: boolean;
  baseUrl: string | null;
  workspaceSlug: string | null;
  authEmail: string | null;
  authUsername: string | null;
  hasToken: boolean;
  extra: Record<string, unknown>;
  lastSyncAt: string | null;
  updatedAt: string;
}

export interface PersonExternalLinkDTO {
  id: string;
  personId: string;
  provider: IntegrationProvider;
  externalAccountId: string;
  externalDisplayName: string | null;
  externalEmail: string | null;
  externalUsername: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationRemoteUser {
  accountId: string;
  displayName: string;
  email?: string | null;
  username?: string | null;
}

export interface IntegrationSyncResult {
  personId: string;
  jira: { imported: number; updated: number; skipped: boolean; error: string | null };
  bitbucket: { imported: number; updated: number; skipped: boolean; error: string | null };
}

export interface DecisionLogEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
  prevHash?: string | null;
  hash?: string;
}

export interface AuditVerifyResult {
  ok: boolean;
  count: number;
  tipHash: string | null;
  expectedTip: string | null;
  brokenAt: string | null;
  error: string | null;
}

export interface PeopleImportResult {
  created: Array<{ id: string; name: string }>;
  skipped: Array<{ name: string; reason: string }>;
  errors: Array<{ row: number; message: string }>;
}

export interface WorkspaceStatus {
  initialized: boolean;
  unlocked: boolean;
  name: string | null;
  personCount: number;
  hasAiKey: boolean;
  aiProvider: string | null;
  encryptedAtRest?: boolean;
  /** Directs with thin dossiers — useful for backfill CTA after unlock. */
  thinEvidenceCount?: number;
}

export interface ConsistencyCardDTO {
  personId: string;
  personName: string;
  title: string | null;
  roleTitle: string | null;
  overall: number | null;
  competencies: Record<string, number>;
  evidenceLinkCount: number;
  /** Non-middle competency/overall scores that lack evidence links. */
  evidenceGaps: number;
  managerStatus: string;
  flags: string[];
}

export interface ConsistencyDTO {
  cycleId: string;
  cycleName: string;
  distribution: Record<string, number>;
  cards: ConsistencyCardDTO[];
}

export interface BiasFinding {
  id: string;
  severity: "info" | "warn";
  category: string;
  message: string;
  excerpt?: string;
  /** Optional writing-desk action: cite evidence, soften absolute language, or strip a bad cite. */
  suggestedFix?: {
    action: "cite" | "soften" | "strip_cite";
    label: string;
    newText?: string;
    citeId?: string;
  };
}

export interface CycleStatsDTO {
  cycleId: string;
  cycleName: string;
  participantCount: number;
  thinDossierCount: number;
  writing: {
    peopleWithTime: number;
    totalSeconds: number;
    avgSeconds: number;
    under45MinCount: number;
    under45MinPct: number;
  };
  evidence: {
    peopleWithDraft: number;
    avgLinkedSources: number;
    /** Share of non-middle competency/overall scores that have ≥1 evidence link (0–100). */
    coveragePct: number;
  };
  people: Array<{
    personId: string;
    personName: string;
    writingSeconds: number;
    under45Min: boolean;
    evidenceCount: number;
    thin: boolean;
    linkedSources: number;
    managerStatus: string;
  }>;
}

/** Cycle-scoped team analytics for the Team performance page. */
export interface TeamPerformancePersonDTO {
  personId: string;
  personName: string;
  levelKey: string | null;
  overall: number | null;
  /** Prior-cycle overall when a previous cycle exists; null if unrated then. */
  priorOverall: number | null;
  competencies: Record<string, number>;
  promoReadiness: string | null;
  writingSeconds: number;
  evidenceCount: number;
  linkedSources: number;
  thin: boolean;
  managerStatus: string;
}

export interface TeamPerformanceDTO {
  cycleId: string;
  cycleName: string;
  priorCycle: { cycleId: string; cycleName: string } | null;
  participantCount: number;
  ratedCount: number;
  avgOverall: number | null;
  distribution: Record<string, number>;
  competencies: Array<{
    key: string;
    label: string;
    avg: number | null;
    ratedCount: number;
  }>;
  promoReadiness: Record<string, number>;
  writingBuckets: Array<{ id: string; label: string; count: number }>;
  evidence: {
    coveragePct: number;
    avgLinkedSources: number;
    thinDossierCount: number;
  };
  levels: Array<{ levelKey: string; count: number }>;
  themes: Array<{ theme: string; count: number }>;
  openConcerns: number;
  people: TeamPerformancePersonDTO[];
}

export interface TimelineEntryDTO {
  at: string;
  kind: string;
  title: string;
  detail?: string | null;
  sourceId?: string;
}

/** Mid-cycle coaching pulse for an arbitrary date window (not a formal review cycle). */
export interface SprintPulsePersonDTO {
  personId: string;
  personName: string;
  levelKey: string | null;
  achievements: number;
  jira: number;
  bitbucket: number;
  feedback: number;
  documents: number;
  openConcerns: number;
  themes: string[];
  /** Evidence dated in-window vs older on the dossier. */
  inWindowEvidence: number;
  olderEvidence: number;
  /** Manager draft links whose sources sit outside the window (stale cites). */
  linkedInWindow: number;
  linkedStale: number;
  staleOnlyCites: boolean;
}

export interface SprintPulseDTO {
  from: string;
  to: string;
  preset: string;
  summary: {
    people: number;
    achievements: number;
    jira: number;
    bitbucket: number;
    feedback: number;
    documents: number;
    openConcerns: number;
    staleCitePeople: number;
  };
  themes: Array<{ theme: string; count: number }>;
  people: SprintPulsePersonDTO[];
}

export interface PersonTimelineDTO {
  personId: string;
  personName: string;
  entries: TimelineEntryDTO[];
}

export interface RatingTrendPointDTO {
  cycleId: string;
  cycleName: string;
  windowEnd: string;
  value: number | null;
}

export interface RatingTrendsDTO {
  cycles: Array<{ cycleId: string; cycleName: string; windowEnd: string }>;
  /** Team averages over cycles (overall + competencies that appear). */
  team: Array<{
    key: string;
    label: string;
    points: RatingTrendPointDTO[];
  }>;
  people: Array<{
    personId: string;
    personName: string;
    overall: RatingTrendPointDTO[];
    competencies: Record<string, RatingTrendPointDTO[]>;
  }>;
}

export interface CycleCompareDTO {
  current: {
    cycleId: string;
    cycleName: string;
    distribution: Record<string, number>;
    avgOverall: number | null;
    ratedCount: number;
    thinCount: number;
    themes: Array<{ theme: string; count: number }>;
  };
  prior: {
    cycleId: string;
    cycleName: string;
    distribution: Record<string, number>;
    avgOverall: number | null;
    ratedCount: number;
    thinCount: number;
    themes: Array<{ theme: string; count: number }>;
  } | null;
  movers: Array<{
    personId: string;
    personName: string;
    from: number | null;
    to: number | null;
    delta: number | null;
  }>;
  repeatThin: Array<{ personId: string; personName: string }>;
  themeDrift: {
    appeared: string[];
    disappeared: string[];
    grew: Array<{ theme: string; from: number; to: number }>;
    shrank: Array<{ theme: string; from: number; to: number }>;
  };
}
