# Feature Catalog

Features are grouped by product surface. Priority tags: **P0** (must ship for useful v1), **P1** (makes it excellent), **P2** (differentiation / scale).

---

## 1. Org & people foundation

| Feature | Priority | Notes |
|---------|----------|-------|
| People profiles (role, level, manager, start date, location) | P0 | Sync from HRIS/IdP when available; manual edit fallback |
| Reporting hierarchy | P0 | Directs + skip-level views |
| Teams / eng ladders (IC1–IC6, M1–M3) | P0 | Levels drive template selection and calibration cohorts |
| Access roles (IC, EM, Director, HRBP, Admin) | P0 | Permission matrix in architecture doc |
| Manager change / reorg handling | P1 | Mid-cycle ownership rules; history preserved under person |

---

## 2. Templates & frameworks

Templates are the **contract** for what a review collects and how it is scored.

### 2.1 Template builder

| Feature | Priority | Notes |
|---------|----------|-------|
| Template types: Self, Peer, Manager, Upward, Calibration notes | P0 | Same competency set can power multiple form types |
| Sections: free text, rubric scores, multi-select, goals review, acknowledgment | P0 | Composable blocks |
| Competency library (company + eng-specific) | P0 | e.g. Execution, Ownership, Collaboration, Technical depth, Impact, Leadership |
| Rating scales (configurable) | P0 | Default: 1–5 labeled (Does not meet → Far exceeds); support 4-point forced-choice |
| Behavioral anchors per level | P1 | “What ‘Exceeds’ looks like at IC3 vs IC5” |
| Role/level targeting | P0 | Template A for IC1–IC3; Template B for IC4+; Manager template for people managers |
| Versioning & immutability | P0 | Publishing creates immutable version; cycles pin a version |
| Preview as IC / Peer / Manager | P0 | WYSIWYG of exact form respondents see |
| Clone & fork templates | P1 | Org starts from opinionated eng defaults |
| Legal / acknowledgment blocks | P1 | HR-required language, signature timestamps |

### 2.2 Default opinionated engineering pack (shipped)

Ship these so EMs aren’t staring at an empty builder:

**IC Self-review**
- Top outcomes this cycle (3–5)
- Competency self-scores with evidence
- Collaboration & influence examples
- Growth areas & support needed
- Goals proposed for next cycle
- Promotion interest (optional, private to manager/HR)

**Peer feedback (short)**
- Context of collaboration
- Strengths observed (required)
- One growth suggestion (required)
- Optional competency marks (narrow set)
- Confidence / working-relationship length

**Manager review**
- Overall rating + summary
- Competency ratings with evidence
- Strengths / growth areas (balanced)
- Goal assessment (met / partial / missed + why)
- Next-cycle focus & development plan
- Promo readiness signal (separate from performance rating)
- Private manager notes (never shared with IC)

**Upward feedback (optional cycle component)**
- Manager supportiveness, clarity, growth investment, fairness
- Always aggregated before manager sees it (n≥3 rule)

---

## 3. Continuous evidence layer (“the dossier”)

This is the differentiator vs annual-form tools.

| Feature | Priority | Notes |
|---------|----------|-------|
| Goals / OKRs with status & check-ins | P0 | Linked into review automatically |
| Feedback inbox (praise, constructive, shoutouts) | P0 | From peers anytime; tag to person |
| Achievement log (IC or manager adds) | P0 | “Shipped X”, “Mentored Y”, with date + links |
| 1:1 theme tags | P1 | Lightweight tags from 1:1s (“career”, “blockers”, “scope”) — still available without transcripts |
| Integration signals (read-only) | P1 | GitHub PR merges/reviews, Jira/Linear completed epics — **summaries, not raw surveillance** |
| Document evidence uploads | P0 | Upload PDF/DOCX/PPTX/images/CSV → object storage → ACL → cite on ratings/sections/AI |
| External URL artifacts | P0 | Link design docs, dashboards, tickets without uploading |
| Google Meet / Drive transcript import | P1 | Opt-in; store **summaries + theme bullets**, not raw dumps; same privacy as private manager notes by default |
| Private vs shareable evidence | P0 | Manager can mark notes, documents, and transcript summaries private |
| Cycle snapshot | P0 | At cycle open, freeze “evidence window” dates; still allow attach during writing |

