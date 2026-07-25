# Product Vision

## Problem

Engineering managers run performance reviews under conflicting pressures:

- Remember a year of work for 6–12 people in 2–3 weeks
- Write fair, specific, growth-oriented feedback without legal/HR landmines
- Compare people to **published role expectations** and the **next progression**
- Connect reviews to promotion discussions — without those being the same form
- Do it while still shipping product — often without waiting on IT for a new SaaS tool

Existing tools fail EMs in predictable ways:

| Tool pattern | Failure mode for EMs |
|--------------|----------------------|
| HRIS annual form | Blank boxes, no engineering context, no evidence trail |
| Docs + spreadsheets | No process, no queryable history, calibration chaos |
| Continuous feedback apps | Lots of kudos, weak cycle structure and rating rigor |
| Generic AI writers | Polished empty prose; invents achievements; hides bias |

## Product thesis

> The best tool for an EM is a **local workbench**: a living engineering dossier that becomes a **structured judgment packet** at cycle time, judged against **uploaded role & responsibilities**, with **AI that argues from evidence**.

**v1 scope lock:** solo EM workbench. Multi-party trust features (live anonymity, upward aggregation, org HR audit, adverse impact) are hosted-only later. See [TRUST_MODEL.md](./architecture/TRUST_MODEL.md).

## Personas

### Primary: Engineering Manager (EM)
Owns 4–12 direct reports. Uses the desktop app daily/weekly. Needs high-quality reviews fast, promo cases grounded in next-role expectations, and continuity across cycles.

### Secondary (import-path, not app users in v1): Individual Contributor / Peer
Completes self or peer forms via exported bundles; reads a shared packet the EM exports/sends.

### Later: Director / HRBP
Cross-manager calibration and org policy — **hosted or bundle-calib**, not assumed on one laptop.

## Jobs to be done

1. **Before the cycle:** Capture evidence continuously; backfill history on first install.
2. **At kickoff:** Open a cycle, pin role assignments, export self/peer bundles.
3. **During writing:** Draft manager reviews from evidence + imports in ≤45 minutes/person.
4. **Progression:** Compare to next RoleDefinition; open a promotion packet when warranted.
5. **At share-out:** Export a clear packet for the IC discussion.
6. **Afterward:** Query history on this workspace — trends, stagnation, prior themes.

## Principles

1. **Evidence over eloquence.** Prefer linked artifacts to adjectives.
2. **Role docs are the bar.** Uploaded R&R define current-role fit and next-progression comparison.
3. **Performance ≠ promotion.** Linked via the same framework, not one score.
4. **Honest about trust.** Do not promise anonymity or HR controls the local file cannot enforce.
5. **AI is a co-pilot.** Humans own final text and ratings; cloud egress is opt-in per data class.
6. **Manager time is scarce.** Optimize EM throughput; import paths over multi-user ceremony in v1.
7. **History compounds.** Every cycle should make the next easier — including cold-start backfill.

## What we refuse to become

- A generic survey tool with a “performance” skin
- An AI that writes entire reviews from a job title
- A forced-ranking machine
- A surveillance product that scrapes private Slack DMs
- A fake multi-user HRIS that stores “anonymous” data in a file the manager owns
- An HRIS/payroll replacement

## Success definition (solo EM, ~8 reports)

| Metric | Target | How measured (local) |
|--------|--------|----------------------|
| Median manager time per finalized review | ≤ 45 minutes | In-app writing-desk timer (on-device only) |
| % non-middle ratings with ≥1 evidence link | ≥ 80% | Local workspace stats |
| Bundle import success for self reviews | ≥ 90% of directs | Local |
| % ratings judged with assigned RoleDefinition | 100% (warn if unassigned) | Local |
| AI draft used then edited (when AI on) | 40–70% accept-with-edit | Local |
| Design-partner qualitative NPS | Track in pilot surveys | External pilot, not product telemetry |

Product-wide NPS/telemetry is **not** assumed from the local app unless a future opt-in exists.
