# System Architecture

## Goals

- **Local-first desktop app** on Linux, Windows, and macOS (primary v1) — see [LOCAL_STACK.md](./LOCAL_STACK.md)
- Strong permission boundaries (more important than clever microservices)
- Fast manager UX for packet assembly and writing
- Pluggable AI provider (cloud BYO key and/or local Ollama) with full auditability
- Optional integrations (HRIS/IdP/GitHub/Drive); app remains source of truth for reviews offline

Hosted multi-tenant SaaS is a **future adapter swap**, not the v1 packaging target.

---

## Recommended stack (v1 — local cross-platform)

| Layer | Choice | Why |
|-------|--------|-----|
| Desktop shell | **Tauri 2** | Native Win/Mac/Linux installers; small footprint |
| UI | **React + TypeScript + Vite** | Ideal for local SPA inside Tauri webview |
| API | **Hono (TS) sidecar on 127.0.0.1** | Domain/AI/doc libs in TypeScript; no public bind by default |
| DB | **SQLite + Drizzle** | Zero local ops; single-file backup/portability |
| Auth | Local profiles + OS keychain | Start without SSO; secrets not in plaintext DB |
| Jobs | In-process scheduler in API | No Redis |
| File/object | OS app-data directory | Documents, frameworks, exports on disk |
| Search | SQLite FTS5 | Sufficient for dossier/review search |
| AI | BYO OpenAI/Anthropic + optional **Ollama** | Online quality + offline path |
| Notifications | OS notifications + optional email/Slack later | Local-first |
| Packaging | Tauri bundles (dmg / msi / AppImage|deb) | Normal desktop distribution |

**Detail, data paths, LAN mode, and rejected alternatives:** [LOCAL_STACK.md](./LOCAL_STACK.md).

### Future hosted variant (not v1)

| Layer | Hosted swap |
|-------|-------------|
| UI/API | Next.js or same React+Hono behind HTTPS |
| DB | PostgreSQL |
| Files | S3-compatible |
| Auth | OIDC SSO |
| Jobs | Queue (BullMQ/Inngest) |
| Shell | Browser only |

Keep `packages/policy`, `packet`, `ai`, and schema portable across both.

---

## High-level diagram (local)

```
┌─────────────────────────────────────────────┐
│  Tauri (Linux / Windows / macOS)            │
│     React UI  ──▶  Hono API (localhost)     │
│                      │                      │
│              SQLite  FS  Keychain           │
└───────────┬───────────────────┬─────────────┘
            ▼                   ▼
     Cloud AI APIs          Ollama (opt)
     Drive/GitHub (opt)
```

Legacy SaaS-shaped topology (IdP, Postgres, S3, workers) remains valid for a later hosted mode; local v1 does not require it.

---

## Permission model

### Roles (org-scoped)

| Role | Typical capabilities |
|------|----------------------|
| `ic` | Own self-review, peer requests, own shared packet, own goals/achievements |
| `manager` | All IC caps on self + full write on direct reports’ manager reviews; read peer feedback on directs; command center |
| `director` | Manager caps on subtree; calibration sessions; distribution analytics |
| `hrbp` | Cycle config, unlocks, audit access, org-wide completion, legal export |
| `admin` | Workspace settings, integrations, retention, AI policy |

### Object ACLs (enforced in query layer)

Every read of `Review`, `FeedbackItem`, `AiGeneration` goes through a **policy function**:

```
canReadReview(actor, review) → boolean
canWriteManagerReview(actor, subject, cycle) → boolean
canSeePeerAuthor(actor, peerReview) → boolean
canRunAiOnPacket(actor, subject, cycle) → boolean
```

**Rules of thumb:**
- Manager chain: actor is ancestor of subject in employment graph *as of cycle snapshot*
- Peer author identity: visible to subject’s manager + HRBP; hidden from subject when anonymous
- Private blocks: stripped in serializer, not merely hidden in UI
- AI context packager uses same ACL as human reader (AI never sees more than requester)

### Persistence strategy
Application-level policies in `packages/policy` for v1 (SQLite). Same functions port to Postgres RLS in a future hosted mode.

---

## Key API surfaces

### Cycles
- `POST /cycles` — create (HRBP)
- `POST /cycles/:id/launch`
- `GET /cycles/:id/command-center` — EM view
- `POST /cycles/:id/participants/:userId/waive-self`

