# Changelog

All notable changes to Performance Review Manager are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [SemVer](https://semver.org/) (`0.1.0-alpha.x` while the public API and packaging are still settling).

## [Unreleased]

### Added

- Dedicated **Desktop Installers** and **Release** GitHub Actions workflows
- Public-release checklist (`docs/PUBLIC_RELEASE.md`) and clearer vulnerability reporting guidance
- Default **PE Engineering Career Framework** (Graduate → CTO) seeded on empty and demo workspaces
- **Cursor Cloud Agents** AI provider — use dashboard `crsr_…` keys via the Cloud Agents API (no-repo agents for digests/drafts)
- Guided **/setup** onboarding: team → assign-first roles → optional AI → integrations with credential guides → evidence backfill with progress
- **1:1 sessions** on the person dossier — manual Q&A agenda plus optional AI-suggested questions grounded in evidence
- Home **suggested next actions** queue: prioritized primary NextStep plus “Up next” list that refreshes when you return to the tab
- Team / person **work-completed graphs**: delivery-by-person bars + delivery-vs-rating on Team performance; window mix + cycle series + rating trend on dossiers; Sprint pulse throughput chart

### Changed

- Settings → Check for updates explains missing GitHub Releases (404) instead of a generic failure
- MCP / AGENTS docs no longer imply a silent `PRM_PASSWORD=workbench` default
- Settings → AI: OpenAI-compatible gateways are a separate provider from Cursor Cloud Agents
- Empty workspaces land in setup until finished or skipped; demo seed marks onboarding complete
- **Cursor Cloud Agents** chat: stream status and assistant text live via SSE; empty-result errors include agent/run ids and a dashboard link
- Primary CTA hierarchy: NextStep owns the solid primary action; PageHeader/Section duplicates and table-row moves use secondary/ghost so pages like Cycles no longer show the same green button 3–4 times
- Form dropdowns use themed **react-select** (`AppSelect`) with a properly padded chevron; native `<select>` keeps a CSS fallback chevron that no longer hugs the right edge

### Fixed

- Committed Tauri `gen/schemas/capabilities.json` aligned with source capabilities (no `shell:allow-open`)
- Windows packaging uses NSIS only — WiX `.msi` rejects semver pre-releases like `0.1.0-alpha.1`
- Desktop AI: clearer network errors; Test saves then probes with visible status
- Empty-workspace onboarding: optional EM name at create, single setup checklist, less Home clutter
- Settings / long-page scroll jank: section nav no longer forces layout on scroll; drop sticky chrome backdrop blur
- Cursor Cloud Agents: recover reply text from streamed assistant deltas when the terminal `result` field is empty

## [0.1.0-alpha.1] - TBD

First tagged alpha intended for GitHub Releases via Actions → **Release**.

### Notes

- Unsigned desktop installers only
- Demo vault password `workbench` is exploration-only
- Merge gate remains `pnpm -r typecheck` + `pnpm test`
