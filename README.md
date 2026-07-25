# Performance Review Manager

A performance review system built for **engineering managers** — not HR generalists first.

Most review tools optimize for compliance forms and annual packets. This one optimizes for what EMs actually need: **evidence-backed judgments**, **fair calibration across a team**, **continuity across cycles**, and **AI that drafts from real work signals** instead of inventing praise.

## What this is

Product and technical plan for a review platform that covers:

1. **Templates & frameworks** — competency models, **uploaded role R&R docs**, rating scales, role expectations
2. **Review cycles** — self → peers → manager → calibration → finalize → share
3. **Promotion & progression** — next-role comparison, promotion packet templates, gap analysis
4. **Continuous evidence** — goals, feedback, achievements, 1:1 themes, delivery signals
5. **History & trends** — person-level timelines, team distribution, promotion readiness
6. **AI assistance** — evidence synthesis, draft writing, role-gap analysis, bias/consistency checks
7. **Manager operating system** — cycle command center, calibration room, writing desk

## Docs map

| Doc | Purpose |
|-----|---------|
| [docs/PRODUCT_VISION.md](docs/PRODUCT_VISION.md) | Principles, personas, jobs-to-be-done, what we refuse to become |
| [docs/product/FEATURES.md](docs/product/FEATURES.md) | Feature catalog by surface (templates → cycles → history → AI) |
| [docs/product/EM_WORKFLOWS.md](docs/product/EM_WORKFLOWS.md) | End-to-end manager workflows and UX |
| [docs/data/DOMAIN_MODEL.md](docs/data/DOMAIN_MODEL.md) | Canonical entities, relationships, retention |
| [docs/architecture/SYSTEM.md](docs/architecture/SYSTEM.md) | Stack, services, permissions, integrations |
| [docs/ai/AI_INTEGRATION.md](docs/ai/AI_INTEGRATION.md) | AI capabilities, prompts boundaries, safety |
| [docs/DELIVERY.md](docs/DELIVERY.md) | Phased build order and success metrics |

## Design stance (decisions already made)

- **Manager-first, IC-second, HR-third.** ICs write self-reviews and give peer input; HR configures policy and audits fairness. The primary daily user is the EM.
- **Uploaded role frameworks drive evaluation.** People are tagged to RoleDefinitions from your R&R docs; current-role fit and next-progression comparison use that text as source of truth.
- **Continuous evidence beats annual memory.** Reviews assemble from a living dossier, not a blank form in December.
- **Templates are versioned contracts.** Changing a competency mid-cycle never mutates in-flight reviews.
- **Ratings without evidence are incomplete.** Every score can attach artifacts (goals, feedback, PRs, uploaded documents, meeting summaries).
- **Performance ≠ promotion.** Reviews judge current role; promotion packets judge next-role readiness — linked via the same framework.
- **AI is a co-pilot, never a signer.** Humans own final text and ratings; AI drafts, synthesizes, and challenges.
- **Calibration is a first-class product**, not a spreadsheet export afterthought.
- **Privacy is role-scoped.** Peer feedback can be anonymized; manager notes, private documents, and Meet summaries stay private by default; finalized reviews have controlled visibility.

## Repo status

This repository currently contains the **product and architecture plan**. Implementation follows [docs/DELIVERY.md](docs/DELIVERY.md).
