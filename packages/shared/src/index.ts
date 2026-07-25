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
  goals: Array<{ id: string; title: string; status: string }>;
  achievements: Array<{ id: string; title: string; occurredAt: string; description?: string | null }>;
  feedback: Array<{ id: string; fromName: string | null; kind: string; body: string; occurredAt: string }>;
  documents: Array<{ id: string; title: string; visibility: Visibility }>;
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
}

export interface DecisionLogEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
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
}
