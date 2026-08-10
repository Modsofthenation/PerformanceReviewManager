# Public release checklist

Use this when flipping the GitHub repo from private to public. It is a maintainer runbook, not a claim that signed desktop installers are production-ready.

## Before visibility flip

1. **Enable private vulnerability reporting**  
   GitHub → Settings → Code security → **Private vulnerability reporting** → Enable.  
   Confirm `SECURITY.md` still lists Security Advisories as the preferred channel.

2. **Confirm demo-password hygiene**  
   Empty workspaces must never invent `workbench`. MCP / AGENTS docs must require an explicit `PRM_PASSWORD` (no silent MCP default).

3. **Confirm desktop capability source of truth**  
   `apps/desktop/src-tauri/capabilities/default.json` must not grant `shell:allow-open`. Regenerated `gen/schemas/capabilities.json` should match.

4. **Cut or soft-land Releases**  
   - Preferred: Actions → **Release** → **Run workflow** with a prerelease version (e.g. `0.1.0-alpha.1`) so Settings → Check for updates has a real latest tag.  
   - Or leave releases empty: the UI already explains that no public release exists yet and points at **Desktop Installers** / **Release** workflows.

5. **Scan for secrets**  
   No committed `.env`, vault `data/`, real employee PII, or live API tokens.

## After visibility flip

1. Create / verify the first GitHub Release (prerelease is fine) via the **Release** workflow.
2. Update `CHANGELOG.md` for that tag.
3. Optionally enable Dependabot alerts + Dependabot security updates in GitHub Settings (config lives in `.github/dependabot.yml`).
4. Do **not** market the app as signed / notarized or auto-updating until Tauri updater keys and code signing land.

## Explicit non-claims at public launch

- Unsigned desktop artifacts (Actions / Releases) — verify checksums yourself
- No OS keychain for AI/integration keys yet
- Local HMAC activity log ≠ external legal custody
- Demo password `workbench` is exploration-only
