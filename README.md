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
