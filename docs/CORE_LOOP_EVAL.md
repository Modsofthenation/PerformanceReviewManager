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
| Encrypted workspace unlock/lock | Done | AES vault; seed password `workbench`; `.session` is token-only (re-unlock after API restart) |
| Encrypted backup / restore | Done | Settings → one-click snapshot under `data/backups`; restore replaces live DB while unlocked |
| People list + CSV / manual add | Done | `POST /api/people/import` + Team paste/file; template download |
| Role catalog + assign + author | Done | Seeded ladder; Roles page add/edit/delete; CSV/markdown or AI extract from R&R doc |
| Continuous dossier | Done | Achievements, goals, feedback, documents + visibility |
| Concern / underperformance log | Done | Per-person dated concerns + plan; `ai_allowed` default off; opted-in concerns feed digests/drafts |
| Cycle create + phase wizard | Done | Soft statuses (`self_open` → `closed`); editable window; waive-with-reason on missing self/peer |
| Export / import self & peer JSON | Done | Pipeline states: pending → exported → returned / waived on command center |
| Deadline nudges | Done | In-app list near due date + mailto drafts for missing self (OS mail while app open) |
| Command center | Done | Self/peer pipeline columns + cycle dashboard (writing time, evidence %, thin dossiers) |
| Writing desk | Done | Autosave ~8s; writing-time total with ≤45 min/person signal; OOW evidence tray; finalize freezes citations + timeline |
| Out-of-window evidence | Done | Late docs stay on the packet in a separate tray (flag `out_of_window_evidence`) |
| Subject export | Done | HTML (+ Print→PDF tip); requires finalized/shared; strips `private_notes` / `em_only`; redacts peer names in cites |
| Consistency + bias + faithfulness | Partial | Advisory invention checks + golden eval set + cite/soften actions — not fairness certification |
| Continuous 1:1 themes | Done | Feedback notes accept comma-separated theme tags; included in AI evidence context |
| Decision log + audit pack | Done* | Append-only triggers; verify + HMAC export in Settings. *Tamper-evident / EM-keyed — not external legal custody (TRUST_MODEL) |
| Promotion packets | Done | Next-role marks + AI case draft |
| Backfill + MCP bulk load | Done | Thin = ach+fb+docs+goals &lt; 2; MCP needs explicit unlock / `PRM_PASSWORD` |
| Settings → AI | Done | Private notes / meeting / document extract egress **enforced** on cloud paths |
| Desktop CSP / launch token / API sidecar | Done | CSP set; shell IPC removed; packaged Node + `prm-api.mjs` spawned by Tauri; CI builds Linux/macOS/Windows on `main` |

## Remaining gaps (honest)

1. **Faithfulness depth** — golden eval set + cite/soften actions exist; still not a full groundedness model eval.
2. **External / multi-party audit custody** — local HMAC pack is still EM-controlled; not WORM / HRIS-grade.
3. **Deadline delivery** — mailto / copy only while the app is open; no Slack or scheduled OS notifications.
4. **Meeting transcript → summary** — egress gate exists; structured MeetingSummary entity still planned.

## Explicit non-goals (unchanged)

Live IC login, server anonymity, cross-manager calib room, HRIS/comp — see product brief and [TRUST_MODEL.md](./architecture/TRUST_MODEL.md).
