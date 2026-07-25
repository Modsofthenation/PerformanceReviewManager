# Core loop evaluation & capture gaps

Snapshot of what the solo EM workbench **does today** vs what the product loop still needs.

## Core loop (product)

```
upload role R&R → tag people → year-round dossier
  → import self/peer bundles → writing desk (+ AI)
  → next-level / promo packet → share export → history
```

## What works now (vertical slice)

| Step | Status | Notes |
|------|--------|--------|
| Encrypted workspace unlock/lock | Done | AES vault; seed password `workbench` |
| People list + manual add | Done | No CSV yet |
| Role catalog + assign | Done* | Seeded eng ladder; *GET `/api/roles` needed `roleFrameworkVersions` import |
| Continuous dossier | Partial | Achievements, goals, documents; **feedback** now writable |
| Cycle create + participants | Done | Soft window; no phase wizard |
| Export / import self & peer JSON | Done | Outside-app send; paste import |
| Command center | Partial | Self / peers / manager status; weak “next action” until CTA pass |
| Writing desk | Partial | Role strip, imports, draft, promo gaps, AI digest/draft; no competency evidence links |
| Subject export preview | Partial | JSON only — not shareable HTML/PDF |
| Promotion packets | Done | Next-role marks + AI case draft |
| Settings → AI | Done | Provider, key, private-tier egress, test |

## Highest-value extensions (ordered)

### P0 — finish the review cycle

1. **Clear CTAs per screen** — one primary next action driven by state (this change set).
2. **Feedback capture on dossier** — EM-entered praise / coaching (this change set).
3. **Competency scores + evidence links** on writing desk (schema `evidence_links` unused).
4. **Finalize → share packet** — downloadable subject HTML/PDF omitting `em_only`.
5. **Citation snapshots** at finalize (freeze cited titles/excerpts).

### P0 — onboarding & roles

6. **CSV people import** — primary cold-start path in the brief.
7. **Role framework upload + expectation editor** — beyond seeded catalog.
8. **Backfill wizard** — prior ratings / docs / top achievements in first session.

### P1 — quality & throughput

9. **Single-EM consistency** view (nav gap vs IA).
10. **Autosave + writing-time metric** (≤45 min target).
11. **Bundle pipeline states** — exported / returned / waived with reason.
12. **Decision log** on rating changes.
13. **Person timeline / prior cycle** in the packet pane.

### Later

14. Meeting summaries, GitHub/Linear, calibration bundles, handoff archive — see [FEATURES.md](./product/FEATURES.md).

## Per-page job & primary CTA (target)

| Page | Job | Primary CTA |
|------|-----|-------------|
| Unlock | Open vault | Unlock / Create & seed |
| Home | Decide who to unblock next | Continue writing **or** Get self-review / Assign role |
| Team | Open a dossier or add a person | Open dossier / Add person |
| Person | Capture weekly evidence | Add achievement · feedback · goal · document |
| Roles | Assign current (+ next) role | Save assignment (unassigned first) |
| Cycles | Move bundles in/out | Download JSON bundle → Import completed |
| Writing desk | Draft & close review | Save draft → Finalize → Preview subject export |
| Promotions | Build next-role case | Start / Open packet → Submit |
| Settings | Configure AI safely | Save AI settings · Test connection |

## Explicit non-goals (unchanged)

Live IC login, server anonymity, cross-manager calib room, HRIS/comp — see product brief.
