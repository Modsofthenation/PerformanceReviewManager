# System Architecture

**v1:** Solo EM workbench — [TRUST_MODEL.md](./TRUST_MODEL.md), [LOCAL_STACK.md](./LOCAL_STACK.md).

## Goals

- Local encrypted desktop app (Linux / Windows / macOS)
- Fast writing desk + role-based evaluation
- Import-path self/peer — no live multi-user server
- Pluggable AI with explicit egress controls
- Honest activity logging (tamper-evident)

Hosted multi-tenant SaaS is a **separate track**, not a config switch.

---

## Stack

See [LOCAL_STACK.md](./LOCAL_STACK.md). Summary: Tauri 2, React/Vite, SQLite encrypted, IPC-first, app-data files, keychain, BYO AI + Ollama.

---

## Topology

```
Tauri → React UI → IPC/commands → SQLite + files + keychain
                         ↓
              Cloud AI / Ollama (opt-in)
```

---

## Permission model (workbench)

| Principal | Capabilities |
|-----------|----------------|
| Workspace Account (EM) | Full read/write on workspace; export subject packets; configure AI |
| Person (no Account) | Not an actor in-app; appears in exports the EM creates |

Export redaction (`packages/policy`) strips `em_only` fields from subject packets. This is **share-time policy**, not protection from the EM.

---

## Key API surfaces (IPC or local)

Conceptual routes — implemented as Tauri commands or authenticated localhost:

### Workspace / people
- Workspace create/unlock (encryption)
- CRUD people, CSV import, backfill

### Role framework
- Upload source, edit RoleDefinitions / RoleExpectations, publish
- Assign role / target next; role comparison

### Cycles & bundles
- Cycle CRUD / launch
- `exportBundle(self|peer)`, `importBundle`
- Command center projection

### Reviews / packet
- `assemblePacket(cycleId, personId)`
- Save/submit/finalize manager review
- Subject preview / export packet
- PromotionCase CRUD

### Evidence
- Goals, feedback, achievements, documents
- Meeting summary import
- Link evidence; snapshots on finalize

### AI
- Settings get/set (keychain)
- `evidenceDigest`, `draftSection`, `roleGapAnalysis`, `promotionDraft`, `biasLint`
- Returns `generation_id`; client accepts into draft

### History / admin
- Timeline, trends, activity log, backup/restore

---

## Packet assembly

1. Person + RoleDefinition current/next  
2. RoleExpectation lists  
3. Imported self / peers (provenance)  
4. Goals, achievements, feedback, documents (ACL for export viewer)  
5. Meeting summaries if viewer is EM  
6. Prior cycle summary  
7. Draft manager / promotion  
8. Flags: thin evidence, unassigned role, missing import, out-of-window docs  

---

## Integrations

Optional. CSV is enough. Drive/Meet = file pick or manual upload. GitHub later. No Slack required for v1.

---

## Reliability & security

- Encryption at rest (DB + files + backups)  
- IPC or tokenized localhost only  
- Sync-folder detection  
- SQLite backup API  
- Allowlist uploads; honest scan_status  
- Hash-chained ActivityEvent  
- Signed updates  
- PII kept out of logs, crash reports, and default AI context identifiers where possible (pseudonymize in ContextPackage)

---

## Testing

- Policy/export redaction unit tests  
- Bundle round-trip  
- Packet assembly  
- Migration + backup restore  
- AI citation validation + injection evals  
- Encryption unlock/lock  
- E2E: import self → write → export subject packet  
