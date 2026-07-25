# Performance Review Manager

A **local desktop workbench** for **engineering managers** — evidence-backed reviews and promotion cases against your uploaded role frameworks.

ICs and peers do **not** log in for v1. They contribute via import bundles. See [docs/architecture/TRUST_MODEL.md](docs/architecture/TRUST_MODEL.md).

## What this is

Product and technical plan covering:

1. **Solo EM workbench** (Tauri app on Linux / Windows / macOS)
2. **Role frameworks** — upload R&R, tag people, current vs next progression
3. **Templates & cycles** — versioned forms; self/peer via import
4. **Continuous dossier** — goals, feedback, achievements, documents, optional Meet summaries
5. **Writing desk + promotion packets**
6. **AI co-pilot** — in-app key Settings; grounded citations; private-tier opt-in
7. **History** on the EM’s encrypted workspace

## Docs map

| Doc | Purpose |
|-----|---------|
| [docs/PRODUCT_BRIEF.md](docs/PRODUCT_BRIEF.md) | One-page brief |
| [docs/PRODUCT_VISION.md](docs/PRODUCT_VISION.md) | Principles, personas, success metrics |
| [docs/architecture/TRUST_MODEL.md](docs/architecture/TRUST_MODEL.md) | Solo workbench trust boundary |
| [docs/product/FEATURES.md](docs/product/FEATURES.md) | Feature catalog |
| [docs/product/EM_WORKFLOWS.md](docs/product/EM_WORKFLOWS.md) | EM workflows |
| [docs/product/default_eng_template_pack.json](docs/product/default_eng_template_pack.json) | Seed templates |
| [docs/data/DOMAIN_MODEL.md](docs/data/DOMAIN_MODEL.md) | Entities & invariants |
| [docs/architecture/SYSTEM.md](docs/architecture/SYSTEM.md) | System architecture |
| [docs/architecture/LOCAL_STACK.md](docs/architecture/LOCAL_STACK.md) | Local stack |
| [docs/ai/AI_INTEGRATION.md](docs/ai/AI_INTEGRATION.md) | AI design |
| [docs/ux/IA.md](docs/ux/IA.md) | UX IA |
| [docs/DELIVERY.md](docs/DELIVERY.md) | Phased delivery |

## Design stance (locked)

- **Solo EM workbench first.** Honest about what a local file can and cannot enforce.
- **Uploaded role frameworks drive evaluation.**
- **Import-path for self/peer** in v1; live multi-user is a later track.
- **Performance ≠ promotion.**
- **AI co-pilot** with in-app Settings; never auto-submit.
- **Encrypt at rest** before real employee data.
- **Stack:** Tauri 2 + React/Vite/TS + Hono or IPC + SQLite — [LOCAL_STACK.md](docs/architecture/LOCAL_STACK.md)

## Repo status

Planning docs only. Implementation follows [docs/DELIVERY.md](docs/DELIVERY.md).
