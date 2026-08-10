# Feature Catalog

Priority: **P0** / **P1** / **P2**.  
Mode markers: **Workbench** (solo local v1) · **Import-path** · **Hosted-only** · **Bundle-calib**  
Trust boundary: [TRUST_MODEL.md](../architecture/TRUST_MODEL.md).

---

## 1. Org & people (workbench)

| Feature | Priority | Mode | Notes |
|---------|----------|------|-------|
| Local workspace + encrypted store | P0 | Workbench | Required before real employee data |
| People as employees (not necessarily logins) | P0 | Workbench | `Person` records; EM is the only Account by default |
| Reporting hierarchy | P0 | Workbench | Directs list |
| CSV / manual people import | P0 | Workbench | Team paste/file + `POST /api/people/import` |
| Cold-start backfill | P0 | Workbench | Past ratings, achievements, prior review docs — first 30 min usable |
| Level ladder | P0 | Workbench | Coarse; prefer RoleDefinition when assigned |
| Role framework library | P0 | Workbench | See §1.1 |
| Person ↔ role assignment | P0 | Workbench | Tag each direct |
| Local profiles (shared laptop) | P2 | Workbench | Same OS user ⇒ not strong isolation; prefer separate OS accounts |
| Live IC / peer login | — | Hosted-only | Not v1 |

### 1.1 Role & responsibilities framework

| Feature | Priority | Notes |
|---------|----------|-------|
| Upload R&R / career framework docs | P0 | PDF/DOCX/MD; retained under `files/frameworks` |
| Structure RoleDefinitions | P0 | Manual add/edit on Roles page; AI-assisted extract available |
| Expectations with **stable IDs** | P0 | `RoleExpectation` rows — not bare string arrays |
| Progression graph (`next_role_keys`) | P0 | Keys within framework version |
| Publish immutable framework version | P0 | Cycles pin version |
| Assign role + optional target next | P0 | Warn if profile level ≠ role level |
| Diff current vs next | P0 | Side-by-side for writing desk / promo |
| Framework owner + effective dates | P1 | “Framework insufficient” state if gaps |
| Version migration tool | P1 | Remap keys when publishing new framework year |

**Rule:** Assigned RoleDefinition text is the evaluation basis for current-role fit and next-progression comparison.

---

## 2. Templates

| Feature | Priority | Mode | Notes |
|---------|----------|------|-------|
| Template types: Self, Peer, Manager, Promotion | P0 | Workbench | Upward = Hosted-only (removed from v1 pack) |
| Check-in mini template | P0 | Workbench | New hire / &lt;90 days |
| Manager-track template (M1–M3) | P0 | Workbench | People-manager subjects |
| Versioning / pin to cycle | P0 | Workbench | |
| Blocks: text, competencies, overall, goals, role_fit, next_level_gap, promo_signal, private_text | P0 | | |
| `next_level_gap` | P0 | | **Conditional** — required only if `promo_signal` ∈ {ready, not_yet} or EM opens promo packet; not on every review |
| Promo interest (self) vs promo readiness (manager) | P0 | | Separate block types |
| Custom template builder | P1 | | v1 ships fixed pack + clone |

### 2.1 Default eng pack (v1)

- IC Self, Peer (short), Manager (IC), Manager (people-manager), Check-in, Promotion packet  
- **No upward template in v1**  
- Competency catalog + anchors for primary levels (complete for shipped competencies)  
- See `default_eng_template_pack.json`

---

## 3. Continuous evidence (dossier)

| Feature | Priority | Notes |
|---------|----------|-------|
| Goals + check-ins | P0 | |
| Feedback items (EM-entered or imported) | P0 | |
| Achievements | P0 | |
| Document uploads | P0 | PDF/DOCX/PPTX/images/CSV → app-data; allowlist + size caps; `scan_status` = allowlist/not_scanned unless real scanner configured |
| External URLs | P0 | |
| Meet / transcript → MeetingSummary | P1 | Opt-in; default private-to-EM; notice that “private” ≠ undiscoverable legally |
| 1:1 theme tags | P1 | Feedback notes; themes feed AI digests |
| Integration signals (GitHub / Linear) | P0 | Optional; Settings credentials + person account link; sync into dossier achievements |
| Jira + Bitbucket sync | P0 | Settings credentials; person account link; tickets/merged PRs → achievements |
| Private vs shareable | P0 | Controls **share/export** inclusion; EM always sees workspace data |
| Evidence snapshots at finalize | P0 | Cited title/checksum/excerpt frozen into review |
| Out-of-window tray | P1 | Don’t silently drop late-uploaded docs |

---

## 4. Cycles & import-path collaboration

| Feature | Priority | Mode | Notes |
|---------|----------|------|-------|
| Cycle wizard | P0 | Workbench | Window, phases, templates by role/level |
| Command center | P0 | Workbench | Bundle sent/returned, drafts, shared exports |
| **Export self-review bundle** | P0 | Import-path | Per person; pins template_version |
| **Export peer-review bundle** | P0 | Import-path | EM picks peers; or IC suggests offline |
| **Import bundle / paste** | P0 | Import-path | Validate template version; store provenance |
| Phase gates | P1 | | Soft gates — EM can waive with reason (no remote HR unlock) |
| Deadline reminders | P0 | Workbench | **OS / in-app only** while app running; exportable nudge list / mailto drafts for ICs |
| Email/Slack reminders | — | Hosted-only / P2 | |
| Live peer nomination workflow | — | Hosted-only | v1: EM records peer list + imports |
| Server-enforced peer anonymity | — | Hosted-only | v1: optional hide names in **subject export** only |
| Mid-cycle manager change | P1 | | Contribution / supersede model |

