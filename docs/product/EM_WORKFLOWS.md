# Engineering Manager Workflows (Solo Workbench)

All flows assume **one EM** on a local encrypted workspace. ICs/peers use **bundles**, not logins.  
See [TRUST_MODEL.md](../architecture/TRUST_MODEL.md).

---

## Workflow A — Continuous capture

1. Add achievements / goals / feedback on each Person.  
2. Upload supporting documents (set `occurred_at` when it’s evidence).  
3. Optional: run an interactive **1:1 session** on the Person dossier (manual Q&A; optional AI-suggested questions from evidence).  
4. Optional: import Meet transcript → private MeetingSummary (`em_only`).  
5. Optional: 1:1 theme tags.

**Budget:** ~5 min/week/person.

---

## Workflow A0 — Cold start (first install)

1. Create workspace → set encryption password.  
2. CSV-import directs.  
3. Upload role framework → structure RoleDefinitions → assign roles.  
4. **Backfill wizard:** paste prior ratings, import old review PDFs as documents, add top achievements for the current window.  
5. Result: usable dossiers before cycle crunch.

---

## Workflow B — Cycle kickoff

1. Create cycle (performance window, soft phase dates, templates).  
2. Participants snapshot role + next-role targets.  
3. **Export self-review bundles** (and peer bundles for chosen reviewers).  
4. Send via email/chat outside the app.  
5. Command center tracks: exported / imported / drafting / shared.

New hires (&lt;90 days): check-in template; eligibility `check_in`.

---

## Workflow C — Writing desk

```
┌─────────────────────────┬──────────────────────────────┐
│ Packet                  │ Draft                        │
│ Role current → next     │ Overall + role_fit           │
│ Imported self / peers   │ Competencies + evidence      │
│ Goals / evidence        │ Conditional next-level gaps  │
│ Prior cycle             │ Dev plan / promo readiness   │
└─────────────────────────┴──────────────────────────────┘
```

1. Confirm RoleAssignment.  
2. Read digest (AI optional).  
3. Score **current-role fit** + competencies; attach evidence outside middle.  
4. If promo in play: complete next-level gap vs **RoleExpectation ids**; else skip.  
5. AI drafts with citation accept gate.  
6. Autosave on; preview subject export → finalize → export share packet.

**Waive** missing self-import with reason (soft gate).

---

## Workflow D — Single-EM consistency (“calibration lite”)

1. View rating distribution across own directs.  
2. Side-by-side edge cases.  
3. Adjust with decision log reasons.  

Cross-manager: optional **calibration bundle** export/import (P1), not live room.

---

## Workflow E — Share & discuss

1. Export subject packet (PDF/HTML) — omits `em_only`.  
2. Hold 1:1 offline.  
3. Record acknowledgment note in-app.  
4. Create next-cycle goals from growth areas / gaps.  
5. Prompt: export finalized packets to company system of record.

---

## Workflow F — Promotion packet

1. Select target next RoleDefinition.  
2. Checklist of RoleExpectations → marks + evidence.  
3. AI promo draft (grounded) → edit → export for skip-level.

---

## Workflow G — Exceptions

| Situation | Behavior |
|-----------|----------|
| New hire | Check-in template |
| Manager change | Supersede manager review; keep prior as read-only contribution |
| Leave | Extend dates per person |
| Underperformance | Concern log + improvement plan; AI off by default |
| Dispute | Amendment with reason; visible version note on packet |
| EM leaves company | Workspace archive export / handoff |

---

## Home — Command center

- Bundle pipeline status  
- Writing queue  
- Thin-evidence / unassigned-role flags  
- Outside cycles: dossier freshness + backfill CTAs  
