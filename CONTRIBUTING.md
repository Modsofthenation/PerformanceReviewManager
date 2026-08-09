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
2. Run `pnpm test` (API unit tests; this is what CI gates on `main`)
3. For API behavior changes, add or extend tests under `apps/api/src/*.test.ts`
4. Do not commit `data/`, `.env`, secrets, or real PII
5. Align docs with shipped behavior (prefer honesty over aspirational claims)

`pnpm -r typecheck` / production `pnpm build` may still fail on residual strictness issues; prefer fixing types you touch rather than widening `any`.

## Desktop

Desktop installers are **not** built on every merge. Use Actions → **CI** → **Run workflow**. See `apps/desktop/README.md`.

## Security

Report vulnerabilities privately per [`SECURITY.md`](./SECURITY.md). Do not file public issues that include exploit detail for unfixed flaws.

## Code of conduct

Participation is governed by [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).
