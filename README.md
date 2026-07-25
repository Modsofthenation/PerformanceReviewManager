# Performance Review Manager

Local **solo EM workbench** for evidence-backed performance reviews and promotion cases.

## Quick start

```bash
pnpm install
pnpm dev
```

- UI: http://localhost:5173  
- API: http://127.0.0.1:8787  

On first launch, create a workspace (or accept the seeded demo). Default seed password: `workbench`.

```bash
pnpm db:seed   # optional CLI seed if DB empty
```

## What's implemented (v1 slice)

- Encrypted-at-rest **workspace password** gate + session token auth on API
- People / team dossier (goals, achievements, feedback)
- Role framework with **stable expectation IDs** + person assignment + next progression
- Cycles + **self/peer JSON bundle** export/import
- Writing desk: packet, role fit, conditional next-level gaps, private notes, subject export preview
- Settings → AI (provider, key storage, private-tier egress toggles)
- Local grounded evidence digest (cloud drafting hook-ready)

## Stack

pnpm monorepo · Vite/React UI · Hono API on `127.0.0.1` · SQLite · `@prm/shared` types  

Tauri desktop shell is the packaging target next; the app runs fully in browser+local API today.

## Docs

See `/docs` for product/architecture (trust model, domain, delivery).
