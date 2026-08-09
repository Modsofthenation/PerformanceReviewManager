# Trust Model — Solo EM Workbench (v1)

## Product boundary (locked)

**v1 is a solo Engineering Manager workbench** on one machine. The EM is the data controller for that workspace. Individual contributors and peers do **not** log into the app. Self-reviews and peer input enter via **import bundles** (or paste), not live multi-user sessions.

| Capability | v1 local workbench | Later (LAN / hosted) |
|------------|--------------------|----------------------|
| Dossier, goals, achievements, documents | Yes — EM enters / imports | Shared |
| Role frameworks + person tagging | Yes | Shared org catalog |
| Manager writing desk + AI | Yes | Yes |
| Promotion packets + next-level gaps | Yes | Committee workflows |
| Self / peer collection | **Import / paste bundles only** | Live login or sync |
| “Anonymous” peer to IC | **Not promised** — manager sees all; IC sees only what EM shares in packet | Server-enforced anonymity |
| Upward feedback (n≥3) | **Out of v1** | Hosted / multi-user |
| Cross-manager calibration | **Export/import calib bundles** (optional) or single-EM consistency | Live shared session |
| HRBP unlock / org audit | Soft local activity log | Tamper-resistant / central |
| Adverse-impact reporting | **Hosted-only** | Yes |

If a feature needs a trust boundary the EM does not control (hiding data from the file owner), it is **hosted-only** and must not be marketed as a local-app guarantee.

---

## Trust assumptions

1. **Single trust domain.** Anyone with OS access to the EM’s account can read the workspace files unless encryption + OS account hygiene are in place.
2. **EM sees everything in the workspace.** There is no “private from the manager” data on the local install.
3. **Subject privacy is share-time, not store-time.** What the IC sees is whatever the EM puts in the shared packet / export — not a server redaction of a shared DB.
4. **Local audit is tamper-evident at best, not compliance-grade.** Hash-chained activity log with append-only SQLite triggers, verify endpoint, and HMAC-signed export packs keyed by the unlocked workspace secret. The EM (or malware) can still destroy the DB or re-sign after unlock. Do not sell this as immutable legal evidence or external custody.
5. **Cloud AI is an egress boundary.** Anything sent to a provider leaves the machine under the user’s API-key contract. Private-tier classes require explicit per-class opt-in.

---

## How multi-party input works in v1

```
EM exports SelfReviewBundle / PeerReviewBundle (HTML+JSON or fillable packet)
  → IC / peer completes offline
  → EM imports; app validates template_version_id + records provenance
  → Appears in Writing Desk packet
```

Provenance fields: `imported_at`, `source_filename`, `claimed_author_name`, `template_version_id`, `checksum`.

No anonymity theater: imported peer text is attributed to the named peer for the EM. When sharing with the IC, the EM chooses whether peer names appear (default: names hidden in subject preview, with UI copy **“author hidden in shared packet — not cryptographically anonymous”**).

---

## Feature markers used in other docs

- **Workbench** — in solo local v1  
- **Import-path** — supported via bundle/paste in v1  
- **Hosted-only** — requires server trust boundary; not v1  
- **Bundle-calib** — multi-EM via file exchange, not live sync  

---

## Security baseline (v1)

### Shipped today
- Encrypt SQLite + `files/` at rest with the workspace password (scrypt + AES-256-GCM seal on **Lock & encrypt**)
- Local API bound to `127.0.0.1`; session token after unlock; packaged desktop adds a per-launch capability token
- Integration / AI secrets stored encrypted in SQLite under the workspace secret (not returned in plaintext from settings GETs)
- Hard-warn when the data directory looks like Dropbox / iCloud / OneDrive / Google Drive
- Encrypted backup / restore under `data/backups`

### Not shipped yet (do not market as done)
- OS keychain custody for API keys (keys ride the workspace secret today)
- SQLCipher / Rusqlite-in-Rust as the primary DB path (Node `better-sqlite3` + file seal is what runs)
- Signed auto-update / notarized installers (desktop artifacts are manual CI builds)
- Background jobs when the app is closed

See [LOCAL_STACK.md](./LOCAL_STACK.md) and [SYSTEM.md](./SYSTEM.md).
