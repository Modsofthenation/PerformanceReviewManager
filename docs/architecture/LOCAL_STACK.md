# Local Cross-Platform Tech Stack

**v1 product:** solo EM workbench — [TRUST_MODEL.md](./TRUST_MODEL.md).

Primary target: installable app on **Linux, Windows, macOS**. No Docker/Postgres for end users.

---

## Locked stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Shell | **Tauri 2** | dmg / msi|NSIS / AppImage|deb |
| UI | **React + TypeScript + Vite** | |
| Backend bridge | **Prefer Tauri IPC commands** for DB/FS/keychain/HTTP; optional thin Hono only if needed | Avoid unauthenticated TCP |
| If HTTP sidecar used | Hono on `127.0.0.1` + **per-launch capability token** + origin checks | Or Unix socket / named pipe |
| DB | **SQLite** via **Rusqlite in Rust** (preferred) or one pinned JS driver | Pick one in Phase 0; enables SQLCipher path |
| ORM / migrations | Drizzle or sqlx migrations — single choice in Phase 0 | |
| Files | OS app-data directory | |
| Search | SQLite FTS5 | |
| Jobs | Durable `jobs` table + run-while-open worker | Reminders don’t fire when app closed — documented |
| Auth | Single Account; OS keychain for API keys | Linux: Secret Service or app-password-wrapped key file fallback |
| AI | Settings → AI; BYO keys + Ollama | |
| Encryption | **Required** for real data: SQLCipher or authenticated encryption of DB+files | Phase 0/1 gate |
| Packaging | Code signing + notarization (Apple) + Windows Authenticode | Phase 0 infrastructure |

---

## Topology

```
┌──────────────────────────────────────────┐
│ Tauri (Win / Mac / Linux)                │
│   React UI ── IPC ── Rust commands       │
│                 │                        │
│            SQLite (encrypted)            │
│            App-data files (encrypted)    │
│            OS keychain                   │
└───────────┬──────────────────┬───────────┘
            ▼                  ▼
     Cloud AI (opt-in)    Ollama (opt)
```

**Rejected as v1 primary:** Electron (fallback only), Docker-only UX, Next.js SSR, naked Postgres.

---

## Data locations

Same OS paths as before (`Application Support` / `%APPDATA%` / `~/.local/share/...`).

```
.../PerformanceReviewManager/
  workspace.json
  db/prm.sqlite
  files/{documents,frameworks,extracts,meeting_raw,exports}
  logs/
  backups/
```

- **Refuse or hard-warn** if path is under Dropbox/iCloud/OneDrive/Google Drive sync folders.  
- Backup: SQLite Online Backup API / `VACUUM INTO`, then encrypt zip; verify restore.  
- Portability: versioned workspace archive with schema version + forward migrations.

---

## Sidecar decision

**Default:** no Node sidecar — domain logic in TS inside webview calling Tauri commands for privileged ops, **or** core domain in Rust.  

**Current escape (shipped):** packaged Node + bundled Hono API under `src-tauri/sidecars/` (capability token + supervised lifecycle). Prefer migrating privileged ops to Tauri commands over time.

---

## AI configuration

Fully in-app **Settings → AI** (see Features §8). Keys never in SQLite. Dev env overrides allowed for `pnpm dev` only.

---

## Security baseline

1. Encryption at rest before real employee data  
2. No unauthenticated localhost API  
3. Keychain + Linux fallback  
4. Sync-folder detection  
5. Hash-chained activity log (evident, not proof)  
6. Parser allowlists; no fake “malware scanned” status without a scanner  
7. Signed updates  

---

## Hosted later

Separate architecture track (identity, sync, RLS, central audit). Not an “adapter flip.” Schema packages stay portable where practical; do not claim zero-cost SaaS migration.
