# AGENTS.md

## Cursor Cloud specific instructions

Performance Review Manager — a local, single-user ("solo EM") pnpm monorepo. See `README.md` and `/docs` for product context.

### Services
- `@prm/api` (`apps/api`) — Hono + better-sqlite3 backend on `http://127.0.0.1:8787`. Run with `pnpm dev:api` (uses `tsx watch`, no strict typecheck).
- `@prm/ui` (`apps/ui`) — React + Vite frontend on `http://localhost:5173`, proxies `/api` → the API. Run with `pnpm dev:ui`.
- `pnpm dev` runs both in parallel — this is the primary dev entrypoint.
- `@prm/desktop` (`apps/desktop`) — Tauri shell. `desktop:dev`/`desktop:build` need Rust + system WebView libraries and are not validated in the headless cloud VM. Packaged desktop installers run only via Actions → **Desktop Installers** → **Run workflow** (not on every merge; defaults to Windows + Linux).

### Package manager (important, non-obvious)
- This repo requires **pnpm 10.33.3**. The VM's default corepack resolves pnpm 11, which (a) rejects this committed lockfile via a `minimumReleaseAge` supply-chain policy and (b) ignores the `pnpm.onlyBuiltDependencies` field in `package.json` that is needed to build the `better-sqlite3` native module. The update script pins 10.33.3 via `corepack prepare pnpm@10.33.3 --activate`; keep using pnpm 10.x. If native `better-sqlite3` is missing, run `pnpm rebuild better-sqlite3`.

### Data / running
- Local data lives in `/workspace/data` (gitignored): SQLite DB, encrypted vault, uploaded files. Delete it to reset to a clean state (stop the API first, since it holds the DB handle), or use **Delete workspace** in Settings / **Erase workspace** on Unlock (password + type `DELETE`).
- First app load offers **Empty workspace** or **Demo team** (seeds an 8-person org). After init it shows "Unlock". Default demo password: `workbench`.
- Locking the workspace ("Lock & encrypt") seals the SQLite DB + files to `.enc` at rest; unlocking decrypts them.
- After erase, the create flow returns so you can start a new empty or demo workspace.
- `.session` stores the auth token only (not the AES key). After an API process restart you must unlock again even if the UI still has a token.

### Known pre-existing issues (not environment problems)
- `pnpm build` (production) may still fail on residual packaging issues; prefer `pnpm -r typecheck` + `pnpm test` as the merge gate. Dev servers (`tsx`/`vite`) run fine because they do not strict-typecheck.
- Core loop evaluation & capture gaps: `docs/CORE_LOOP_EVAL.md`.

### Cursor MCP (`@prm/mcp`)
- Stdio MCP for bulk-loading dossier evidence into the local API: `pnpm mcp` (or `pnpm --filter @prm/mcp start`).
- Requires API on `127.0.0.1:8787`; unlocks with `PRM_PASSWORD` (default `workbench`).
- Setup example: `.cursor/mcp.json.example` and `packages/mcp/README.md`.
- Typical flow with other MCPs (Jira/Google): fetch externally → `prm_bulk_load_evidence` / `prm_upload_document` here.
