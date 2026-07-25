# Performance Review Manager

Local **solo EM workbench** for evidence-backed performance reviews and promotion cases.

## Quick start (browser + local API)

```bash
pnpm install
pnpm rebuild better-sqlite3   # if native module missing
pnpm dev
```

- UI: http://localhost:5173  
- API: http://127.0.0.1:8787  
- Default seed password: `workbench`  
- **Lock & encrypt** seals SQLite + files at rest (`prm.sqlite.enc`)

## Desktop (Tauri)

```bash
pnpm desktop:dev      # opens native window (needs WebView + Rust)
pnpm desktop:build    # platform installers
```

See `apps/desktop/README.md`.

## Cursor MCP (bulk load / automation)

Local MCP server `@prm/mcp` can unlock the vault and write people evidence (notes, achievements, documents, roles, cycles) — useful when another LLM/MCP pulls from Jira/Google and you want to load results into PRM.

```bash
pnpm --filter @prm/mcp start
```

Setup: [`packages/mcp/README.md`](./packages/mcp/README.md) and [`.cursor/mcp.json.example`](./.cursor/mcp.json.example).

## Features in this slice

- Encrypted vault (AES-256-GCM) for DB + dossier files on lock  
- People / roles / cycles / writing desk  
- Document uploads on person dossier  
- Self/peer JSON bundles  
- Promotion packets UI  
- Settings → AI with cloud drafting (Anthropic / OpenAI / Ollama) + local digest fallback  

## Docs

Product/architecture under `/docs` (trust model, delivery, local stack).
Core loop evaluation & capture gaps: [`docs/CORE_LOOP_EVAL.md`](./docs/CORE_LOOP_EVAL.md).
