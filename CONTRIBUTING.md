# Contributing

Thanks for helping with Performance Review Manager. This repo is a pnpm monorepo for a local solo-EM workbench.

## Prerequisites

- Node.js ≥ 20
- **pnpm 10.33.3** (Corepack often resolves pnpm 11, which rejects this lockfile and skips `onlyBuiltDependencies` needed for `better-sqlite3`)

```bash
corepack prepare pnpm@10.33.3 --activate
pnpm install
pnpm rebuild better-sqlite3   # if the native module is missing
pnpm dev                      # API :8787 + UI :5173
```

Default demo unlock password after seeding: `workbench`. Do not put real employee data in a demo vault.

## Layout

| Path | Package |
|------|---------|
| `apps/api` | Hono + better-sqlite3 API |
| `apps/ui` | React + Vite UI |
| `apps/desktop` | Tauri shell (needs Rust + WebView) |
| `packages/db` | Schema / openDatabase |
| `packages/shared` | Shared DTOs |
| `packages/mcp` | Stdio MCP bulk-loader |

Product context lives under `docs/`. Cloud-agent notes: `AGENTS.md`.

## Before you open a PR

1. Keep diffs surgical — touch only what the change needs
2. Run `pnpm -r typecheck` and `pnpm test` (CI gates both on `main`)
3. For API behavior changes, add or extend tests under `apps/api/src/*.test.ts`
4. Do not commit `data/`, `.env`, secrets, or real PII
5. Align docs with shipped behavior (prefer honesty over aspirational claims)

Production `pnpm build` may still have packaging rough edges; typecheck + tests are the merge bar.

## Desktop

Desktop installers are **not** built on every merge. Use Actions → **Desktop Installers** → **Run workflow** (defaults to Windows + Linux), or Actions → **Release** to attach installers to a GitHub Release. See `apps/desktop/README.md`.

## Security

Report vulnerabilities privately per [`SECURITY.md`](./SECURITY.md) (prefer GitHub private vulnerability reporting when enabled). Do not file public issues that include exploit detail for unfixed flaws.

Maintainer checklist before making the repo public: [`docs/PUBLIC_RELEASE.md`](./docs/PUBLIC_RELEASE.md).

## Code of conduct

Participation is governed by [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).
