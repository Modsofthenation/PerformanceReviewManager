# Engineering Manager Workflows

These are the canonical flows the product is designed around. Every screen exists to support one of these jobs.

---

## Workflow A — Continuous capture (year-round)

**Trigger:** Work happens  
**Owner:** EM + IC  
**Outcome:** Dossier stays warm

1. After a ship or incident, IC or EM adds an **Achievement** (title, date, links, competencies tagged) and optionally **uploads supporting documents** (design PDF, metrics CSV, etc.).
2. Peers send lightweight **Feedback** anytime (strength + optional growth).
3. Goals updated at monthly check-in (on track / at risk / done).
4. Optional: EM tags 1:1 themes (`career`, `scope`, `friction`) — no transcript required.
5. Optional: EM **imports a Meet/Drive transcript** (or uploads `.vtt`) → system stores a private **MeetingSummary** (themes/actions), not a raw dump on the IC packet.
6. Optional integrations append **signal summaries** weekly (e.g. “12 PRs merged, 4 reviews, owned checkout-refactor”).

**EM time budget:** ~5 minutes/week/person.

**Product surfaces:** Person dossier, quick-add FAB, document upload, transcript import, Slack `/praise @name`, goal board.

---

## Workflow B — Cycle kickoff

**Trigger:** HR/Director schedules H1 or annual review  
**Owner:** HRBP configures; EM confirms population  
**Outcome:** Live cycle with clear deadlines

1. Admin creates cycle: name, date range of performance window, phase dates, templates by level, anonymity rules.
2. Population resolved from org tree (with exclusions: brand-new hires < 90 days → “check-in” mini template).
3. EMs get **Command Center**: list of directs, phase checklist, peer nomination status.
4. ICs notified: complete self-review; nominate 3–5 peers.
5. EM approves peer list (add critical collaborators IC forgot).

**Guardrails:**
- Cannot start manager phase until self submitted *or* EM explicitly waives with reason.
- Peer minimum enforceable (e.g. ≥2) before manager finalize.

---

## Workflow C — Manager writing desk (core loop)

**Trigger:** Manager phase open  
**Owner:** EM  
**Target:** ≤45 min/person

### Screen layout (desktop)

```
┌─────────────────────────┬──────────────────────────────┐
│ Left: Packet            │ Right: Draft                 │
│ • Role: current → next  │ • Overall rating             │
│ • Self-review           │ • Role-fit vs R&R doc        │
│ • Peer themes (AI)      │ • Competency scores          │
│ • Goals status          │ • Strengths / Growth         │
│ • Evidence (windowed)   │ • Next-level gap checklist   │
│ • Last cycle snapshot   │ • Dev plan / next goals      │
│                         │ • Private notes              │
│                         │ • AI assist rail             │
└─────────────────────────┴──────────────────────────────┘
```

### Steps

1. Confirm **RoleAssignment** (current + target next). If missing, assign before scoring.
2. Open person → read **AI evidence digest** grounded in RoleDefinition (2 min).
3. Skim self-review; flag disagreements.
4. Read peer synthesis; open raw peers where conflict exists.
5. Score **role fit** and competencies against **current** RoleDefinition; attach ≥1 evidence item on non-middle scores.
6. Complete **next-level gap checklist** against target RoleDefinition (separate from performance rating).
7. Ask AI for **strengths / growth drafts** and optional **promo gap analysis**; edit heavily.
8. Set overall rating; resolve consistency warnings.
9. Mark promo readiness (Ready / Not yet / Too early) separately from performance — or open **Promotion packet** template.
10. Preview IC view → Submit to calibration (or Finalize if no calib).

**Keyboard:** `J/K` next person, `E` attach evidence, `G` generate section, `R` role comparison, `P` preview.

---

## Workflow D2 — Promotion packet

**Trigger:** Strong performer / explicit promo interest  
**Owner:** EM (+ skip-level)  
**Outcome:** Evidence-mapped case against **next RoleDefinition**

1. Select target next role (from progression graph or override).
2. System generates expectation checklist from that RoleDefinition.
3. EM links dossier evidence to each next-level expectation (`demonstrating` / `emerging` / `not_yet`).
4. AI drafts case summary **only from mapped evidence**; lists unmet expectations explicitly.
5. Submit to promo calibration / committee; decision logged on `PromotionCase`.
6. If not ready: convert gaps into next-cycle Goals automatically.

---

## Workflow D — Calibration meeting

**Trigger:** All (or enough) manager drafts submitted  
**Owner:** Director + EMs  
**Outcome:** Aligned ratings + decision log

1. Open **Calibration Room** for cohort (e.g. IC4 under Platform).
2. View distribution vs guidance bands.
3. Sort by “edge cases”: top/bottom 10%, large self↔manager deltas, promo flags, sparse evidence.
4. Side-by-side compare 2–3 people; AI offers talking points *with citations*.
5. Adjust ratings; each change requires a short reason (audit).
6. Lock cohort → move to finalizing.

**Meeting length target:** 60–90 min for ~20 people (down from half-day spreadsheet wars).

---

## Workflow E — Share & discuss

1. EM schedules review 1:1 (optional calendar assist).
2. Packet shared with IC (email/Slack + in-app).
3. IC reads; optional acknowledgment + comment.
4. EM and IC agree next-cycle goals (created as Goal entities).
5. Cycle closes for that person; dossier continues.

**Visibility after share:**
- IC sees: shared sections only
- EM sees: everything including private notes
- Skip-level: summaries + ratings by default; full text on expand if policy allows

---

## Workflow F — History & coaching between cycles

1. EM opens Person Timeline before a tough 1:1.
2. Views competency trends + recurring peer themes.
3. AI suggests coaching angles from multi-cycle patterns (“collaboration praise is strong; ownership scores flat — consider scoped ownership goals”).
4. Sets development goals mid-cycle without waiting for review season.

---

## Workflow G — Exception handling

| Situation | Product behavior |
|-----------|------------------|
| New hire (<90 days) | Lightweight check-in template; no overall rating or “N/A — onboarding” |
| Manager change mid-cycle | Prior manager retains read on their draft contributions; new manager owns finalize; HR mediates unlock |
| Someone on leave | Extend deadlines per person; exclude from distribution until complete |
| PIP / sensitive case | Restrict AI features; HRBP must be on packet; extra audit |
| Disputed review | Acknowledgment with dissent comment; HRBP review queue; no silent edits post-share without version note |

---

## EM Command Center (home)

Always-on home for the manager during a cycle:

- **My team completion** funnel
- **Attention needed:** missing peers, overdue self, draft stuck, calib conflicts
- **Writing queue** sorted by least-complete packet
- **Calendar of phase deadlines**
- **AI weekly brief** (optional): “3 people have thin evidence this window”

Outside of cycles, home becomes: team dossier health, upcoming goal check-ins, stagnating trends.
