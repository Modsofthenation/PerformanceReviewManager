export type Visibility = "em_only" | "em_and_subject" | "calib_export";

export type ReviewType = "self" | "peer" | "manager" | "promotion";
export type ReviewStatus = "draft" | "submitted" | "finalized" | "shared" | "superseded";

export type GapMark = "demonstrating" | "emerging" | "not_yet";

export type PromoReadiness = "ready" | "not_yet" | "too_early" | "not_applicable";
export type PromoInterest = "interested" | "not_interested" | "unsure";

export type ExpectationKind = "responsibility" | "expectation";

export type Track = "ic" | "manager" | "other";

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
  achievements: Array<{ id: string; title: string; occurredAt: string }>;
  documents: Array<{ id: string; title: string; visibility: Visibility }>;
  flags: string[];
}

export interface WorkspaceStatus {
  initialized: boolean;
  unlocked: boolean;
  name: string | null;
  personCount: number;
  hasAiKey: boolean;
  aiProvider: string | null;
  encryptedAtRest?: boolean;
}
