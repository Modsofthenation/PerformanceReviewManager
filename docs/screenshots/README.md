# Screenshot gallery

PNG captures used in the root [README](../../README.md) and the [theme matrix](./THEMES.md).

Regenerate (API + UI must be running; demo unlock password `workbench`):

```bash
pnpm screenshots
# or: UI_URL=http://localhost:5173 PRM_PASSWORD=workbench pnpm screenshots
```

The script **erases and re-seeds** the local demo workspace, then captures:

1. **Theme matrix** — every accent × dark/light × main page under `themes/{mode}-{accent}/`
2. **README tour** — numbered shots at this folder root (accents rotate through the tour)
3. **Home strip** — `themes/{mode}-{accent}-home.png` for the Appearance section

Requires system Chrome (`google-chrome-stable`) and root `puppeteer-core`.

## README tour files

| File | Surface | Theme in tour |
| --- | --- | --- |
| `01-unlock.png` | Create workbench | dark Coral |
| `02-home.png` | Command center | dark Teal |
| `03-team.png` | Team roster | dark Coral |
| `04-person.png` | Person dossier | dark Magenta |
| `05-roles.png` | Roles | light Ocean |
| `06-cycles.png` | Cycles | dark Citrus |
| `07-writing-desk.png` | Writing desk | dark Coral |
| `08-promotions.png` | Promotions list | light Magenta |
| `09-promotion-detail.png` | Promotion packet | dark Ocean |
| `10-consistency.png` | Consistency | dark Forest |
| `11-team-performance.png` | Team performance | light Coral |
| `12-backfill.png` | Backfill | light Citrus |
| `13-chat.png` | AI Chat | dark Ocean |
| `14-settings.png` | Settings (8 accents) | dark Coral |
| `15-director-attention.png` | Home — director attention | dark Amber |
| `16-writing-desk-director.png` | Writing desk — skip-level | dark Amber |
| `17-consistency-director-packs.png` | Consistency — calib packs | dark Forest |
| `18-team-director-briefing.png` | Team performance — briefing | light Amber |
| `19-promo-committee.png` | Promo committee export | dark Ocean |
| `20-sprint-pulse.png` | Sprint pulse | dark Magenta |

Accents available in Settings: Teal, Ocean, Forest, Slate, **Coral**, **Amber**, **Magenta**, **Citrus**.
