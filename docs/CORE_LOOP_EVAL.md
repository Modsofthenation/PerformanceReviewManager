# Core loop evaluation & capture gaps

Snapshot of what the solo EM workbench **does today** vs residual gaps.
Updated after role framework authoring + AI/local extract from R&R docs.

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
| People list + CSV / manual add | Done | `POST /api/people/import` + Team paste/file; template download |
| Role catalog + assign + author | Done | Seeded ladder; Roles page add/edit/delete; CSV/markdown or AI extract from R&R doc |
| Continuous dossier | Done | Achievements, goals, feedback, documents + visibility |
| Cycle create + participants | Done | Soft window; no phase wizard |
| Export / import self & peer JSON | Done | Outside-app send; paste import |
| Command center | Done | CTA-driven next action |
| Writing desk | Done | Competencies + validated evidence links; finalize freezes citations **and** subject timeline; reopen requires reason |
| Subject export | Done | HTML (+ Print→PDF tip); requires finalized/shared; strips `private_notes` / `em_only`; redacts peer names in cites |
| Consistency + bias lint | Partial | Advisory — do not treat as fairness certification |
| Decision log + audit pack | Done* | Append-only triggers; verify + HMAC export in Settings. *Tamper-evident / EM-keyed — not external legal custody (TRUST_MODEL) |
| Promotion packets | Done | Next-role marks + AI case draft |
| Backfill + MCP bulk load | Done | Thin = ach+fb+docs+goals &lt; 2; MCP needs explicit unlock / `PRM_PASSWORD` |
| Settings → AI | Done | Private notes / meeting / document extract egress **enforced** on cloud paths |
| Desktop CSP / launch token | Done | CSP set; shell IPC removed; `PRM_LAUNCH_TOKEN` + injected header when using `desktop:dev` |

## Remaining gaps (honest)

1. **Faithfulness evals** — citation allowlist strips unknown ids; prose invention still possible.
2. **External / multi-party audit custody** — local HMAC pack is still EM-controlled; not WORM / HRIS-grade.
3. **API as Tauri sidecar** — desktop still talks HTTP to a separately started Node API.
4. **Autosave / writing-time metric** — not implemented.
5. **Bundle pipeline states** — exported / returned / waived not modeled.

## Explicit non-goals (unchanged)

Live IC login, server anonymity, cross-manager calib room, HRIS/comp — see product brief and [TRUST_MODEL.md](./architecture/TRUST_MODEL.md).