**Evidence window rule:** A cycle covering Jan–Jun includes dossier items with `occurred_at` in that range, plus carry-forward goals.

### 3.1 Document evidence (upload)

Managers and ICs attach files as first-class dossier items (not only URLs).

| Capability | Detail |
|------------|--------|
| Allowed types (v1) | PDF, DOCX, PPTX, PNG/JPEG, CSV, TXT/MD |
| Size limits | Configurable; default 25 MB/file, virus/malware scan on ingest |
| Storage | Encrypted object storage; app stores metadata + signed download URLs |
| Link targets | Attach to Achievement, Goal, Feedback, Rating, or free-standing on person dossier |
| AI use | Extracted text (or OCR summary) enters ContextPackage only when requester has ACL and item is selected/eligible |
| Visibility | `private_manager` \| `subject_and_manager` \| `calibration_visible` (default: uploader chooses; manager uploads default private) |
| Retention | Follows evidence class; hard-delete removes object + EvidenceLinks |

### 3.2 Meet / Drive transcript importer (opt-in)

| Capability | Detail |
|------------|--------|
| Sources | Google Meet transcripts via Google Drive (Workspace); manual `.vtt`/`.txt` upload fallback |
| Consent | Org admin enables integration; manager opts in per report or per meeting import; IC can see that a summary exists if shared |
| What we store | Structured **MeetingSummary**: attendees, date, title, bullet themes, action items, optional quotes (capped); raw transcript kept only as short-TTL encrypted blob or not at all (org setting) |
| Default visibility | `private_manager` — same bar as private manager notes; never in IC shared packet unless explicitly reclassified |
| AI use | Summaries (not raw transcripts) may be cited in digests/drafts when visibility allows; citations show `meeting_summary:id` |
| Safety | No always-on calendar scraping of every Meet; import is explicit (pick file / pick Drive item) or rules-based folder the EM designates |
| Non-goal | Recording audio/video inside this product; we only ingest transcripts the org already produced |

---

## 4. Review cycles

| Feature | Priority | Notes |
|---------|----------|-------|
| Cycle create wizard (dates, population, templates, anonymity) | P0 | Population = org unit, level filter, or manual list |
| Phased timeline | P0 | Self → Peer → Manager → Calibration → Finalize → Share |
| Deadline reminders | P0 | Email/Slack; escalating to skip-level on breach |
| Progress command center (EM) | P0 | Who’s done self, peers outstanding, drafts vs submitted |
| Peer nomination | P0 | IC nominates; manager approves/adds; min/max peers |
| Anonymity controls | P0 | Peer text anonymous to IC by default; visible to manager |
| Draft / submit / unlock | P0 | HR/EM can unlock with audit reason |
| Bulk actions | P1 | Nudge all incomplete; export packet zip |
| Mid-cycle joins/leaves | P1 | Partial reviews; eligibility rules |
| Comp / promo flags (links out) | P1 | “Ready for promo discussion” without embedding salary |

### Cycle states

```
draft → scheduled → self_open → peer_open → manager_open
  → calibration → finalizing → shared → closed → archived
```

Overlapping phases allowed (e.g. peers still open while early manager drafts begin) via config flags.

---

## 5. Writing desk (manager review UX)

