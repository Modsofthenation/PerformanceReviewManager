# Product Vision

## Problem

Engineering managers run performance reviews under conflicting pressures:

- Remember a year of work for 6–12 people in 2–3 weeks
- Write fair, specific, growth-oriented feedback without legal/HR landmines
- Calibrate ratings against peers so “exceeds” means the same thing across teams
- Connect reviews to promotion, comp, and development — without those being the same form
- Do it while still shipping product

Existing tools fail EMs in predictable ways:

| Tool pattern | Failure mode for EMs |
|--------------|----------------------|
| HRIS annual form | Blank boxes, no engineering context, no evidence trail |
| Docs + spreadsheets | No process enforcement, no history query, calibration chaos |
| Continuous feedback apps | Lots of kudos, weak cycle structure and rating rigor |
| Generic AI writers | Polished empty prose; invents achievements; hides bias |

## Product thesis

> The best review tool for an EM is a **living engineering dossier** that becomes a **structured judgment packet** at cycle time, with **AI that argues from evidence** and a **calibration room** that makes fairness visible.

## Personas

### Primary: Engineering Manager (EM)
Owns 4–12 direct reports. Needs to produce high-quality reviews fast, defend ratings in calibration, and leave each person with clear next-level guidance.

### Secondary: Individual Contributor (IC)
Writes self-review, optionally requests/gives peer feedback, reads finalized review, tracks goals and growth themes.

### Secondary: Skip-level / Director
Reads team distributions, spots outliers, participates in calibration, tracks promotion pipelines.

### Tertiary: People Ops / HRBP
Configures cycles, rating scales, legal language, anonymity rules; audits completion and adverse-impact metrics; does not write engineering judgments.

### Occasional: Mentor / Peer Reviewer
Provides structured feedback within a window; never sees manager ratings unless shared.

## Jobs to be done

1. **Before the cycle:** Capture evidence continuously so December isn’t archaeology.
2. **At kickoff:** Launch a cycle with the right template, population, deadlines, and anonymity rules.
3. **During writing:** Draft manager reviews from evidence + self/peer input in under 45 minutes per person.
4. **During calibration:** Compare similarly-leveled people side-by-side with distributions and narrative consistency checks.
5. **At share-out:** Deliver a clear packet: rating, strengths, growth areas, goals for next cycle.
6. **Afterward:** Query history — “How has Maya’s ownership score trended?”, “Who’s been ‘strong’ three cycles running with no promo?”

## Principles

1. **Evidence over eloquence.** Prefer linked artifacts to adjectives.
2. **One source of truth per cycle.** Drafts live in the tool; Google Docs are an export, not the system of record.
3. **Separation of concerns.** Performance judgment ≠ compensation decision ≠ promotion packet (linked via the same role framework, not conflated into one score).
4. **Role docs are the bar.** Uploaded engineering responsibilities/expectations define current-role evaluation and next-progression comparison.
5. **Bias is a product risk.** Detect pattern skew (gendered language, recency bias, similar-to-me) and surface it before finalize.
6. **Manager time is the scarce resource.** Optimize for EM throughput and quality, not form completeness theater.
7. **History compounds.** Every cycle should make the next one easier and fairer.

## What we refuse to become

- A generic survey tool with a “performance” skin
- An AI that writes entire reviews from a job title
- A forced-ranking / stack-rank machine (support distributions; don’t require quotas by default)
- A surveillance product that scrapes private Slack DMs
- An HRIS replacement (integrate with identity/HRIS; don’t reinvent payroll)

## Success definition (for an EM team of ~8)

| Metric | Target |
|--------|--------|
| Median manager time per finalized review | ≤ 45 minutes (excluding 1:1 discussion) |
| % of ratings with ≥1 evidence link | ≥ 80% |
| Cycle completion on deadline | ≥ 95% |
| Manager NPS for cycle tooling | ≥ 40 |
| “AI draft used then heavily edited” rate | Healthy 40–70% (used, not rubber-stamped) |
| Calibration meeting prep time | Cut ≥ 50% vs spreadsheet baseline |
