# Delivery Plan — Solo EM Workbench

Aligned to [TRUST_MODEL.md](./architecture/TRUST_MODEL.md).

---

## Phase 0 — Foundations & safety

**Outcome:** Signed-capable app skeleton that can hold real data safely.

- Tauri + Vite UI + IPC (spike: no naked HTTP API)
- Encrypted SQLite + app-data layout; sync-folder warning
- Single Account; keychain + Linux fallback
- `Person` / EmploymentRecord / manager tree
- CSV import
- ActivityEvent hash chain
- Workspace backup/restore (SQLite backup API)
- Synthetic 12-person seed org (demo + AI fixtures later)
- CI matrix spike on one primary OS, then expand; signing keys process started
- Design-partner outreach (data-handling agreement)

**Exit:** App runs encrypted workspace on at least one OS; backup/restore verified; trust model reflected in UI copy.

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
apps/desktop/          # Tauri
apps/ui/               # React + Vite
packages/core/         # domain services (TS or Rust)
packages/db/           # schema, migrations
packages/policy/       # export redaction rules
packages/packet/       # assembly
packages/ai/           # providers, evals
packages/bundles/      # export/import formats
docs/
```

---

## Locked defaults

| Topic | Decision |
|-------|----------|
| Product mode | Solo EM workbench |
| Collaboration | Import bundles |
| Stack | Tauri + Vite/React + SQLite encrypted |
| Upward / live anonymity / adverse impact | Hosted-only |
| next_level_gap | Conditional |
| Local retention | Current + previous cycle (+ export to SoR) |
| AI keys | In-app Settings → keychain |