### Cycle states (participant-authoritative)

Per-participant phase status is source of truth; cycle banner is derived. Overlaps allowed (e.g. import peers while drafting).

---

## 5. Writing desk

| Feature | Priority | Notes |
|---------|----------|-------|
| Packet = role comparison + imports + dossier + prior cycle | P0 | |
| Role-fit vs current RoleExpectation IDs | P0 | |
| Competency scores + evidence | P0 | Evidence required outside middle band |
| Conditional next-level gap checklist | P0 | Stable expectation IDs + marks |
| Private scratchpad | P0 | |
| Subject preview / share export | P0 | Exactly what IC receives |
| Draft autosave + section restore | P0 | Crash recovery |
| Underperformance / concern log | P1 | Dated concerns, expectation record, improvement plan; AI off by default |
| Open promotion packet | P0 | From readiness signal |

---

## 6. Calibration & consistency

| Feature | Priority | Mode | Notes |
|---------|----------|------|-------|
| Single-EM consistency view | P0 | Workbench | Distribution across own directs; side-by-side |
| Decision log (local) | P0 | Workbench | Append-only triggers; Settings verify + HMAC export; not compliance-grade custody |
| Cross-manager calibration | P1 | Bundle-calib | Export candidate cards → director import → decisions back |
| Live multi-EM calib room | — | Hosted-only | |

---

## 7. History & analytics

| Feature | Priority | Notes |
|---------|----------|-------|
| Person timeline | P0 | Person dossier chronological stream (evidence, concerns, reviews, decisions) |
| Competency sparklines (manager ratings only) | P0 | Team performance → rating trends across cycles |
| Stagnation hints | P1 | Local heuristics |
| Search finalized reviews | P1 | FTS on workspace |
| Workspace stats (time, evidence %) | P0 | Cycle dashboard on Home — writing time, coverage %, thin dossiers |
| Team performance graphs | P0 | `/team-performance` — rating histogram, competency averages, writing buckets, themes, prior-cycle deltas, cycle compare |
| Sprint / window pulse | P0 | `/sprint-pulse` — date-range throughput, themes, concerns, evidence freshness |
| Adverse-impact reporting | — | Hosted-only |

---

## 8. AI

| Feature | Priority | Notes |
|---------|----------|-------|
| Settings → AI (keys, provider, models, test) | P0 | Anthropic / OpenAI / OpenAI-compatible gateway / Ollama; Cursor `crsr_` keys are Cloud Agents only (not chat) |
| Evidence digest, draft sections, peer synthesize | P0 | |
| Role gap analysis + promo draft | P0 | |
| Bias / tone lint | P0 | Advisory; ephemeral findings by default |
| Faithfulness / invention checks | P0 | Unknown cites, ungrounded sentences, bare metrics (advisory) |
| Citation ID validation | P0 | Strip unknown ids |
| Private-tier egress | P0 | Per-data-class opt-in; per-generation manifest |
| Local-only / Ollama | P0 | |
| Cost/token estimate | P1 | Before run |
| Chat-with-dossier | P0 | `/chat` — grounded Q&A over loaded workspace data |

Detail: [AI_INTEGRATION.md](../ai/AI_INTEGRATION.md).

---

## 9. Notifications & integrations

| Feature | Priority | Mode | Notes |
|---------|----------|------|-------|
| OS + in-app notifications | P0 | Workbench | |
| Document / framework upload | P0 | Workbench | |
| Google Drive / Meet file pick or manual transcript | P1 | Workbench | |
| GitHub / Linear | P0 | Settings → Integrations; person link + sync into dossier achievements |
| Jira Cloud + Bitbucket Cloud | P0 | Settings → Integrations; person link + sync into dossier achievements |
| Slack / email digests | — | Hosted-only / later | |

---

## 10. Admin & safety

| Feature | Priority | Notes |
|---------|----------|-------|
| Workspace settings | P0 | Scales, AI, retention (short default locally) |
| Encrypted backup / restore | P0 | Settings one-click; SQLite encrypted under `data/backups` |
| Activity log (hash-chained) | P0 | Append-only triggers; Settings verify + HMAC-signed export (EM-keyed, not legal custody) |
| Export subject packet / workspace archive | P0 | Handoff when EM leaves |
| Legal-hold flag (local) | P1 | Blocks purge |
| Retention default | P0 | **Current + previous cycle** locally; export to company SoR at close; long retention = hosted |
| Permission tester | P2 | Thin in solo mode |

---

## Non-goals (v1)

- Live multi-user / SSO / server anonymity  
- Comp planning, forced ranking  
- Slack DM surveillance  
- Mobile-native apps  
- Adverse-impact dashboards on the laptop  
- Claiming local audit is immutable legal evidence  
