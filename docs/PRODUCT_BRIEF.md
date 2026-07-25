# Product Brief — Solo EM Performance Workbench

## One-liner

A local desktop workbench where an engineering manager builds evidence-backed reviews and promotion cases against uploaded role frameworks — with AI that drafts from citations, not vibes.

## Who it is for

**Primary:** a single engineering manager running reviews for their directs on Linux, Windows, or macOS.  
ICs and peers participate via **exported/imported forms**, not by logging into the app (v1).

## Core loop

```
upload role R&R → tag people → year-round dossier
  → import self/peer bundles → writing desk (+ AI)
  → next-level / promo packet → share export → history
```

## Pillars

1. **Solo EM workbench** — one machine, one trust domain; see [TRUST_MODEL.md](./architecture/TRUST_MODEL.md)
2. **Role frameworks** — upload R&R docs, structure RoleDefinitions, tag each person; current + next role text is the evaluation basis
3. **Templates as versioned contracts** — self/peer/manager/promotion forms; pinned per cycle
4. **Dossier** — goals, feedback, achievements, documents, optional meeting summaries
5. **Import-path collaboration** — self/peer via bundles; no live multi-user in v1
6. **Writing desk** — role-fit + conditional next-level gaps; ≤45 min/person target
7. **AI** — in-app Settings keys; grounded drafts; private-tier data opt-in per class
8. **History** — timelines and trends on the EM’s workspace

## Explicit non-goals (v1)

- Live IC/peer login, server-enforced peer anonymity, upward n≥3 aggregation
- Cross-manager live calibration (optional file bundles only)
- Comp matrices, stack-rank quotas, Slack DM surveillance, HRIS replacement
- Multi-tenant hosted SaaS (future track)

## Build order

Encrypted local foundations → people + role frameworks + backfill → fixed-template cycle + import bundles → writing desk → single-EM calib/consistency → AI → optional integrations.

See [DELIVERY.md](./DELIVERY.md), [LOCAL_STACK.md](./architecture/LOCAL_STACK.md), [FEATURES.md](./product/FEATURES.md).
