# Performance Review Manager

Local **solo EM workbench** for evidence-backed performance reviews and promotion cases.

ICs never log in. Self and peer input arrives as JSON import bundles. Your vault stays on disk: **Lock & encrypt** seals SQLite and dossier files at rest.

<p align="center">
  <img src="./docs/screenshots/themes/dark-coral-home.png" alt="Command center in dark Coral" width="900" />
</p>

<p align="center"><em>Dark · Coral — one of sixteen appearance combinations</em></p>

## Why this exists

Most review tools are either a shared HR portal (everyone logs in) or a blank Google Doc. This app is for one engineering manager who wants:

1. **A year-round dossier** so writing season is not a scavenger hunt
2. **Role frameworks as the bar** so ratings map to expectations, not vibes
3. **Evidence-linked drafts** so extreme scores and promo claims stay grounded
4. **Local custody** so private notes and underperformance plans stay on your machine until you export

The product is intentionally single-user. Peers and ICs participate by filling exported forms that you import back. That keeps anonymity and trust simple for v1.

## Core loop

```
upload role R&R → assign people → capture dossier evidence
  → open a cycle → import self/peer bundles → writing desk (+ AI)
  → consistency + team performance check → share export → history / promo packets
```

| Stage | Intent |
|-------|--------|
| Roles + people | Define what "good" means before you score anyone |
| Dossier | Accumulate achievements, goals, feedback, docs, and concerns all year |
| Cycle + bundles | Time-box the review without building a multi-user portal |
| Writing desk | Draft, cite, lint, finalize, then share a subject packet |
| Consistency / team performance | Catch clustering, thin evidence, and odd rating shapes before you ship |
| Promotions | Reuse the same role bar for next-level / promo cases |

## Quick start

```bash
pnpm install
pnpm rebuild better-sqlite3   # if native module missing
pnpm dev
```

| | |
|---|---|
| UI | http://localhost:5173 |
| API | http://127.0.0.1:8787 |
| Seed password (demo only) | `workbench` |

First load: choose **Empty workspace** or **Demo team** (8-person org). Demo mode pre-fills password `workbench` for exploration only — **never** put real employee data behind it. Empty workspaces require an explicit password (8+ characters); the API never invents a default. Between sessions use **Lock & encrypt**. To wipe and start over, use **Delete workspace** in Settings (or **Erase workspace** on the unlock screen) — password + type `DELETE`.

Requires **pnpm 10.33.3** (see [`AGENTS.md`](./AGENTS.md) if Corepack hands you pnpm 11).

### Desktop (Tauri)

```bash
pnpm desktop:dev      # native window (needs WebView + Rust)
pnpm desktop:build
```

Desktop installers:

- **Artifacts only:** Actions → **Desktop Installers** → **Run workflow** (defaults to Windows + Linux; uploads `desktop-windows-x86_64` / `desktop-linux-x86_64`, optional macOS)
- **GitHub Release:** Actions → **Release** → **Run workflow** with version `0.1.0-alpha.1` (or push tag `v0.1.0-alpha.1`)

Merges to `main` only run unit tests + typecheck. Details: [`apps/desktop/README.md`](./apps/desktop/README.md).

### Cursor MCP (bulk load)

```bash
pnpm mcp
```

Setup: [`packages/mcp/README.md`](./packages/mcp/README.md) · [`.cursor/mcp.json.example`](./.cursor/mcp.json.example).

---

## Appearance

Settings → Appearance picks **dark / light / system** plus one of **eight accents**. That is sixteen looks on the same product surface.

| Accents | |
|---------|---|
| Classic | Teal · Ocean · Forest · Slate |
| Vibrant | Coral · Amber · Magenta · Citrus |

### Dark accents

