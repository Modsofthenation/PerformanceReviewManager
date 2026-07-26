import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { schema } from "./schema.js";

export * from "./schema.js";

const DDL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workspace (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  settings_json TEXT NOT NULL DEFAULT '{}',
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  last_activity_hash TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  title TEXT,
  level_key TEXT,
  manager_id TEXT,
  hire_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_frameworks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_framework_versions (
  id TEXT PRIMARY KEY,
  framework_id TEXT NOT NULL,
  version_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  published_at TEXT NOT NULL,
  source_filename TEXT,
  owner_name TEXT,
  effective_from TEXT,
  effective_to TEXT
);

CREATE TABLE IF NOT EXISTS role_definitions (
  id TEXT PRIMARY KEY,
  framework_version_id TEXT NOT NULL,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  track TEXT NOT NULL DEFAULT 'ic',
  level_key TEXT,
  summary TEXT,
  next_role_keys_json TEXT NOT NULL DEFAULT '[]',
  competency_keys_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS role_expectations (
  id TEXT PRIMARY KEY,
  role_definition_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS role_assignments (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  role_definition_id TEXT NOT NULL,
  framework_version_id TEXT NOT NULL,
  target_next_role_definition_id TEXT,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  assigned_by_account_id TEXT
);

CREATE TABLE IF NOT EXISTS cycles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  framework_version_id TEXT
);

CREATE TABLE IF NOT EXISTS cycle_participants (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  manager_person_id TEXT,
  role_definition_id TEXT,
  target_next_role_definition_id TEXT,
  eligibility TEXT NOT NULL DEFAULT 'full',
  phase_status_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  subject_person_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  author_name TEXT,
  author_person_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  import_bundle_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  shared_at TEXT,
  frozen_timeline_json TEXT
);

CREATE TABLE IF NOT EXISTS import_bundles (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  cycle_id TEXT NOT NULL,
  subject_person_id TEXT NOT NULL,
  claimed_author_name TEXT,
  template_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  checksum TEXT NOT NULL,
  source_filename TEXT,
  imported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'on_track',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  source_provider TEXT,
  external_id TEXT,
  external_url TEXT,
  external_payload_json TEXT
);

CREATE TABLE IF NOT EXISTS feedback_items (
  id TEXT PRIMARY KEY,
  to_person_id TEXT NOT NULL,
  from_name TEXT,
  kind TEXT NOT NULL DEFAULT 'praise',
  body TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'em_and_subject',
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  themes_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  title TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT,
  storage_path TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'em_and_subject',
  occurred_at TEXT NOT NULL,
  scan_status TEXT NOT NULL DEFAULT 'allowlist_ok',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence_links (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_key TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS citation_snapshots (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT,
  checksum TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS next_level_assessments (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL,
  role_expectation_id TEXT NOT NULL,
  mark TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS promotion_cases (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  cycle_id TEXT,
  current_role_definition_id TEXT NOT NULL,
  target_role_definition_id TEXT NOT NULL,
  review_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS concern_logs (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  expectation_text TEXT,
  plan_text TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  ai_allowed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meeting_summaries (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  source_document_id TEXT,
  occurred_at TEXT NOT NULL,
  title TEXT NOT NULL,
  summary_text TEXT NOT NULL,
  themes_json TEXT NOT NULL DEFAULT '[]',
  visibility TEXT NOT NULL DEFAULT 'em_only',
  consent_noted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_settings (
  id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  provider TEXT NOT NULL DEFAULT 'anthropic',
  model_digest TEXT,
  model_draft TEXT,
  local_only INTEGER NOT NULL DEFAULT 0,
  ollama_base_url TEXT DEFAULT 'http://127.0.0.1:11434',
  private_notes_egress INTEGER NOT NULL DEFAULT 0,
  meeting_summary_egress INTEGER NOT NULL DEFAULT 0,
  document_extract_egress INTEGER NOT NULL DEFAULT 0,
  api_key_encrypted TEXT
);

CREATE TABLE IF NOT EXISTS integration_settings (
  id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  base_url TEXT,
  workspace_slug TEXT,
  auth_email TEXT,
  auth_username TEXT,
  token_encrypted TEXT,
  extra_json TEXT NOT NULL DEFAULT '{}',
  last_sync_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS person_external_links (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_account_id TEXT NOT NULL,
  external_display_name TEXT,
  external_email TEXT,
  external_username TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_generations (
  id TEXT PRIMARY KEY,
  feature TEXT NOT NULL,
  subject_person_id TEXT,
  cycle_id TEXT,
  model TEXT,
  output_text TEXT,
  citations_json TEXT NOT NULL DEFAULT '[]',
  data_classes_sent_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}',
  prev_hash TEXT,
  hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export function openDatabase(dbPath: string): { sqlite: Database.Database; db: Db } {
  const sqlite = new Database(dbPath);
  sqlite.exec(DDL);
  // Additive migrations for existing workspaces
  try {
    sqlite.exec("ALTER TABLE reviews ADD COLUMN frozen_timeline_json TEXT");
  } catch {
    /* column exists */
  }
  try {
    sqlite.exec("ALTER TABLE feedback_items ADD COLUMN themes_json TEXT NOT NULL DEFAULT '[]'");
  } catch {
    /* column exists */
  }
  for (const col of [
    "ALTER TABLE achievements ADD COLUMN source_provider TEXT",
    "ALTER TABLE achievements ADD COLUMN external_id TEXT",
    "ALTER TABLE achievements ADD COLUMN external_url TEXT",
    "ALTER TABLE achievements ADD COLUMN external_payload_json TEXT",
    "ALTER TABLE role_framework_versions ADD COLUMN owner_name TEXT",
    "ALTER TABLE role_framework_versions ADD COLUMN effective_from TEXT",
    "ALTER TABLE role_framework_versions ADD COLUMN effective_to TEXT",
    "ALTER TABLE cycles ADD COLUMN framework_version_id TEXT",
  ]) {
    try {
      sqlite.exec(col);
    } catch {
      /* column exists */
    }
  }
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS meeting_summaries (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL,
      source_document_id TEXT,
      occurred_at TEXT NOT NULL,
      title TEXT NOT NULL,
      summary_text TEXT NOT NULL,
      themes_json TEXT NOT NULL DEFAULT '[]',
      visibility TEXT NOT NULL DEFAULT 'em_only',
      consent_noted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS reviews_fts USING fts5(
      review_id UNINDEXED,
      person_name,
      cycle_name,
      body,
      tokenize = 'porter'
    );
  `);
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS activity_events_no_update
    BEFORE UPDATE ON activity_events
    BEGIN
      SELECT RAISE(ABORT, 'activity_events is append-only');
    END;
    CREATE TRIGGER IF NOT EXISTS activity_events_no_delete
    BEFORE DELETE ON activity_events
    BEGIN
      SELECT RAISE(ABORT, 'activity_events is append-only');
    END;
  `);
  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}
