# Local Cross-Platform Tech Stack

Primary deployment target: a **local application** an engineering manager (or small eng leadership group) runs on **Linux, Windows, or macOS** — not a cloud SaaS requirement for v1.

The domain model, ACL rules, packet assembly, and AI designs stay the same. What changes is **how the process is packaged, where data lives, and how identity works**.

---

## Decision

| Concern | Choice | Why |
|---------|--------|-----|
| App shell | **Tauri 2** | Native window on Win/Mac/Linux; far smaller than Electron; secure FS/dialog access |
| UI | **React + TypeScript + Vite** | Fast local SPA; Next.js SSR adds little value on localhost desktop |
| Local API | **Hono (TypeScript) on 127.0.0.1** | Same language as UI/domain; easy OpenAI/Anthropic SDKs, PDF/DOCX parsers, jobs |
| Process model | Tauri spawns/embeds the local API as a **sidecar** | UI talks to `http://127.0.0.1:<port>`; no public bind by default |
| Database | **SQLite** via **Drizzle ORM** + `libsql`/`better-sqlite3` | Zero install, single-file DB, trivial backup/restore, enough for team-scale data |
| Files / evidence | **App data directory** on disk | Documents, extracts, exports under OS-standard paths (see below) |
| Search | **SQLite FTS5** | Good enough for reviews/dossier; no OpenSearch locally |
| Jobs | In-process worker + **cron-like scheduler** in the API | Reminders, AI long runs, transcript summarize — no Redis required |
| Auth (local) | **Local profiles + OS keychain for secrets** | Single-user default; optional multi-profile PIN/password for shared laptop |
| AI | **BYO API key** (OpenAI/Anthropic) + optional **Ollama** | Cloud models when online; local models when air-gapped |
| Integrations | Opt-in OAuth in-app (Google Drive/Meet, GitHub…) | Tokens in OS keychain; never required to start reviewing |
| Packaging | Tauri bundler → `.dmg` / `.msi`/`NSIS` / `.AppImage`/`.deb` | Normal desktop installers |
| Runtime deps for users | **None** beyond the app (optional Ollama) | No Docker, no Postgres, no Node install for end users |

**Monorepo languages:** TypeScript for product logic; Rust only where Tauri requires it (thin shell + FS bridges).

---

## Why not the earlier SaaS defaults (for local v1)

| Earlier SaaS pick | Local replacement | Reason |
|-------------------|-------------------|--------|
| Next.js App Router | Vite + React | SSR/CDN irrelevant on desktop; simpler Tauri webview story |
| PostgreSQL | SQLite | No service to install/manage; portable `prm.sqlite` backup |
| S3 | Local filesystem | Evidence stays on the machine; signed URLs → local file paths / custom protocol |
| OIDC SSO | Local profiles (+ optional later SSO) | EM can start alone without IT |
| Fly/AWS + Redis queue | Sidecar process + in-app jobs | One app icon to launch |
| Multi-tenant orgs | **Single workspace** per install (import/export later) | Matches local ownership |

Domain entities, policies, and packet assembly remain portable — swapping SQLite↔Postgres later is an adapter change, not a product rewrite.

---

## Runtime topology

```
┌─────────────────────────────────────────────┐
│  Tauri shell (Win / Mac / Linux)            │
│  ┌─────────────────┐  ┌───────────────────┐ │
│  │ React UI (Vite) │──│ Local API (Hono)  │ │
│  │                 │  │ 127.0.0.1 only    │ │
│  └─────────────────┘  └─────────┬─────────┘ │
│                                 │           │
│                    ┌────────────┼─────────┐ │
│                    ▼            ▼         ▼ │
│              SQLite DB    App data FS   Keychain │
└─────────────────────────────────────────────┘
          │                         │
          ▼                         ▼
   OpenAI / Anthropic            Ollama (optional)
   Google / GitHub APIs          (local LLM)
```

**Default bind:** `127.0.0.1` only.  
**Optional “team LAN mode” (P2):** bind to LAN + token auth for other managers on the same network — still not public internet.

---

## Data locations (per OS)

| OS | App data root (typical) |
|----|-------------------------|
| macOS | `~/Library/Application Support/PerformanceReviewManager/` |
| Windows | `%APPDATA%\PerformanceReviewManager\` |
| Linux | `~/.local/share/performance-review-manager/` |

Layout:

```
.../PerformanceReviewManager/
  workspace.json          # workspace metadata
  db/
    prm.sqlite            # primary database
    prm.sqlite-wal        # WAL files
  files/
    documents/            # EvidenceDocument blobs
    frameworks/           # uploaded R&R source docs
    extracts/             # text/OCR extracts
    meeting_raw/          # short-TTL transcript blobs
    exports/              # PDF packets
  logs/
  backups/                # user-triggered + scheduled copies