| Teal | Ocean | Forest | Slate |
|:---:|:---:|:---:|:---:|
| ![dark teal](./docs/screenshots/themes/dark-teal-home.png) | ![dark ocean](./docs/screenshots/themes/dark-ocean-home.png) | ![dark forest](./docs/screenshots/themes/dark-forest-home.png) | ![dark slate](./docs/screenshots/themes/dark-slate-home.png) |
| **Coral** | **Amber** | **Magenta** | **Citrus** |
| ![dark coral](./docs/screenshots/themes/dark-coral-home.png) | ![dark amber](./docs/screenshots/themes/dark-amber-home.png) | ![dark magenta](./docs/screenshots/themes/dark-magenta-home.png) | ![dark citrus](./docs/screenshots/themes/dark-citrus-home.png) |

### Light accents

| Teal | Ocean | Forest | Slate |
|:---:|:---:|:---:|:---:|
| ![light teal](./docs/screenshots/themes/light-teal-home.png) | ![light ocean](./docs/screenshots/themes/light-ocean-home.png) | ![light forest](./docs/screenshots/themes/light-forest-home.png) | ![light slate](./docs/screenshots/themes/light-slate-home.png) |
| **Coral** | **Amber** | **Magenta** | **Citrus** |
| ![light coral](./docs/screenshots/themes/light-coral-home.png) | ![light amber](./docs/screenshots/themes/light-amber-home.png) | ![light magenta](./docs/screenshots/themes/light-magenta-home.png) | ![light citrus](./docs/screenshots/themes/light-citrus-home.png) |

Every main page was also captured in every accent × mode. Browse the matrix under [`docs/screenshots/themes/`](./docs/screenshots/themes/) or the index in [`docs/screenshots/THEMES.md`](./docs/screenshots/THEMES.md).

---

## Screens

Regenerate with `pnpm screenshots` (UI + API running; demo password `workbench`). The tour below rotates accents so you see the product across the palette.

### Unlock

**Intent:** Keep the workspace sealed when you walk away.

**How it works:** On first run you create a workspace password and choose an empty vault or a seeded demo org. Later sessions decrypt with that password. **Lock & encrypt** re-seals SQLite and files. Wipe with **Erase workspace** / **Delete workspace** (password + type `DELETE`).

![Unlock / create workbench](./docs/screenshots/01-unlock.png)

### Home (command center) — dark Teal

**Intent:** Answer "who is blocked, and what should I do next?"

**How it works:** Pick a cycle for pipeline status, deadline nudges, writing-time / evidence dashboard, and **Needs director attention** (flags only — no private note bodies). Sticky **On this page** jumps between cycle, attention, dashboard, and queue.

![Command center](./docs/screenshots/02-home.png)

![Needs director attention](./docs/screenshots/15-director-attention.png)

### Team — dark Coral

**Intent:** Maintain the roster of directs you manage reviews for.

**How it works:** List, add, or CSV-import people (EM required first), then open a dossier. Role assignment and cycle participation hang off these records.

![Team](./docs/screenshots/03-team.png)

### Person dossier — dark Magenta

**Intent:** Build a citation pool all year so writing season is not empty.

**How it works:** Achievements, goals, feedback (optional 1:1 themes), documents, concerns, integrations, and a **Timeline**. Visibility keeps EM-only material out of subject exports.

![Person dossier](./docs/screenshots/04-person.png)

### Roles — light Ocean

**Intent:** Make the evaluation bar explicit.

**How it works:** Author or import RoleDefinitions, assign current / next roles, extract from R&R docs. Writing desks and promo packets read from these definitions.

![Roles](./docs/screenshots/05-roles.png)

### Cycles — dark Citrus

**Intent:** Time-box a review season without live IC login.

**How it works:** Create a cycle, export self/peer JSON bundles, import responses, waive with a reason when needed.

![Cycles](./docs/screenshots/06-cycles.png)

### Writing desk — dark Coral

**Intent:** Evidence-backed manager review in a bounded time (target ≤45 min/person).

**How it works:** Score against the assigned role, link evidence, draft (optionally with AI), lint, finalize (freezes cites), then share HTML with private / EM-only stripped. Skip-level talking points and a per-person director card for upward share.

![Writing desk](./docs/screenshots/07-writing-desk.png)

![Skip-level talking points and Director card](./docs/screenshots/16-writing-desk-director.png)

### Promotions — light Magenta / dark Ocean

**Intent:** Reuse the same role bar for next-level cases.

