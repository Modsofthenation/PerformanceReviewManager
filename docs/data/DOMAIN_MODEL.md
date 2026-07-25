# Domain Model

Canonical entities for the **solo EM workbench**. Names are implementation-ready.

Trust: [TRUST_MODEL.md](../architecture/TRUST_MODEL.md).

---

## ER overview

```
Workspace
  ├── Account (authenticated principals — usually one EM)
  ├── Person / EmploymentRecord (subjects; may have no Account)
  ├── LevelLadder / Level
  ├── RoleFramework / RoleFrameworkVersion / RoleDefinition / RoleExpectation / RoleAssignment
  ├── Competency / CompetencyAnchor
  ├── RatingScale / RatingScaleVersion
  ├── Template / TemplateVersion / FormBlock
  ├── Cycle / CycleParticipant
  ├── Review (self|peer|manager|promotion) + ReviewAmendment
  ├── ImportBundle
  ├── Rating / EvidenceLink / CitationSnapshot
  ├── Goal / GoalCheckIn / FeedbackItem / Achievement
  ├── EvidenceDocument / MeetingSummary
  ├── PromotionCase / NextLevelAssessment
  ├── CalibrationSession / CalibrationDecision
  ├── ConcernLog / ImprovementPlan          # underperformance P1
  ├── AiGeneration / WorkspaceSettings
  ├── ActivityEvent (hash-chained)
  └── ExportRecord
```

---

## Identity split

### Account
Authenticated app user. v1 default: single local admin EM.  
Credentials/PIN optional; secrets in OS keychain.

### Person
Human in the org graph (direct or peer contact). **Does not require an Account.**

### EmploymentRecord
`person_id`, job title (display), `level_id` (display/fallback), `manager_person_id`, department, hire_date, status, effective dates.

**Authoritative level for evaluation:** derived from active `RoleAssignment` → RoleDefinition.level when present; profile level is fallback + mismatch warning.

### Membership / capabilities
Additive capabilities on Account (`workspace_admin`, `manager_of:<person_ids>`), not a single exclusive enum — EMs are also potential future subjects.

---

## Visibility lattice (single enum)

Applied to documents, meeting summaries, feedback, and form blocks:

| Value | Meaning in workbench |
|-------|----------------------|
| `em_only` | Never included in subject export (default for meeting summaries, private notes) |
| `em_and_subject` | Included when packet shared/exported to subject |
| `calib_export` | Allowed in calibration bundle exports |

**Note:** `em_only` means hidden from subject export — **not** hidden from the EM, and **not** legally undiscoverable.

`Review` has no stored visibility field; serializers derive inclusion from block flags + type.

---

## Role framework

### RoleFramework / RoleFrameworkVersion
Immutable publish snapshot; `source_document_id`; owner; effective dates.

### RoleDefinition
`key`, title, track (`ic`|`manager`), `level_id`, summary, `competency_keys[]`, `next_role_keys[]`, impact examples.

### RoleExpectation
**Stable id** (UUID), `role_definition_id`, `kind` (`responsibility`|`expectation`), `text`, `sort_order`, optional `source_span_ref`.

### RoleAssignment
`person_id`, `role_definition_id`, `framework_version_id`, effective dates, `assigned_by_account_id`, optional `target_next_role_definition_id`.  
No overlapping open-ended assignments for one person.

### NextLevelAssessment
`review_id`, `role_expectation_id`, `mark` (`demonstrating`|`emerging`|`not_yet`), evidence links.  
Used when next-level gap is in scope (conditional).

---

## Templates & scales

### RatingScale / RatingScaleVersion
Immutable labels; every `Rating` stores `scale_version_id`. Trends segment across scale changes — never silently normalize.

### TemplateVersion
Includes `role_fit`, `next_level_gap` (conditional), separate `promo_interest` (self) vs `promo_readiness` (manager).  
No upward template in v1 seed.

---

## Cycles & reviews

### CycleParticipant
Snapshots: `manager_person_id`, `role_definition_id`, `target_next_role_definition_id`, eligibility (`full`|`check_in`|`excluded`), per-phase status.

### ImportBundle
`kind` (`self`|`peer`), `cycle_id`, `subject_person_id`, `claimed_author_name`, `template_version_id`, `payload`, `checksum`, `imported_at`, `source_filename`, `imported_by_account_id`.

### Review
`type`: `self`|`peer`|`manager`|`promotion`  
`status`: `draft`|`submitted`|`finalized`|`shared`|`superseded`  
Payload JSON; manager reviews may have contribution trail on handoff.

**Invariant:** At most one *active* manager review per participant; handoff supersedes prior (`superseded`) and retains read of prior text.

### ReviewAmendment
Post-share correction with reason. Local mode: EM self-approves with prominent version note (no HRBP gate).

### Rating
From manager reviews for history by default; carries `review_type`, `scale_version_id`, `role_definition_id`.

### EvidenceLink
`review_id`, `target_type` (`rating`|`section`|`expectation_assessment`), `target_id`, `source_type`, `source_id`, `created_by`.

### CitationSnapshot
At finalize/share: copy of cited evidence metadata (title, checksum, excerpt, occurred_at, source_type/id) embedded or linked immutably so later file deletes don’t silently erase the basis.  
Hard-delete of a document cited by a finalized review is blocked unless legal-hold override + tombstone.

---

## Evidence

### EvidenceDocument
Storage key under app-data; `visibility`; `occurred_at` (prompt on upload when used as evidence); `scan_status`: `allowlist_ok`|`not_scanned`|`rejected`.

### MeetingSummary
Themes/actions/capped quotes; default `em_only`; optional multi-person via `MeetingSummaryMention`. Raw transcript short TTL.

### Goal, FeedbackItem, Achievement
As before; subjects are `person_id`.

---

## Promotion & underperformance

### PromotionCase
Authoritative when present for promo recommendation; else manager `promo_readiness` signal. Gap rows are supporting detail.

### ConcernLog / ImprovementPlan (P1)
Dated EM concerns with evidence links; structured improvement checkpoints; AI disabled by default on these records.

---

## AI & activity

### AiGeneration
Feature, model, citations, output, **data_classes_sent[]**, provider; optional full output retention (lint findings ephemeral by default).

### ActivityEvent
Hash-chained (`prev_hash`, `hash`); actor, action, entity. Tamper-**evident**.

### WorkspaceSettings
Scales, AI policy, retention (default: current + previous cycle), encryption flag, private-tier AI egress classes.

---

## Retention (local defaults)

| Class | Default |
|-------|---------|
| Finalized reviews | Keep **current + previous cycle**; encourage export to company SoR |
| Meeting summaries | 1–3 years configurable; prefer shorter |
| Raw transcripts | ≤ 30 days |
| Unlinked documents | 3 years |
| AiGeneration (drafts) | 90 days–2 years by feature; lint ephemeral |
| ActivityEvent | 3–7 years |

Long (e.g. 7-year) retention is a **hosted** concern, not the laptop default.

---

## Core invariants

1. One active manager review per CycleParticipant.  
2. RoleExpectation ids are stable; assessments never key off array indices.  
3. Subject exports omit `em_only` fields.  
4. TemplateVersion / RoleFrameworkVersion referenced by reviews are immutable.  
5. AI never writes submitted payload without explicit accept.  
6. CitationSnapshots required at finalize for linked evidence.  
7. Encryption enabled before workspace can store real PII (product gate).  
