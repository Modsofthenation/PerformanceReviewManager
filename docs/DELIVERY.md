# Delivery Plan

Phased build order optimized for **fastest path to an EM doing a real cycle**.

---

## Phase 0 — Foundations

**Outcome:** Installable local app shell with people hierarchy and role framework.

- Tauri + Vite UI + Hono API sidecar skeleton
- SQLite schema + app-data file layout
- Local profiles + keychain for secrets
- Employment profiles + manager tree
- Level ladder seed data
- **Role framework upload + RoleDefinition editor + person role assignment**
- Audit log skeleton
- Design system + app shell (Command Center empty state)

**Exit criteria:** App runs on Linux, Windows, and macOS from a single codebase; manager sees directs; each direct can be tagged with a RoleDefinition from an uploaded framework.

---

## Phase 1 — Templates + dossiers + manual cycle

**Outcome:** Runnable review without AI or integrations.

- Competency library + opinionated eng template pack
- Template versioning (**including promotion packet template**)
- Goals, achievements, feedback CRUD
- **Document evidence uploads** (scan → store → ACL → cite on ratings)
- **Current vs next role comparison** on writing desk (from RoleAssignment)
- Cycle wizard + participants + phases
- Self / peer / manager review forms (+ role_fit / next_level_gap blocks)
- Writing desk packet assembly (no AI)
- Submit / share / acknowledge
- Person timeline (basic)

**Exit criteria:** EM completes a 5-person mock cycle with evidence links, uploaded documents, and ratings judged against assigned RoleDefinitions; can open a promotion checklist vs next role.

---

## Phase 2 — Calibration + history depth

**Outcome:** Fairness tooling managers actually open.

- Calibration room + decision log
- Distribution charts
- Competency trend sparklines
- Consistency warnings (overall vs competencies)
- Exports (PDF packet, CSV distributions)
- Reminder jobs (email/Slack)

**Exit criteria:** Director runs calib on 15 people; rating changes audited.

---

## Phase 3 — AI co-pilot

**Outcome:** Writing time drops; quality/grounding holds.

- Context packager + AiGeneration store
- Evidence digest, peer synthesize, draft section, bias lint
- **Role gap analysis + promotion draft** (grounded in RoleDefinition)
- Citation chips + accept-into-draft UX
- Eval harness + feature flags
- Org AI policy controls

**Exit criteria:** Faithfulness evals pass; gap analysis refuses when role unassigned; pilot EMs report ≤45 min median write time.

---

## Phase 4 — Integrations & scale

**Outcome:** Dossier fills itself.

- HRIS sync
- GitHub/Linear signal summaries
- **Google Meet / Drive transcript import** (opt-in → `MeetingSummary`, private-by-default)
- Manual transcript upload fallback
- Slack praise command + richer notifications
- Stagnation / thin-evidence alerts
- Search across finalized reviews
- Upward feedback aggregates

**Exit criteria:** Weekly signals appear on packets; HRIS reorg reflected within 24h; EM can import a Meet transcript and cite the summary privately in a draft.

---

## Phase 5 — Enterprise hardening

- RLS, data residency options
- Legal hold & retention automation
- Adverse-impact HR reports (careful rollout)
- Advanced permission tester
- Performance/load testing for cycle crunch weeks
- Mobile polish

---

## Suggested implementation modules (code layout)

```
apps/desktop/             # Tauri 2 shell (Rust)
apps/ui/                  # React + Vite + TypeScript
apps/api/                 # Hono local API sidecar
packages/db/              # Drizzle schema + SQLite migrations
packages/policy/          # ACL pure functions
packages/packet/          # assembly + redaction
packages/ai/              # providers (cloud + Ollama), prompts, evals
packages/integrations/    # csv, github, drive, …
docs/                     # this plan
```

Dev: `pnpm dev` (UI + API). Ship: Tauri build wrapping both.

---

## KPI dashboard (product)

Track from Phase 1 onward:

- Cycle completion rate
- Median time-in-writing-desk per review
- % ratings with evidence
- Peer response rate
- AI accept rate & edit distance (Phase 3+)
- Calibration decision count / meeting
- Dossier freshness (% people with ≥1 evidence item in last 60 days)

---

## Open implementation choices (defaults locked)

| Topic | Default decision |
|-------|------------------|
| Rating scale | 5-point labeled; customizable |
| Forced ranking | Off |
| Peer anonymity to IC | On by default |
| AI score suggestions | Off until Phase 3 evals pass; drafts on first |
| Comp module | Never in-core; deep-link only |
| Stack | **Tauri 2 + React/Vite/TS + Hono + SQLite** (local Win/Mac/Linux); see `docs/architecture/LOCAL_STACK.md` |

---

## Immediate next build step

Start Phase 0/1 scaffold: monorepo, schema from [DOMAIN_MODEL.md](./data/DOMAIN_MODEL.md), seed eng templates, vertical slice of Writing Desk on fake packet data.