**How it works:** Mark gaps vs demonstrating, draft the case, then **Promo committee export** for a printable packet with allowlisted cites.

![Promotions](./docs/screenshots/08-promotions.png)

![Promotion packet](./docs/screenshots/09-promotion-detail.png)

![Promo committee export](./docs/screenshots/19-promo-committee.png)

### Consistency — dark Forest

**Intent:** Catch unfair shape in your own drafts before anyone else sees them.

**How it works:** Rating distribution, per-person cards, flags (thin evidence, extreme overall, unassigned role). **Calibration bundles** for director handoff and encrypted read-only `.prm.enc` packs.

![Consistency](./docs/screenshots/10-consistency.png)

![Calibration bundles / director packs](./docs/screenshots/17-consistency-director-packs.png)

### Team performance — light Coral / Amber

**Intent:** See rating and coaching shape as graphs.

**How it works:** Distribution, evidence scatter, competency averages, promo readiness, writing-time buckets, themes, cross-cycle trends, and a printable director briefing.

![Team performance](./docs/screenshots/11-team-performance.png)

![Director briefing from team performance](./docs/screenshots/18-team-director-briefing.png)

### Sprint pulse — dark Magenta

**Intent:** Coaching view for a date window, not final ratings.

**How it works:** Last 7 / 14 / 30 days or custom range — throughput, themes, concerns, evidence freshness.

![Sprint pulse](./docs/screenshots/20-sprint-pulse.png)

### Backfill — light Citrus

**Intent:** Unblock writing when dossiers are still thin after first adopt.

**How it works:** Wizard for starter evidence, or MCP / integrations for bulk load.

![Backfill](./docs/screenshots/12-backfill.png)

### AI Chat — dark Ocean

**Intent:** Grounded questions over the workspace or a dossier without inventing evidence.

**How it works:** Scoped chat with allowlisted cites; respects private-tier egress settings.

![AI Chat](./docs/screenshots/13-chat.png)

### Settings — dark Coral

**Intent:** Providers, privacy gates, appearance, and vault maintenance.

**How it works:** AI providers, egress toggles, Jira / Bitbucket / GitHub / Linear, backup / restore, activity verify, and the eight-accent appearance picker. **Danger zone** erases the vault.

![Settings](./docs/screenshots/14-settings.png)

---

## What’s in this slice

- **Encrypted vault** (AES-256-GCM) for DB and dossier files on lock
- **People / roles / cycles** with self and peer JSON bundles
- **Writing desk**: competencies, evidence links, citation freeze, HTML subject packets
- **Consistency** and **team performance** views before you share
- **Director / upward packs**: briefing HTML, calib room pack, promo committee export, skip-level talking points
- **Sprint pulse** for date-window coaching
- **Eight accents × dark/light** appearance system (Coral, Amber, Magenta, Citrus plus Teal, Ocean, Forest, Slate)
- **AI**: digests, section draft, peer synthesize, chat, with citation allowlist
- **Desktop** packaging (Tauri); installers via Actions → **Desktop Installers** or tagged **Release**- **Delete / recreate workspace** from Unlock or Settings

## Docs

Product and architecture live under [`/docs`](./docs). Start with [`docs/PRODUCT_BRIEF.md`](./docs/PRODUCT_BRIEF.md). Core loop evaluation: [`docs/CORE_LOOP_EVAL.md`](./docs/CORE_LOOP_EVAL.md). Theme matrix: [`docs/screenshots/THEMES.md`](./docs/screenshots/THEMES.md). Public flip checklist: [`docs/PUBLIC_RELEASE.md`](./docs/PUBLIC_RELEASE.md). Cursor cloud notes: [`AGENTS.md`](./AGENTS.md).

## License & community

- License: [`LICENSE`](./LICENSE) (MIT)
- Third-party notices (bundled Node sidecar): [`THIRD_PARTY.md`](./THIRD_PARTY.md)
- Changelog: [`CHANGELOG.md`](./CHANGELOG.md)
- Security reports: [`SECURITY.md`](./SECURITY.md)
- Contributing: [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- Code of conduct: [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)
- Code of conduct: [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)
