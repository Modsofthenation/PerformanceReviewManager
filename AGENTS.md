# AGENTS.md

## Cursor Cloud specific instructions

Performance Review Manager — a local, single-user ("solo EM") pnpm monorepo. See `README.md` and `/docs` for product context.

### Services
- `@prm/api` (`apps/api`) — Hono + better-sqlite3 backend on `http://127.0.0.1:8787`. Run with `pnpm dev:api` (uses `tsx watch`, no strict typecheck).
- `@prm/ui` (`apps/ui`) — React + Vite frontend on `http://localhost:5173`, proxies `/api` → the API. Run with `pnpm dev:ui`.
- `pnpm dev` runs both in parallel — this is the primary dev entrypoint.
- `@prm/desktop` (`apps/desktop`) — Tauri shell. `desktop:dev`/`desktop:build` need Rust + system WebView libraries and are not validated in the headless cloud VM.

### Package manager (important, non-obvious)
- This repo requires **pnpm 10.33.3**. The VM's default corepack resolves pnpm 11, which (a) rejects this committed lockfile via a `minimumReleaseAge` supply-chain policy and (b) ignores the `pnpm.onlyBuiltDependencies` field in `package.json` that is needed to build the `better-sqlite3` native module. The update script pins 10.33.3 via `corepack prepare pnpm@10.33.3 --activate`; keep using pnpm 10.x. If native `better-sqlite3` is missing, run `pnpm rebuild better-sqlite3`.

### Data / running
- Local data lives in `/workspace/data` (gitignored): SQLite DB, encrypted vault, uploaded files. Delete it to reset to a clean state (stop the API first, since it holds the DB handle).
- First app load shows "Create & seed demo team" (seeds an 8-person org). After init it shows "Unlock". Default seed password: `workbench`.
- Locking the workspace ("Lock & encrypt") seals the SQLite DB + files to `.enc` at rest; unlocking decrypts them.

### Known pre-existing issues (not environment problems)
- `pnpm build` (production) and `pnpm -r typecheck` fail on pre-existing TypeScript errors: `apps/api/src/index.ts` references `roleFrameworkVersions` without importing it (plus two type-index errors), and `apps/ui/src/pages/WritingDeskPage.tsx:281`. Dev servers (`tsx`/`vite`) run fine because they do not strict-typecheck.
- Because of the missing import above, the `GET /api/roles` endpoint and the Roles page throw at runtime. Avoid depending on those until the import is fixed. All other flows (people, dossier/achievements/goals, cycles, promotions, bundles, uploads, AI digest) work.
