# Delivery Plan — Solo EM Workbench

Aligned to [TRUST_MODEL.md](./architecture/TRUST_MODEL.md).

---

## Phase 0 — Foundations & safety

**Status:** Vertical slice shipped (browser + API; Tauri shell + Node sidecar). Several Phase 0 *targets* remain open — see below.

**Outcome:** App skeleton that can hold real data safely **when locked**, with honest threat-model docs.

**Shipped**
- Tauri shell + Vite UI + Node Hono API on `127.0.0.1` (launch token in packaged desktop)
- AES-256-GCM seal of SQLite + files on lock; sync-folder hard-warn
- Single Account; workspace-password vault (API keys encrypted with workspace secret — not OS keychain yet)
- `Person` / manager tree + CSV import (requires EM)
- ActivityEvent hash chain + HMAC export
- Encrypted workspace backup/restore
- Synthetic **8-person** demo seed (rolling relative cycle dates)
- CI: unit tests on every `main` PR; desktop installers on manual **Desktop Installers** `workflow_dispatch`; **Release** workflow publishes GitHub Release assets

**Still open (do not claim done)**
- OS keychain for API keys
- SQLCipher / Rusqlite-primary path
- Signed / notarized installers + auto-update
- IPC-only topology without Node sidecar

**Exit (partial):** App runs encrypted-at-rest workspace on supported OS targets; backup/restore verified; trust model reflected in UI copy. Signing + keychain remain follow-ups.

---

## Phase 1 — Roles, dossier, vertical slice

**Outcome:** EM completes reviews for ~5 people without live IC login.

- Role framework upload + RoleExpectation editor + assignment
- Cold-start backfill wizard
- Fixed template pack (IC self/peer/manager, check-in, promotion) — no upward
- Goals, achievements, feedback, document uploads
- Cycle + **export/import bundles**
- Writing desk: role_fit, competencies, conditional next_level_gap
- CitationSnapshot on finalize; subject packet export
- Draft autosave
- On-device writing-time metric

**Exit:** Mock cycle with imports + at least one uploaded doc cited; ratings against RoleDefinitions.

---

## Phase 2 — Consistency, history, underperformance

- Single-EM distribution / side-by-side consistency
- Decision log
- Person timeline + manager-only sparklines
- Concern log / improvement plan (AI off default)
- Optional calibration **file bundles**
- OS/in-app reminders + exportable nudge list

**Exit:** EM adjusts ratings with logged reasons; timeline usable.

---

## Phase 3 — AI co-pilot

- Settings → AI; providers; test connection; local-only
- Context packager + per-generation data-class manifest
- Digest, draft, peer synthesize, role gap, promo draft
- Citation ID validation; injection eval suite; faithfulness gate
- Private-tier per-class opt-in
- Lint ephemeral by default
- Cost estimate (P1 stretch)

**Exit:** Evals pass on synthetic packets; design partners hit ≤45 min with AI assist vs Phase 1 baseline.

---

## Phase 4 — Integrations (optional)

- Manual + Drive picker transcripts → MeetingSummary
- GitHub/Linear summaries if warranted
- Framework AI-assisted extract
- Meet notice/consent copy in UI

---

## Phase 5 — Hardening (still local)

- Full 3-OS signed installers + auto-update
- Parser sandboxing hardening
- Accessibility baseline (keyboard writing desk, contrast)
- Legal-hold flag; handoff export polish
- **Not** RLS / multi-tenant SaaS — that is a separate hosted track

---

## Module layout

```
apps/desktop/          # Tauri shell + API sidecar packaging
apps/ui/               # React + Vite
apps/api/              # Node Hono + better-sqlite3
packages/db/           # schema, openDatabase
packages/shared/       # shared DTOs / types
packages/mcp/          # stdio MCP bulk-loader
docs/
```

Domain services (packet assembly, AI providers, export policy) currently live under `apps/api` rather than separate packages. Splitting them is optional cleanup, not a release blocker.

---

## Locked defaults

| Topic | Decision |
|-------|----------|
| Product mode | Solo EM workbench |
| Collaboration | Import bundles |
| Stack | Tauri + Vite/React + SQLite (AES seal on lock) + Node Hono sidecar |
| Upward / live anonymity / adverse impact | Hosted-only |
| next_level_gap | Conditional |
| Local retention | Current + previous cycle (+ export to SoR) |
| AI keys | In-app Settings → encrypted with workspace secret (keychain target) |