### Role framework
- `POST /role-frameworks` — create pack
- `POST /role-frameworks/:id/versions` — upload source doc + draft structure
- `PUT /role-framework-versions/:id/roles` — edit RoleDefinitions / progression graph
- `POST /role-framework-versions/:id/publish`
- `PUT /people/:id/role-assignment` — tag person with RoleDefinition (+ optional target next)
- `POST /role-assignments/bulk` — team tagging
- `GET /people/:id/role-comparison` — current vs next RoleDefinition diff

### Reviews
- `GET /packets/:cycleId/:subjectId` — assembled packet (ACL)
- `PUT /reviews/:id` — save draft payload
- `POST /reviews/:id/submit`
- `POST /reviews/:id/unlock` — reason required
- `GET /reviews/:id/preview-subject`
- `POST /promotion-cases` — start promotion packet from role comparison
- `GET /promotion-cases/:id`

### Evidence
- `CRUD /goals`, `/feedback`, `/achievements`
- `POST /documents` — multipart upload → scan → metadata
- `GET /documents/:id` — ACL’d signed download
- `POST /meeting-summaries/import` — Drive/Meet pick or file upload → summary job
- `PATCH /meeting-summaries/:id/visibility` — elevate/demote with audit
- `POST /ratings/:id/evidence` — link any evidence source including `document` / `meeting_summary`

### Calibration
- `POST /calibration-sessions`
- `GET /calibration-sessions/:id`
- `POST /calibration-sessions/:id/decisions`

### AI
- `POST /ai/evidence-digest`
- `POST /ai/draft-section`
- `POST /ai/bias-lint`
- `POST /ai/peer-synthesize`
- `POST /ai/role-gap-analysis` — evidence vs current + next RoleDefinition
- `POST /ai/promotion-draft` — grounded promo packet sections
- All return `generation_id`; client explicitly applies text into draft

### History
- `GET /people/:id/timeline`
- `GET /people/:id/competency-trends`

---

## Packet assembly

`PacketService.assemble(cycleId, subjectId, viewer)` returns:

1. Subject profile snapshot (level, **assigned RoleDefinition**, target next role at cycle time)
2. **Role comparison slice** — current vs next responsibilities/expectations (evaluation basis)
3. Self review
4. Peer reviews (redacted per viewer)
5. Upward aggregate (if any)
6. Goals in window + check-ins
7. Achievements & feedback in window
8. Evidence documents visible to viewer (metadata; text extract only if AI/ACL allows)
9. Meeting summaries visible to viewer (default: manager-only)
10. Integration signal summaries
11. Prior cycle manager summary (ratings + shared text)
12. Current manager draft / promotion draft (if viewer allowed)
13. Flags: thin evidence, self-delta, promo, overdue peers, **unassigned role**, **missing next-role target**

---

## Integrations

All integrations are **optional** on the local app. CSV/manual entry is enough to run a full cycle.

### People import (CSV / manual) — P0
Primary local path: import directs, levels, managers from CSV; edit in-app.

### HRIS (Workday, BambooHR, HiBob) — P1/P2
Optional sync when credentials available; same shape as CSV import.

### GitHub / GitLab
OAuth → jobs producing `IntegrationSignal` summaries.  
**Consent:** workspace admin enables; tokens in OS keychain.

### Linear / Jira
Link issues/epics to Goals; import completion into check-ins.

### Google Drive / Meet transcripts (opt-in)
Workspace OAuth with least-privilege Drive scope, **or** local file picker for `.vtt`/`.txt`/Drive-downloaded transcripts (no Google required).  
Flow: select transcript → worker extracts text → produce `MeetingSummary` → optional raw blob with short TTL → never auto-attach to IC-visible packet.

### Slack
Optional later; local v1 uses in-app + OS notifications.

---

## Reliability & security (local)

- App-data directory with restrictive FS permissions; optional SQLCipher/encrypted documents for sensitive workspaces (P1)
- Document allowlists + size caps; optional ClamAV on Linux
- Secrets (API keys, OAuth) in **OS keychain**, not SQLite
- Local API bound to `127.0.0.1` by default
- Rate-limit AI and transcript imports per workspace
- PII minimization in logs (no review body, document text, or transcript content)
- One-click backup/restore of `db/` + `files/`
- Feature flags for AI, document upload, and Meet/Drive import

---

## Workspace model (local v1)

Single **workspace** per install (not multi-tenant SaaS).  
`organization_id` may still exist as a constant workspace id for schema portability.  
Export/import workspace archive for moving between machines.  
Future hosted mode introduces true multi-tenant `organization_id` isolation.

---

## Testing strategy

- Unit: policy functions (highest value)
- Integration: cycle state machine, packet assembly redaction
- Eval harness: AI citation faithfulness (see AI doc)
- E2E: EM writing desk happy path + calibration decision log
