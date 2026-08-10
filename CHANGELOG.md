# Changelog

All notable changes to Performance Review Manager are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [SemVer](https://semver.org/) (`0.1.0-alpha.x` while the public API and packaging are still settling).

## [Unreleased]

### Added

- Dedicated **Desktop Installers** and **Release** GitHub Actions workflows
- Public-release checklist (`docs/PUBLIC_RELEASE.md`) and clearer vulnerability reporting guidance
- Default **PE Engineering Career Framework** (Graduate → CTO) seeded on empty and demo workspaces

### Changed

- Settings → Check for updates explains missing GitHub Releases (404) instead of a generic failure
- MCP / AGENTS docs no longer imply a silent `PRM_PASSWORD=workbench` default

### Fixed

- Committed Tauri `gen/schemas/capabilities.json` aligned with source capabilities (no `shell:allow-open`)
- Windows packaging uses NSIS only — WiX `.msi` rejects semver pre-releases like `0.1.0-alpha.1`
- Desktop AI: stop implying Cursor `crsr_` keys are a chat API; clearer network errors; Test saves then probes with visible status
- Empty-workspace onboarding: optional EM name at create, single setup checklist, less Home clutter
- Settings / long-page scroll jank: section nav no longer forces layout on scroll; drop sticky chrome backdrop blur

## [0.1.0-alpha.1] - TBD

First tagged alpha intended for GitHub Releases via Actions → **Release**.

### Notes

- Unsigned desktop installers only
- Demo vault password `workbench` is exploration-only
- Merge gate remains `pnpm -r typecheck` + `pnpm test`
