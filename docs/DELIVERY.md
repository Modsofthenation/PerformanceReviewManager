# Delivery Plan

Phased build order optimized for **fastest path to an EM doing a real cycle**.

---

## Phase 0 — Foundations

**Outcome:** Auth’d multi-tenant app with people hierarchy.

- Org, users, SSO, roles
- Employment profiles + manager tree
- Level ladder seed data
- Audit log skeleton
- Design system + app shell (Command Center empty state)

**Exit criteria:** Admin can invite users; manager sees directs.

---

## Phase 1 — Templates + dossiers + manual cycle

**Outcome:** Runnable review without AI or integrations.

- Competency library + opinionated eng template pack
- Template versioning
- Goals, achievements, feedback CRUD
- Cycle wizard + participants + phases
- Self / peer / manager review forms
- Writing desk packet assembly (no AI)
- Submit / share / acknowledge
- Person timeline (basic)

**Exit criteria:** EM completes a 5-person mock cycle end-to-end with evidence links.

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
- Citation chips + accept-into-draft UX
- Eval harness + feature flags
- Org AI policy controls

**Exit criteria:** Faithfulness evals pass; pilot EMs report ≤45 min median write time.

---

## Phase 4 — Integrations & scale

**Outcome:** Dossier fills itself.

- HRIS sync
- GitHub/Linear signal summaries
- Slack praise command + richer notifications
- Stagnation / thin-evidence alerts
- Search across finalized reviews
- Upward feedback aggregates

**Exit criteria:** Weekly signals appear on packets; HRIS reorg reflected within 24h.

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
apps/web/                 # Next.js UI + API
packages/db/              # schema, migrations
packages/policy/          # ACL pure functions
packages/packet/          # assembly + redaction
packages/ai/              # providers, prompts, evals
packages/integrations/    # hris, github, slack
docs/                     # this plan
```

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
| Stack | Next.js + Postgres + queue + SSO |

---

## Immediate next build step

Start Phase 0/1 scaffold: monorepo, schema from [DOMAIN_MODEL.md](./data/DOMAIN_MODEL.md), seed eng templates, vertical slice of Writing Desk on fake packet data.
