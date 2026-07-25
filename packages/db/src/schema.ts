import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const workspace = sqliteTable("workspace", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
  settingsJson: text("settings_json").notNull().default("{}"),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  lastActivityHash: text("last_activity_hash"),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  email: text("email"),
  createdAt: text("created_at").notNull(),
});

export const people = sqliteTable("people", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  title: text("title"),
  levelKey: text("level_key"),
  managerId: text("manager_id"),
  hireDate: text("hire_date"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull(),
});

export const roleFrameworks = sqliteTable("role_frameworks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
});

export const roleFrameworkVersions = sqliteTable("role_framework_versions", {
  id: text("id").primaryKey(),
  frameworkId: text("framework_id").notNull(),
  versionLabel: text("version_label").notNull(),
  status: text("status").notNull().default("published"),
  publishedAt: text("published_at").notNull(),
  sourceFilename: text("source_filename"),
});

export const roleDefinitions = sqliteTable("role_definitions", {
  id: text("id").primaryKey(),
  frameworkVersionId: text("framework_version_id").notNull(),
  key: text("key").notNull(),
  title: text("title").notNull(),
  track: text("track").notNull().default("ic"),
  levelKey: text("level_key"),
  summary: text("summary"),
  nextRoleKeysJson: text("next_role_keys_json").notNull().default("[]"),
  competencyKeysJson: text("competency_keys_json").notNull().default("[]"),
});

