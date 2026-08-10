# Local Cross-Platform Tech Stack

**v1 product:** solo EM workbench — [TRUST_MODEL.md](./TRUST_MODEL.md).

Primary target: installable app on **Linux, Windows, macOS**. No Docker/Postgres for end users.

---

## Locked stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Shell | **Tauri 2** | dmg / msi|NSIS / AppImage|deb (manual **Desktop Installers** `workflow_dispatch`) |
| UI | **React + TypeScript + Vite** | |
| Backend (shipped) | **Node Hono sidecar** on `127.0.0.1` + session token; desktop adds **per-launch capability token** | Prefer migrating privileged ops to Tauri IPC over time |
| Backend (target) | Tauri IPC commands for DB/FS/HTTP without a long-lived TCP sidecar | Aspirational |
| DB (shipped) | **SQLite** via **better-sqlite3** + Drizzle; AES-GCM file seal when locked | Plaintext on disk while unlocked |
| DB (target) | Rusqlite / SQLCipher path | Aspirational |
| Files | OS app-data directory (desktop) or `PRM_DATA_DIR` / `./data` (dev) | |
| Search | SQLite FTS5 | |
| Jobs | In-process while app open | Reminders don’t fire when app closed — documented |
| Auth | Single Account; workspace password vault | API keys encrypted with workspace secret (keychain still a target) |
| AI | Settings → AI; BYO keys + Ollama + Cursor gateway | |
| Encryption | **Required** for real data: authenticated encryption of DB+files on lock | |
| Packaging | Unsigned CI artifacts today; code signing + notarization still needed | |

---

## Topology

```
┌──────────────────────────────────────────┐
│ Tauri (Win / Mac / Linux)  [optional]    │
│   React UI ── HTTP ── Node Hono sidecar  │
│                 │      (127.0.0.1)       │
│            SQLite (sealed on lock)       │
│            App-data files (sealed)       │
│            Workspace-secret crypto       │
└───────────┬──────────────────┬───────────┘
            ▼                  ▼
     Cloud AI (opt-in)    Ollama (opt)
```

**Dev browser mode:** Vite UI + `pnpm dev:api` (no launch token). Anyone on the same OS account who can reach loopback and guess/know the password owns the vault.

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

- **Hard-warn** if path is under Dropbox/iCloud/OneDrive/Google Drive sync folders (status + unlock UI).  
- Backup: encrypted `.sqlite.enc` snapshots under `backups/`; verify restore while unlocked.  
- Portability: versioned workspace archive with schema version + forward migrations (partial).

---

## Sidecar decision

**Default:** no Node sidecar — domain logic in TS inside webview calling Tauri commands for privileged ops, **or** core domain in Rust.  

**Current escape (shipped):** packaged Node + bundled Hono API under `src-tauri/sidecars/` (capability token + supervised lifecycle). Prefer migrating privileged ops to Tauri commands over time.

---

## AI configuration

Fully in-app **Settings → AI** (see Features §8). Keys are encrypted with the workspace secret in SQLite. Dev env overrides allowed for `pnpm dev` only. OS keychain storage remains a target, not current behavior.

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
