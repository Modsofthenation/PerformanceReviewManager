# Core loop evaluation & capture gaps

Snapshot of what the solo EM workbench **does today** vs residual gaps.
Updated after adversarial hardening (evidence validation, finalize lock, share redaction, AI egress wiring).

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
| People list + manual add | Done | No CSV yet |
| Role catalog + assign | Done | Seeded eng ladder |
| Continuous dossier | Done | Achievements, goals, feedback, documents + visibility |
| Cycle create + participants | Done | Soft window; no phase wizard |
| Export / import self & peer JSON | Done | Outside-app send; paste import |
| Command center | Done | CTA-driven next action |
| Writing desk | Done | Competencies + validated evidence links; finalize freezes citations **and** subject timeline; reopen requires reason |
| Subject export | Done | HTML (+ Print→PDF tip); requires finalized/shared; strips `private_notes` / `em_only`; redacts peer names in cites |
| Consistency + bias lint | Partial | Advisory — do not treat as fairness certification |
| Decision log | Partial | Required on non-middle / score changes; hash chain local-only (TRUST_MODEL) |
| Promotion packets | Done | Next-role marks + AI case draft |
| Backfill + MCP bulk load | Done | Thin = ach+fb+docs+goals &lt; 2; MCP needs explicit unlock / `PRM_PASSWORD` |
| Settings → AI | Done | Private notes / meeting / document extract egress **enforced** on cloud paths |

## Remaining gaps (honest)

1. **CSV people import** — still missing for cold-start orgs.
2. **Faithfulness evals** — citation allowlist strips unknown ids; prose invention still possible.
3. **Compliance-grade audit** — activity hash chain is local / EM-controlled.
4. **Desktop IPC** — Tauri still uses local HTTP; CSP not hardened.
5. **Autosave / writing-time metric** — not implemented.
6. **Bundle pipeline states** — exported / returned / waived not modeled.

## Explicit non-goals (unchanged)

Live IC login, server anonymity, cross-manager calib room, HRIS/comp — see product brief and [TRUST_MODEL.md](./architecture/TRUST_MODEL.md).
