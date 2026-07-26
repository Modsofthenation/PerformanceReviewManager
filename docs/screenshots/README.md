# Screenshot gallery

PNG captures used in the root [README](../../README.md).

Regenerate (API + UI must be running; unlock password defaults to `workbench`):

```bash
pnpm screenshots
# or: UI_URL=http://localhost:5173 PRM_PASSWORD=workbench pnpm screenshots
```

The script **erases and re-seeds** the local demo workspace so shots stay consistent. Requires system Chrome (`google-chrome-stable`) and root `puppeteer-core`.

Numbering matches the README Screens section (`01` unlock through `14` settings), plus director close-ups and sprint pulse:

| File | Surface |
| --- | --- |
| `01-unlock.png` | Create workbench — empty vs demo |
| `02-home.png` | Command center |
| `03-team.png` | Team roster |
| `04-person.png` | Person dossier |
| `05-roles.png` | Roles |
| `06-cycles.png` | Cycles |
| `07-writing-desk.png` | Writing desk |
| `08-promotions.png` | Promotions list |
| `09-promotion-detail.png` | Promotion packet |
| `10-consistency.png` | Consistency |
| `11-team-performance.png` | Team performance |
| `12-backfill.png` | Backfill |
| `13-chat.png` | AI Chat |
| `14-settings.png` | Settings (section nav + appearance) |
| `15-director-attention.png` | Home — Needs director attention |
| `16-writing-desk-director.png` | Writing desk — Skip-level / Director card |
| `17-consistency-director-packs.png` | Consistency — calib / briefing / bundle |
| `18-team-director-briefing.png` | Team performance — Director briefing |
| `19-promo-committee.png` | Promotion — Promo committee export |
| `20-sprint-pulse.png` | Sprint pulse |

`01-unlock` is the empty-vs-demo create screen. `14-settings` includes the sticky **On this page** nav (Appearance → Danger zone).