| Feature | Priority | Notes |
|---------|----------|-------|
| Person packet view | P0 | Self + peers + goals + evidence + last cycle side panel |
| Rubric scoring with anchors | P0 | Hover/expand behavioral anchors |
| Evidence picker per competency | P0 | Search dossier; attach to score |
| Overall rating consistency hint | P1 | Warn if overall << / >> competency average without rationale |
| Private scratchpad | P0 | Not in shared packet |
| Compare to last cycle | P0 | Diff ratings & themes |
| Share preview (IC view) | P0 | Exactly what IC will see |
| Discussion mode | P1 | After share: IC acknowledgment + optional comment |

---

## 6. Calibration room

| Feature | Priority | Notes |
|---------|----------|-------|
| Cohort builder (level × org) | P0 | Default: all IC3s under same director |
| Distribution histogram | P0 | Live as ratings change |
| Side-by-side cards | P0 | Summary, overall, key evidence, promo flag |
| Drag-to-discuss queue | P1 | “Needs discussion” shortlist |
| Consistency checks | P1 | Similar narratives, different ratings |
| Decision log | P0 | Rating changes during calib with reason |
| Export for leadership readout | P1 | PDF/CSV of final distributions |

**Default policy:** No forced curve. Soft guidance bands optional per company config.

---

## 7. History, analytics & memory

| Feature | Priority | Notes |
|---------|----------|-------|
| Person timeline | P0 | All cycles, ratings, goals, key feedback themes |
| Competency sparklines | P0 | Trend per competency across cycles |
| Team heat / distribution over time | P1 | Director view |
| Promotion / rating stagnation alerts | P1 | “Exceeds ×3, no promo packet” |
| Search across finalized reviews (permissioned) | P1 | Full-text for managers on their tree |
| Export / legal hold | P1 | HRBP-only packages |
| Retention policies | P0 | Configurable; default retain finalized 7 years |

---

## 8. AI integration (summary — detail in AI doc)

| Feature | Priority | Notes |
|---------|----------|-------|
| Evidence digest for a person/cycle | P0 | Bullet synthesis of dossier + self + peers |
| Draft section writer | P0 | Strengths / growth / summary from selected evidence |
| Rubric suggestion (non-binding) | P1 | Suggested scores with citations; manager must confirm |
| Bias & tone lint | P0 | Gendered language, certainty skew, vagueness |
| Consistency challenger | P1 | “You called both ‘strong ownership’ but evidence differs” |
| Peer feedback synthesizer | P0 | Cluster themes; preserve dissent |
| Goal drafting for next cycle | P1 | From growth areas |
| Calibration talking points | P1 | Per person 3-bullet readout |
| Chat-with-dossier (scoped) | P2 | Q&A over one person’s packet only |

**Hard rules:** AI never auto-submits; never invents metrics; always cites sources; logs prompts/outputs for audit.

---

## 9. Notifications & integrations

| Feature | Priority | Notes |
|---------|----------|-------|
| Email + Slack/Teams digests | P0 | Deadlines, requests, share events |
| Google/Microsoft SSO | P0 | |
| Document upload to object storage | P0 | See §3.1 |
| HRIS sync (Workday/Bamboo/etc.) | P1 | People, managers, levels |
| GitHub / GitLab signal import | P1 | Opt-in per org |
| Linear / Jira goal linkage | P1 | |
| Google Meet / Drive transcript import | P1 | Opt-in; summaries only — see §3.2 |
| Calendar holds for review 1:1s | P2 | |

---

## 10. Admin & compliance

| Feature | Priority | Notes |
|---------|----------|-------|
| Org settings (scales, anonymity, AI on/off) | P0 | |
| Audit log | P0 | Access, edits, unlocks, AI generations, exports |
| Permission tester | P1 | “What can user X see?” |
| Adverse impact reporting | P2 | Rating distributions by protected attributes (HR-only; careful legal design) |
| Data residency / deletion requests | P1 | |

---

## Non-goals (v1)

- Compensation planning / merit matrices
- Full ATS or recruiting
- Real-time keystroke productivity scoring
- Public social feed of praise (keep feedback professional and packet-oriented)
- Mobile-native apps (responsive web is enough)
