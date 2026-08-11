# Core loop evaluation & capture gaps

Snapshot of what the solo EM workbench **does today** vs residual gaps.
Updated after the high-impact next slice (autosave, pipelines, phases, nudges, concerns, faithfulness, OOW tray, backup UI, API sidecar, desktop CI).

## Core loop (product)

```
upload role R&R → tag people → year-round dossier
  → import self/peer bundles → writing desk (+ AI)
  → next-level / promo packet → share export → history
```

## What works now (vertical slice)

| Step | Status | Notes |
|------|--------|--------|
| Encrypted workspace unlock/lock | Done | AES vault; demo seed password `workbench` (demo only — never a silent API default); `.session` is token-only (re-unlock after API restart) |
| Encrypted backup / restore | Done | Settings → one-click snapshot under `data/backups`; restore replaces live DB while unlocked |
| People list + CSV / manual add | Done | `POST /api/people/import` + Team paste/file; template download |
| Role catalog + assign + author | Done | Seeded PE Engineering Career Framework (Graduate → CTO, IC + management); Roles page add/edit/delete; CSV/markdown or AI extract from R&R doc |
| Continuous dossier | Done | Achievements, goals, feedback, documents + visibility |
| Concern / underperformance log | Done | Per-person dated concerns + plan; `ai_allowed` default off; opted-in concerns feed digests/drafts |
| Cycle create + phase wizard | Done | Soft statuses (`self_open` → `closed`); editable window; waive-with-reason on missing self/peer |
| Export / import self & peer JSON | Done | Pipeline states: pending → exported → returned / waived on command center |
| Deadline nudges | Done | In-app list near due date + mailto drafts for missing self (OS mail while app open) |
| Command center | Done | Self/peer pipeline columns + cycle dashboard (writing time, evidence %, thin dossiers) |
| Team performance graphs | Done | Rating histogram, competency averages, evidence scatter, writing/promo/theme bars, prior-cycle deltas, cross-cycle trends, cycle compare |
| Sprint / window pulse | Done | Date-range coaching pulse: throughput, themes, concerns, stale-cite freshness |
| Person timeline | Done | Dossier + reviews + concerns + decision events on the person page |
| Writing desk | Done | Autosave ~8s; writing-time total with ≤45 min/person signal; OOW evidence tray; finalize freezes citations + timeline |
| Out-of-window evidence | Done | Late docs stay on the packet in a separate tray (flag `out_of_window_evidence`) |
| Subject export | Done | HTML (+ Print→PDF tip); requires finalized/shared; strips `private_notes` / `em_only`; redacts peer names in cites |
| Consistency + bias + faithfulness | Partial | Advisory invention checks + golden eval set + cite/soften actions — not fairness certification |
| Continuous 1:1 themes | Done | Feedback notes accept comma-separated theme tags; included in AI evidence context |
| Interactive 1:1 sessions (Q&A) | Done | Person dossier sessions with manual questions/answers; optional AI-suggested questions from evidence |
| Meeting summaries | Done | Structured MeetingSummary (em_only default + consent); optional AI; raw transcript kept private |
| Jira + Bitbucket integrations | Done | Settings credentials (encrypted); person account link; sync tickets/merged PRs into achievements |
| Decision log + audit pack | Done* | Append-only triggers; verify + HMAC export in Settings. *Tamper-evident / EM-keyed — not external legal custody (TRUST_MODEL) |
| Promotion packets | Done | Next-role marks + AI case draft |
| Backfill + MCP bulk load | Done | Thin = ach+fb+docs+goals &lt; 2; MCP needs explicit unlock / `PRM_PASSWORD` |
| Settings → AI | Done | Private notes / meeting / document extract egress **enforced** on cloud paths |
| Desktop CSP / launch token / API sidecar | Done | CSP set; shell IPC removed; packaged Node + `prm-api.mjs` spawned by Tauri; desktop installers via Actions → **Desktop Installers** → **Run workflow** (not every merge) |

## Remaining gaps (honest)

1. **Faithfulness model eval** — expanded golden + bias suites (injection / cross-person cites); still not a full groundedness model eval.
2. **External / multi-party audit custody** — local HMAC pack is still EM-controlled; not WORM / HRIS-grade. Legal-hold blocks purge locally.
3. **Deadline delivery when app closed** — OS Notification API + due-this-week tray while open; no scheduled background agent.
4. **Signed auto-update** — Settings “Check for updates” hits GitHub Releases (soft message if none yet); Tauri updater + code-signing keys still needed for silent install. Cut alphas via Actions → **Release**.

## Shipped in P1 features slice

| Item | Notes |
|------|--------|
| AI cost/token estimate | `POST /api/ai/estimate` + confirm gate on digest/draft/chat |
| Retention + legal hold | Settings policy + purge gate |
| Mid-cycle manager reassign | Supersede prior manager reviews + new draft |
| Custom templates | Clone/edit pack; bundle export uses saved fields |
| Linear integration | First-class alongside Jira/BB/GitHub |
| Meet/Drive transcript pick | Local file + dossier document loader |
| Empty onboarding wizard | Home banner after empty create |
| Phone table cards | `.table-cards` on Team |

## Shipped in P1 core-loop slice

| Item | Notes |
|------|--------|
| MeetingSummary | Person page paste/AI summarize; `em_only` default; consent gate; raw transcript stored as private doc |
| Faithfulness depth | Allowlist always built with cycle/person; Apply all fixes; expanded golden evals |
| Due this week | `/api/due-this-week` + Home sticky tray + session OS notification |
| Calibration bundles | Consistency page export/import director decisions |
| Framework polish | Owner/effective dates, insufficient warnings, migrate & publish |
| Search + stagnation | FTS on finalized reviews; `/search` page; flat/thin heuristics |
| Desktop reliability | Same-origin UI serve; version IPC; update check in Settings |

## Explicit non-goals (unchanged)

Live IC login, server anonymity, cross-manager calib room, HRIS/comp — see product brief and [TRUST_MODEL.md](./architecture/TRUST_MODEL.md).
