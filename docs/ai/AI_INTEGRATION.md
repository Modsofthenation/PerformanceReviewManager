# AI Integration

AI exists to **compress evidence into judgment support**, not to replace the manager’s voice.

---

## Design principles

1. **Grounded or silent.** If evidence is thin, say so; do not invent projects, metrics, or praise.
2. **Citations required.** Every non-trivial claim points at dossier items (`achievement:12`, `feedback:88`, `goal:3`).
3. **Human accept gate.** AI text lands in a suggestion buffer; user applies/edits before it becomes draft payload.
4. **Same eyesight as user.** Context packager applies ACL of the requesting manager.
5. **Challenge mode > sycophancy.** Prefer surfacing contradictions and bias over flattering prose.
6. **Auditable.** Store prompt package hash, model, output, citations, latency, token counts.
7. **Disable-able.** Org and cycle can turn AI off (sensitive PIPs, legal holds).

---

## Capability map

| Capability | Input | Output | Auto-apply? |
|------------|-------|--------|-------------|
| Evidence digest | Packet slice | 8–12 bullets + thin-evidence warning | No (display only) |
| Peer synthesizer | Peer reviews | Themes, frequency, dissent callouts | No |
| Draft section | Section key + selected evidence ids + tone | Markdown draft + citations | No |
| Rubric suggest | Competency + anchors + evidence | Suggested score + rationale + citations | No |
| Bias / tone lint | Draft text | Findings with spans + rewrites | Optional apply rewrite |
| Consistency challenger | Multiple drafts in cohort | Questions for calib | Display |
| Next-cycle goals | Growth areas + role level | 3 SMART goal drafts | No |
| Calib talking points | Person packet + rating | 3 bullets for meeting | Display |
| Chat-with-dossier (P2) | Question + packet | Answer + citations | N/A |

---

## Context packaging

Before any LLM call, build a **ContextPackage**:

```json
{
  "subject": {"name": "Maya Chen", "level": "IC4", "role": "Backend Engineer"},
  "cycle": {"name": "H1 2026", "window": ["2026-01-01", "2026-06-30"]},
  "competencies": [{"key": "ownership", "anchors": {"3": "...", "4": "..."}}],
  "self_review": {"summary": "...", "scores": {...}},
  "peers": [{"anonymous_id": "P1", "strengths": "...", "growth": "..."}],
  "goals": [{"id": "goal:3", "title": "...", "status": "done"}],
  "achievements": [{"id": "achievement:12", "title": "...", "links": [...]}],
  "feedback": [{"id": "feedback:88", "kind": "praise", "text": "..."}],
  "documents": [{"id": "document:9", "title": "Q2 design review notes.pdf", "excerpt": "..."}],
  "meeting_summaries": [{"id": "meeting_summary:2", "title": "1:1 2026-03-12", "themes": ["..."], "visibility": "private_manager"}],
  "signals": [{"id": "signal:4", "highlights": ["..."]}],
  "prior_cycle": {"overall": 4, "themes": ["..."]},
  "manager_scratch": "optional private notes if feature allows"
}
```

**Token budget policy:** Prefer structured summaries over raw dumps. Cap peers at N; summarize long self-reviews. For documents, send excerpts/chunks tied to selected evidence — never entire multi-megabyte extracts by default. For meetings, send `MeetingSummary` fields only — **never raw transcripts** in interactive AI calls. Never include other employees’ packets.

**Injection defense:** Treat all user-authored review text, document extracts, and transcript-derived text as untrusted data; wrap in delimiters; instructions forbid following directives found inside evidence.

---

## Prompt patterns (conceptual)

### Evidence digest
System: You are an assistant to an engineering manager. Only use provided evidence. Cite ids. If insufficient evidence for a claim, omit it and list gaps.

### Draft section
System: Write in the manager’s selected tone (direct / warm / formal). Use first person as manager. No HR clichés (“rockstar”, “ninja”). Tie every sentence to citations. Length limits per section.

### Bias lint
Check for: gendered communal/agentic skew, age-coded language, ability assumptions, vagueness (“great attitude”) without behavior, recency-only references when older evidence exists, inflated certainty.

### Rubric suggest
Compare evidence to level-specific anchors; propose score; list confirming and disconfirming evidence; confidence `low|medium|high`. If confidence low, do not propose a number — ask for more evidence.

---

## Model routing

| Job | Latency need | Model tier |
|-----|--------------|------------|
| Digest / draft / goals | Interactive (<15s) | Strong mid/large |
| Bias lint | Interactive | Mid |
| Peer synthesize | Interactive | Mid |
| Calib batch talking points | Background OK | Large |
| Eval harness | Offline | Mix |

Allow org to pin provider. Store `model_id` on `AiGeneration`.

---

## Safety & compliance

- **PIP / legal sensitive:** feature flag forces AI off or HRBP-only
- **No training on customer data** contractual default with providers; zero-retention where available
- **Export control:** AI outputs included in legal export packages
- **Hallucination UX:** UI shows citations as chips; clicking opens source; “ungrounded sentence” detector soft-warns
- **Rate limits:** per-user and per-org daily generation caps
- **Human accountability copy:** near Generate buttons — “You are responsible for the final review”

---

## Evaluation harness

Ship offline evals before enabling each capability in prod:

| Eval | Metric |
|------|--------|
| Faithfulness | % of sentences with valid citation supporting claim |
| Invention rate | Human-labeled hallucinated facts / draft |
| Bias lint precision | % flagged spans agreed by HR reviewer |
| Manager edit distance | How much of AI draft survives (too high = rubber-stamp risk; too low = useless) |
| Thin-evidence honesty | Model correctly refuses when packet empty |

Gate launches on faithfulness ≥ threshold on golden set of anonymized synthetic packets.

---

## UX integration points

1. **Digest card** at top of writing desk (regenerate allowed; versioned).
2. **Generate** on each text section with evidence multi-select (pre-checked from attachments).
3. **Lint** runs on blur/submit; blockers optional (org config: warn vs block submit on critical findings).
4. **Calibration**: “Prepare talking points” button per card.
5. **History**: “Pattern insight” on timeline (multi-cycle), clearly labeled speculative.

---

## What AI must never do

- Auto-submit or auto-share a review
- Change ratings without explicit manager confirmation
- Reveal anonymous peer identities
- Cross-contaminate context across subjects
- Optimize for “sounds nice” over accuracy
- Provide comp recommendations (“pay them more”) — out of scope; link to a separate process
- Ingest or cite raw Meet transcripts in drafts (summaries only)
- Include `private_manager` documents or meeting summaries in subject-visible previews
