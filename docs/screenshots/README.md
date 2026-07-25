# Screenshot gallery

PNG captures used in the root [README](../../README.md).

Regenerate (API + UI must be running; unlock password defaults to `workbench`):

```bash
pnpm screenshots
# or: UI_URL=http://localhost:5173 PRM_PASSWORD=workbench pnpm screenshots
```

Requires system Chrome (`google-chrome-stable`) and root `puppeteer-core`.

Numbering matches the README Screens section (`01` unlock through `14` settings), including `11-team-performance`.
