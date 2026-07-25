# Domain Model

Canonical entities for Performance Review Manager. Names are implementation-ready.

---

## ER overview

```
Organization
  ├── User / Membership (roles)
  ├── LevelLadder / Level
  ├── Competency / CompetencyAnchor
  ├── Template / TemplateVersion / FormBlock
  ├── Cycle / CycleParticipant / Phase
  ├── Review (Self | Peer | Manager | Upward)
  ├── Rating / EvidenceLink
  ├── Goal / GoalCheckIn
  ├── FeedbackItem
  ├── Achievement
  ├── EvidenceDocument
  ├── MeetingSummary
  ├── CalibrationSession / CalibrationDecision
  ├── AiGeneration
  └── AuditEvent
```

---

## Core entities

### Organization
Tenant root. Settings: rating scale defaults, anonymity defaults, AI enabled, retention years, evidence integration toggles.

### User & Membership
- `User`: identity (email, name, external SSO id)
- `Membership`: org-scoped role (`ic`, `manager`, `director`, `hrbp`, `admin`), status
- `EmploymentProfile`: job title, `level_id`, `manager_user_id`, department, location, hire_date, employment_status

Manager edges are versioned with `effective_from` / `effective_to` so historical reviews remain attributable.

### LevelLadder & Level
Example ladder: `Engineering IC` with levels IC1–IC6; `Engineering Manager` M1–M3.  
Levels drive template assignment and calibration cohort defaults.

### Competency
Reusable skill/behavior dimension.

| Field | Purpose |
|-------|---------|
| `key` | Stable id (`ownership`) |
| `name`, `description` | Display |
| `applies_to_levels` | Optional filter |
| `category` | technical / delivery / collaboration / leadership |

### CompetencyAnchor
Behavioral description of what rating `N` means at `level_id` for `competency_id`. Shown in writing desk and used by AI for rubric suggestions.

### Template & TemplateVersion
- `Template`: named form family (`ic_self_v`, `eng_manager_review`)
- `TemplateVersion`: immutable JSON schema of blocks + linked competency set + scale
- Cycles store `template_version_id` (pin)

### FormBlock (inside TemplateVersion)
Discriminated union:

- `text` — prompt, min/max length, required
- `competency_scores` — which competencies, require evidence below/above threshold
- `overall_rating`
- `goals_review`
- `promo_signal` — Ready / Not yet / Too early / Not applicable
- `acknowledgment`
- `private_text` — manager-only

---

## Cycle graph

### Cycle
| Field | Notes |
|-------|-------|
| `performance_window_start/end` | Evidence inclusion dates |
| `phases[]` | name, opens_at, due_at |
| `population_query` | org unit / levels / explicit user ids |
| `anonymity_policy` | peer→IC, upward aggregation rules |
| `calibration_required` | bool |
| `ai_policy` | allow draft, allow score suggest, etc. |
| `status` | see Features doc |

### CycleParticipant
Materialized person-in-cycle row: assigned templates, manager_at_cycle_time, status per phase, eligibility (`full` | `check_in` | `excluded`).

### Review
One submitted (or draft) form instance.

| Field | Notes |
|-------|-------|
| `type` | `self` \| `peer` \| `manager` \| `upward` |
| `cycle_id`, `subject_user_id` | Who is being reviewed |
| `author_user_id` | Null/system for aggregated upward |
| `template_version_id` | |
| `status` | `draft` \| `submitted` \| `unlocked` \| `withdrawn` |
| `payload` | Structured answers (JSON conforming to template) |
| `shared_with_subject_at` | For manager reviews |
| `visibility` | computed from type + policy |

Peer reviews store `is_anonymous_to_subject` boolean enforced at read API.

### Rating
Normalized score rows extracted from payload for analytics:

`review_id`, `competency_id` (nullable for overall), `score`, `scale_id`, `rationale_text`

### EvidenceLink
Join between a rating (or text section) and an evidence source:

`rating_id` | `section_key` → `source_type` + `source_id`  
`source_type`: `goal` | `feedback` | `achievement` | `integration_signal` | `url` | `prior_review` | `document` | `meeting_summary`

---

## Continuous evidence

### Goal
`owner_user_id`, `cycle_id?`, `title`, `description`, `success_criteria`, `status`, `weight`, `created_in_review_id?`

### GoalCheckIn
Periodic status: `on_track` | `at_risk` | `missed` | `done`, note, at timestamp.

### FeedbackItem
Anytime peer/manager feedback: `from_user_id`, `to_user_id`, `kind` (`praise`|`constructive`|`note`), body, visibility, competency tags, `occurred_at`.

### Achievement
Structured win: title, description, links[], competency tags, `occurred_at`, created_by, visibility.

### EvidenceDocument
Uploaded file treated as citeable evidence.