```

**Backup:** one-click zip of `db/` + `files/` (exclude short-TTL raw transcripts if desired).  
**Portability:** copy that folder to another machine/OS with the same app version.

---

## Auth & multi-user on one machine

Local-first does **not** mean single human forever.

| Mode | Behavior |
|------|----------|
| **Solo EM (default)** | One local admin profile; manages directs as data records (ICs may not log in) |
| **Shared workstation** | Multiple local profiles (EM, HRBP); password/PIN; ACL still enforced |
| **IC participation (P1)** | IC profiles for self/peer review on same app or LAN mode |
| **Cloud SSO** | Deferred; keep OIDC as a future “hosted” profile |

Secrets (API keys, OAuth tokens) → **OS keychain** via Tauri plugins (`keyring`), not plaintext SQLite.

---

## AI on a local app

### Configuration (in-app — required UX)

Users set up AI **inside Settings → AI**, managed by the app:

1. Choose provider (Anthropic, OpenAI, Azure, Ollama, custom base URL)
2. Paste API key (or set Ollama base URL, default `http://127.0.0.1:11434`)
3. **Test connection** → shows model list / success/failure
4. Pick default models per capability (or accept presets)
5. Optional: enable **local-only** (Ollama only; cloud blocked)

Keys are written to the **OS keychain** via Tauri; the UI only ever shows masked values (`sk-…****`). Clearing AI config removes the keychain entry.

No requirement to set `ANTHROPIC_API_KEY` in a terminal for normal operation (devs may still use env overrides in `pnpm dev`).

| Path | When |
|------|------|
| Cloud provider + key from Settings | Default; best quality for digests/drafts/gap analysis |
| **Ollama** (or LM Studio) on localhost | Offline / sensitive packets; workspace can force “local only” |
| No AI configured | Fully usable; writing desk works; Generate shows setup CTA |

Same `AiGeneration` audit table; `model` field records `ollama:llama3.1` vs `anthropic:…`.

Context packager still ACL-scoped; private Meet summaries never leave the machine unless the chosen provider is cloud (warn in UI before first cloud call on a private packet).

---

## Document & framework handling (local)

- Uploads written under `files/documents` / `files/frameworks`
- Malware: optional ClamAV on Linux; on Win/Mac rely on OS scanning + extension allowlist + size caps for v1
- DOCX/PDF text extraction in the TS sidecar (`pdf-parse`, `mammoth`, etc.)
- Role framework structuring UI edits SQLite `role_definitions`; source file retained for audit

---

## Dev vs end-user

| Audience | How they run it |
|----------|-----------------|
| Developers | `pnpm dev` — Vite + Hono locally; Tauri `dev` optional |
| EMs / end users | Installed desktop binary; double-click; no toolchain |

CI builds three artifacts per release (macOS universal or arch-specific, Windows NSIS, Linux AppImage/deb).

---

## Alternatives considered (rejected for v1 local)

| Option | Why not primary |
|--------|-----------------|
| **Electron** | Heavier RAM/disk; fine fallback if Tauri + Node sidecar friction is high |
| **Docker Compose desktop** | Requires Docker Desktop; poor “local app” UX for many EMs |
| **Pure Python (FastAPI + PySide)** | Weaker fit for rich web packet UI we already designed |
| **Next.js + embedded Postgres** | Overkill ops for single-machine; Next SSR unused |
| **Fully Rust backend** | Slower product iteration for AI/doc parsing ecosystem |

**Escape hatch:** If a company later wants hosted multi-tenant SaaS, keep packages (`policy`, `packet`, `ai`, `db` schema) and swap adapters: SQLite→Postgres, FS→S3, local auth→OIDC, Tauri→browser.

---

## Locked defaults (local v1)

1. Tauri 2 + React/Vite/TS + Hono sidecar  
2. SQLite + Drizzle  
3. Filesystem storage in OS app-data  
4. Single workspace per install  
5. BYO AI keys + optional Ollama  
6. `127.0.0.1` only unless LAN mode enabled  
7. Same product domain as the rest of `/docs`  

See also [SYSTEM.md](./SYSTEM.md) for permissions, APIs, and packet assembly (apply with local adapters).
