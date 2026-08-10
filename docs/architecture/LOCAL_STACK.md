# Local Cross-Platform Tech Stack

**v1 product:** solo EM workbench — [TRUST_MODEL.md](./TRUST_MODEL.md).

Primary target: installable app on **Linux, Windows, macOS**. No Docker/Postgres for end users.

---

## Locked stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Shell | **Tauri 2** | dmg / NSIS / AppImage|deb (manual **Desktop Installers** `workflow_dispatch`; no WiX MSI while versions use `alpha` pre-release) |
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
| Packaging | Unsigned Actions / Release artifacts today; code signing + notarization still needed | Prefer **Release** workflow for tagged alphas |

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

**Shipped today**

1. Encryption at rest before real employee data (AES-GCM seal on lock)
2. No unauthenticated localhost API (session token; desktop adds launch token)
3. Sync-folder detection (warn when data dir looks like Dropbox/iCloud/OneDrive/Google Drive)
4. Hash-chained activity log (evident, not proof; EM-keyed HMAC export)
5. Parser allowlists; no fake “malware scanned” status without a scanner

**Still targets (not current claims)**

6. OS keychain + Linux secret-service fallback for API keys
7. Signed / notarized updates (desktop artifacts are manual **Desktop Installers** / **Release** builds)

---

## Hosted later

Separate architecture track (identity, sync, RLS, central audit). Not an “adapter flip.” Schema packages stay portable where practical; do not claim zero-cost SaaS migration.