| Field | Notes |
|-------|-------|
| `subject_user_id` | Whose dossier this sits on |
| `uploaded_by_user_id` | Actor |
| `title`, `mime_type`, `byte_size`, `checksum` | Metadata |
| `storage_key` | Object-store pointer (never public ACL) |
| `extracted_text_ref` | Optional pointer to extracted/OCR text for AI (separate object; may be redacted) |
| `visibility` | `private_manager` \| `subject_and_manager` \| `calibration_visible` |
| `occurred_at` | When the evidence applies (user-set; defaults to upload time) |
| `competency_tags[]` | Optional |
| `scan_status` | `pending` \| `clean` \| `rejected` |

Only `clean` documents are downloadable or eligible for AI context.

### MeetingSummary
Opt-in Google Meet / Drive (or manual) transcript derivative. **Default visibility matches private manager notes.**

| Field | Notes |
|-------|-------|
| `subject_user_id` | Primary report discussed (required) |
| `imported_by_user_id` | Usually the manager |
| `source` | `google_drive` \| `google_meet` \| `manual_upload` |
| `external_ref` | Drive file id / opaque ref (optional) |
| `title`, `occurred_at` | Meeting metadata |
| `attendee_user_ids[]` | Resolved where possible |
| `themes[]` | Short bullets produced at import time |
| `action_items[]` | Optional |
| `quotes[]` | Optional capped excerpts (not full transcript) |
| `visibility` | Default `private_manager`; elevating requires explicit action + audit |
| `raw_transcript_ref` | Nullable; short-TTL or disabled per org `transcript_raw_retention_days` |
| `summary_model` | If AI-produced at import, record model id |

**Invariant:** Subject-facing serializers never include `MeetingSummary` or `private_manager` documents unless visibility was raised and shared-packet rules allow it.

### IntegrationSignal
Normalized, opt-in summaries from GitHub/Linear/etc.:

```json
{
  "provider": "github",
  "kind": "weekly_summary",
  "period": ["2026-01-06", "2026-01-12"],
  "stats": {"prs_merged": 12, "reviews": 4},
  "highlights": ["Owned checkout-refactor migration"],
  "raw_ref": "opaque-cursor-not-shown-to-ai-by-default"
}
```

Store aggregates suitable for humans/AI; do not ship firehose of every commit into the model context by default.

### OneOnOneTheme (optional P1)
`manager_id`, `report_id`, `tags[]`, `occurred_at`, optional private note.  
Complements `MeetingSummary` when the EM does not want transcript import — tags only.

---

## Calibration

### CalibrationSession
Cohort definition (`level_ids`, `manager_subtree`), cycle_id, status, participants snapshot.

### CalibrationDecision
`subject_user_id`, `field` (`overall`|`competency:ownership`), `from_score`, `to_score`, `reason`, `decided_by`, `decided_at`.

Immutable append-only log.

---

## AI & audit

### AiGeneration
| Field | Purpose |
|-------|---------|
| `user_id` | Requester |
| `subject_user_id` | Packet person |
| `cycle_id` | Scope |
| `feature` | `evidence_digest` \| `draft_section` \| `bias_lint` \| … |
| `input_ref` | Hash/pointer to context package used |
| `output_text` | Stored for audit |
| `citations` | Evidence ids referenced |
| `model` | Provider/model/version |
| `created_at` | |

### AuditEvent
Append-only: actor, action, entity, before/after hashes, ip/session metadata, timestamp.  
Covers reads of sensitive packets, exports, unlocks, permission changes, AI calls.

---

## History queries (derived)

Materialized or query-time views:

- `PersonCompetencyHistory(user, competency, cycle) → score`
- `PersonOverallHistory(user, cycle) → score, promo_signal`
- `TeamDistribution(cycle, cohort) → histogram`
- `StagnationAlert(user)` → rules engine output

Never mutate historical `Review` rows after `shared` except via explicit versioned amendment (`ReviewAmendment`) that HRBP must approve.

### ReviewAmendment
Post-share correction: reason, fields changed, approved_by, visible_to_subject flag.

---

## Data retention & deletion

| Class | Default retention |
|-------|-------------------|
| Finalized reviews + ratings | 7 years (configurable) |
| Drafts abandoned | 1 year after cycle close |
| Evidence documents (files + extracts) | Match linked review retention; unlinked docs 3 years |
| Meeting summaries | Match private-notes policy; default 3 years |
| Raw transcript blobs | Org setting; default **30 days** then purge (summaries remain) |
| AI generations | 2 years (or match review) |
| Audit log | 7 years |
| Integration raw refs | 90 days (summaries kept with review evidence links) |
| Continuous feedback not linked | 3 years |

GDPR/CCPA: deletion requests cascade with legal-hold exceptions; anonymize peer authors when policy requires.

---

## Integrity rules (invariants)

1. A `CycleParticipant` has at most one `manager` review.
2. Peer reviews cannot be read by subject if anonymity policy says so (enforced server-side).
3. Private form blocks never appear in subject-facing DTOs.
4. TemplateVersion referenced by any Review is immutable.
5. CalibrationDecision cannot be deleted; only superseded by later decision.
6. Rating without evidence is allowed but flagged when score is outside middle band (config).
7. AI outputs are never written directly into submitted Review payload without explicit user accept action.