export const roleExpectations = sqliteTable("role_expectations", {
  id: text("id").primaryKey(),
  roleDefinitionId: text("role_definition_id").notNull(),
  kind: text("kind").notNull(),
  text: text("text").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const roleAssignments = sqliteTable("role_assignments", {
  id: text("id").primaryKey(),
  personId: text("person_id").notNull(),
  roleDefinitionId: text("role_definition_id").notNull(),
  frameworkVersionId: text("framework_version_id").notNull(),
  targetNextRoleDefinitionId: text("target_next_role_definition_id"),
  effectiveFrom: text("effective_from").notNull(),
  effectiveTo: text("effective_to"),
  assignedByAccountId: text("assigned_by_account_id"),
});

export const cycles = sqliteTable("cycles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  windowStart: text("window_start").notNull(),
  windowEnd: text("window_end").notNull(),
  status: text("status").notNull().default("draft"),
  createdAt: text("created_at").notNull(),
});

export const cycleParticipants = sqliteTable("cycle_participants", {
  id: text("id").primaryKey(),
  cycleId: text("cycle_id").notNull(),
  personId: text("person_id").notNull(),
  managerPersonId: text("manager_person_id"),
  roleDefinitionId: text("role_definition_id"),
  targetNextRoleDefinitionId: text("target_next_role_definition_id"),
  eligibility: text("eligibility").notNull().default("full"),
  phaseStatusJson: text("phase_status_json").notNull().default("{}"),
});

export const reviews = sqliteTable("reviews", {
  id: text("id").primaryKey(),
  cycleId: text("cycle_id").notNull(),
  subjectPersonId: text("subject_person_id").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("draft"),
  authorName: text("author_name"),
  authorPersonId: text("author_person_id"),
  payloadJson: text("payload_json").notNull().default("{}"),
  importBundleId: text("import_bundle_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  sharedAt: text("shared_at"),
});

export const importBundles = sqliteTable("import_bundles", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  cycleId: text("cycle_id").notNull(),
  subjectPersonId: text("subject_person_id").notNull(),
  claimedAuthorName: text("claimed_author_name"),
  templateKey: text("template_key").notNull(),
  payloadJson: text("payload_json").notNull(),
  checksum: text("checksum").notNull(),
  sourceFilename: text("source_filename"),
  importedAt: text("imported_at").notNull(),
});

export const goals = sqliteTable("goals", {
  id: text("id").primaryKey(),
  personId: text("person_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("on_track"),
  createdAt: text("created_at").notNull(),
});

export const achievements = sqliteTable("achievements", {
  id: text("id").primaryKey(),
  personId: text("person_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  occurredAt: text("occurred_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const feedbackItems = sqliteTable("feedback_items", {
  id: text("id").primaryKey(),
  toPersonId: text("to_person_id").notNull(),
  fromName: text("from_name"),
  kind: text("kind").notNull().default("praise"),
  body: text("body").notNull(),
  visibility: text("visibility").notNull().default("em_and_subject"),
  occurredAt: text("occurred_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  personId: text("person_id").notNull(),
  title: text("title").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type"),
  storagePath: text("storage_path").notNull(),
  visibility: text("visibility").notNull().default("em_and_subject"),
  occurredAt: text("occurred_at").notNull(),
  scanStatus: text("scan_status").notNull().default("allowlist_ok"),
  createdAt: text("created_at").notNull(),
});

export const evidenceLinks = sqliteTable("evidence_links", {
  id: text("id").primaryKey(),
  reviewId: text("review_id").notNull(),
  targetType: text("target_type").notNull(),
  targetKey: text("target_key").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  createdAt: text("created_at").notNull(),
});

export const citationSnapshots = sqliteTable("citation_snapshots", {
  id: text("id").primaryKey(),
  reviewId: text("review_id").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  title: text("title").notNull(),
  excerpt: text("excerpt"),
  checksum: text("checksum"),
  createdAt: text("created_at").notNull(),
});

export const nextLevelAssessments = sqliteTable("next_level_assessments", {
  id: text("id").primaryKey(),
  reviewId: text("review_id").notNull(),
  roleExpectationId: text("role_expectation_id").notNull(),
  mark: text("mark").notNull(),
});

export const promotionCases = sqliteTable("promotion_cases", {
  id: text("id").primaryKey(),
  personId: text("person_id").notNull(),
  cycleId: text("cycle_id"),
  currentRoleDefinitionId: text("current_role_definition_id").notNull(),
  targetRoleDefinitionId: text("target_role_definition_id").notNull(),
  reviewId: text("review_id"),
  status: text("status").notNull().default("draft"),
  createdAt: text("created_at").notNull(),
});

export const aiSettings = sqliteTable("ai_settings", {
  id: text("id").primaryKey(),
  enabled: integer("enabled").notNull().default(0),
  provider: text("provider").notNull().default("anthropic"),
  modelDigest: text("model_digest"),
  modelDraft: text("model_draft"),
  localOnly: integer("local_only").notNull().default(0),
  ollamaBaseUrl: text("ollama_base_url").default("http://127.0.0.1:11434"),
  privateNotesEgress: integer("private_notes_egress").notNull().default(0),
  meetingSummaryEgress: integer("meeting_summary_egress").notNull().default(0),
  documentExtractEgress: integer("document_extract_egress").notNull().default(0),
  /** Encrypted or keychain-ref; for local v1 we store AES-encrypted key with workspace secret */
  apiKeyEncrypted: text("api_key_encrypted"),
});

export const aiGenerations = sqliteTable("ai_generations", {
  id: text("id").primaryKey(),
  feature: text("feature").notNull(),
  subjectPersonId: text("subject_person_id"),
  cycleId: text("cycle_id"),
  model: text("model"),
  outputText: text("output_text"),
  citationsJson: text("citations_json").notNull().default("[]"),
  dataClassesSentJson: text("data_classes_sent_json").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
});

export const activityEvents = sqliteTable("activity_events", {
  id: text("id").primaryKey(),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  detailJson: text("detail_json").notNull().default("{}"),
  prevHash: text("prev_hash"),
  hash: text("hash").notNull(),
  createdAt: text("created_at").notNull(),
});

export const schema = {
  workspace,
  accounts,
  people,
  roleFrameworks,
  roleFrameworkVersions,
  roleDefinitions,
  roleExpectations,
  roleAssignments,
  cycles,
  cycleParticipants,
  reviews,
  importBundles,
  goals,
  achievements,
  feedbackItems,
  documents,
  evidenceLinks,
  citationSnapshots,
  nextLevelAssessments,
  promotionCases,
  aiSettings,
  aiGenerations,
  activityEvents,
};
