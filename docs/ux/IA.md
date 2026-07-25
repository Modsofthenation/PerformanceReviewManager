# UX Information Architecture

## Primary navigation (EM)

| Nav item | Purpose |
|----------|---------|
| **Home** | Cycle command center or dossier health |
| **Team** | Direct reports list → person dossier |
| **Roles** | Upload/edit career framework; assign roles to people |
| **Cycles** | Active + past cycles |
| **Promotions** | Promo packets & next-level comparisons |
| **Calibration** | Sessions for cohorts you own/participate in |
| **Templates** | Visible to HRBP/Admin primarily; managers read-only anchors |
| **Settings** | Profile, notification prefs |

IC nav is thinner: Home (tasks), My reviews, Goals, Give feedback.

---

## Key screens

### 1. Home — Command Center
- Cycle selector
- Funnel: Self done / Peers in / Drafts / Submitted / Shared
- Attention list (sorted by urgency)
- CTA: Continue writing (next incomplete packet)

### 2. Person dossier
Tabs: Overview · Role · Goals · Feedback · Achievements · Reviews · Promotions · Trends  
Overview = assigned role + next progression, latest rating, open goals, evidence freshness meter, AI pattern insight (if enabled).  
**Role** tab = full RoleDefinition, side-by-side next role, assignment history.

### 3. Writing desk
Split packet / draft (see EM_WORKFLOWS). Sticky role comparison strip (current → next). Sticky submit bar with validation (missing required, unassigned role warning, lint warnings).

### 4. Role framework admin
Upload R&R document → structure RoleDefinitions → set progression links → publish version → bulk-assign team.

### 5. Calibration room
Left: histogram + filters. Center: card grid. Right: selected person detail + decision composer. Promo mode filters to candidates sharing the same target RoleDefinition.

### 6. Template editor
Block list builder, live preview, publish version modal with diff vs previous.

### 7. Cycle wizard
4 steps: Basics → Population → Templates & policies → Timeline → Review & launch.

---

## Visual direction (product UI — not marketing)

When implementing UI later:

- Dense, calm, tool-like (Linear/Notion density), not consumer-social
- Clear hierarchy for reading long packets: typography for evidence vs draft
- Status color reserved for cycle risk (overdue), not decoration
- Avoid card soup on Writing Desk — use split panes and lists
- Motion: phase progress, packet section expand, AI suggestion insert — subtle only

---

## Empty states that teach the product

- No evidence yet → “Add 3 achievements now; future-you will thank you”
- Thin packet at write time → checklist of what’s missing before AI draft
- No active cycle → show continuous capture CTAs + last cycle summary
