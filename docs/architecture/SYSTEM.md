# System Architecture

## Goals

- Multi-tenant SaaS suitable for mid-size eng orgs (50–2000 employees) first
- Strong permission boundaries (more important than clever microservices)
- Fast manager UX for packet assembly and writing
- Pluggable AI provider with full auditability
- HRIS/IdP as source of truth for people; this app as source of truth for reviews

---

## Recommended stack (v1)

| Layer | Choice | Why |
|-------|--------|-----|
| Web app | Next.js (App Router) + TypeScript | Fast product iteration, good SSR for packet views |
| API | Next.js route handlers + tRPC or REST | Single deployable for v1; extract later if needed |
| DB | PostgreSQL | Relational integrity for cycles/reviews/permissions |
| ORM | Prisma or Drizzle | Migrations + type safety |
| Auth | SSO via OIDC (Google/Microsoft/Okta) | Enterprise default |
| Jobs | Queue (e.g. Inngest / BullMQ) | Reminders, HRIS sync, AI long runs, signal import |
| File/object | S3-compatible | Attachments, PDF exports |
| Search | Postgres full-text → OpenSearch later | Permission-aware search |
| AI | Provider-agnostic SDK (OpenAI/Anthropic) | Swap models; log everything |
| Email/Slack | Resend + Slack Bolt | Notifications |
| Hosting | Container on Fly/Render/AWS | Standard |

**Monolith-first:** one app + worker until calibration AI or sync load forces splits.

---

## High-level diagram

```
                    ┌─────────────┐
                    │  IdP / SSO  │
                    └──────┬──────┘
                           │
┌──────────┐         ┌─────▼──────┐         ┌──────────────┐
│ Slack    │────────▶│  Web App   │◀────────│  HRIS sync   │
│ Email    │         │  + API     │         │  worker      │
└──────────┘         └─────┬──────┘         └──────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Postgres │ │  Queue   │ │ Object   │
        └──────────┘ └────┬─────┘ │ Store    │
                          │       └──────────┘
                          ▼
                    ┌──────────┐     ┌────────────┐
                    │ AI worker│────▶│ LLM API    │
                    └──────────┘     └────────────┘
                          │
                          ▼
                    GitHub/Linear
                    signal importers
```

---

## Permission model

### Roles (org-scoped)

| Role | Typical capabilities |
|------|----------------------|
| `ic` | Own self-review, peer requests, own shared packet, own goals/achievements |
| `manager` | All IC caps on self + full write on direct reports’ manager reviews; read peer feedback on directs; command center |
| `director` | Manager caps on subtree; calibration sessions; distribution analytics |
| `hrbp` | Cycle config, unlocks, audit access, org-wide completion, legal export |
| `admin` | SSO/settings, integrations, retention, AI policy |

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

### Row-level strategy
Postgres + application policies for v1. Add RLS later for defense-in-depth on sensitive tables (`reviews`, `ai_generations`, `audit_events`).

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

### HRIS (Workday, BambooHR, HiBob, CSV)
Nightly sync: employees, managers, levels, terminations.  
Manual override with `source=manual` and sync-conflict UI.

### GitHub / GitLab
OAuth app installation → weekly job per user producing `IntegrationSignal` summaries.  
**Consent:** org admin enables; individuals can hide personal repos.

### Linear / Jira
Link issues/epics to Goals; import completion into check-ins.

### Google Drive / Meet transcripts (opt-in)
Workspace OAuth with least-privilege Drive scope for transcript files the importer is pointed at (explicit file pick or designated folder).  
Flow: select transcript → worker extracts text → produce `MeetingSummary` (themes, actions, capped quotes) → optional raw blob with short TTL → never auto-attach to IC-visible packet.  
Manual `.vtt`/`.txt` upload supported without Google connect.

### Slack
Notify deadlines; `/prm praise @user …` creates FeedbackItem; deep links to packet.

---

## Reliability & security

- Encrypt attachments and transcript blobs at rest; TLS in transit
- Malware scan before document is `clean` / downloadable
- Secrets in KMS/vault
- Rate-limit AI endpoints and transcript imports per org
- PII minimization in logs (no review body, document text, or transcript content in app logs)
- Backup + point-in-time recovery on Postgres
- Feature flags for AI, document upload, and Meet/Drive import per org

---

## Multi-tenancy

`organization_id` on every tenant table.  
Subdomain or path tenant resolution after SSO.  
No cross-tenant AI batching.

---

## Testing strategy

- Unit: policy functions (highest value)
- Integration: cycle state machine, packet assembly redaction
- Eval harness: AI citation faithfulness (see AI doc)
- E2E: EM writing desk happy path + calibration decision log
