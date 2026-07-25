# AI Integration

AI compresses evidence into judgment support. It does not replace the EM’s voice.  
Workbench trust: [TRUST_MODEL.md](../architecture/TRUST_MODEL.md).

---

## Principles

1. Grounded or silent — cite `RoleExpectation` / dossier ids; no invention.  
2. Human accept gate into draft.  
3. Same eyesight as EM (full workspace) for generation — **egress** is separately gated.  
4. Challenge mode over flattery.  
5. Auditable generations with **data_classes_sent**.  
6. Disable-able; underperformance flows default AI **off**.

---

## Configuration (in-app)

**Settings → AI** (workspace admin):

- Enable AI  
- Provider: Anthropic / OpenAI / Azure / Ollama / custom URL  
- API key → OS keychain (masked in UI); Test connection  
- Models per capability  
- **Local-only** mode  
- **Private-tier egress matrix** (per class: private notes, meeting summaries, document extracts) — default **deny** for cloud  
- Custom URL requires explicit “unverified endpoint” acknowledgment  
- Surface provider retention/training **facts** (not unkeepable guarantees)

Missing key → writing desk works; Generate CTA → Settings.

---

## Capabilities

| Capability | Notes | Auto-apply? |
|------------|-------|-------------|
| Evidence digest | | No |
| Peer synthesize | From imports | No |
| Draft section | Selected evidence | No |
| Role gap analysis | Current + next RoleExpectations | No |
| Promotion draft | Target role only | No |
| Rubric suggest | P1; RoleDefinition primary | No |
| Bias/tone lint | Ephemeral findings by default | Optional |
| Next-cycle goals | From gaps | No |
| Calib talking points | Single-EM consistency | Display |

---

## Context packaging

Include current/next RoleDefinition + RoleExpectations (with ids), imports, dossier excerpts, optional documents/meetings **only if egress policy allows**.

- Prefer summaries; cap size.  
- Pseudonymize display names in cloud calls when identity not required.  
- **Never** send raw transcripts — MeetingSummary only.  
- Treat all imported/IC text as untrusted (injection).  
- Delimiters + **server-side citation allowlist** (drop unknown ids).  
- Per-generation UI manifest: provider, model, data classes, approx tokens/cost.

---

## Evals (launch gates)

| Eval | Required |
|------|----------|
| Faithfulness / citation validity | Yes |
| Invention rate | Yes |
| Thin-evidence honesty | Yes |
| Prompt-injection suite (adversarial self-review/PDF/transcript) | Yes |
| Manager edit distance (monitor) | Yes |
| Bias lint precision | Stretch |

Unverified / tiny local models: badge + restrict score suggestion / gap classification until mini-eval passes.

---

## Safety

- High-impact promo/gap outputs: human review attestation in UI  
- Lint ≠ proof of fairness  
- Retention: minimize; lint ephemeral; drafts shorter than reviews  
- BYO key = user’s provider contract; block providers that fail org policy flags when those flags exist  

---

## Never

- Auto-submit / auto-share  
- Change ratings without confirm  
- Use raw transcripts  
- Include `em_only` content in **subject** exports (separate from model context)  
- Evaluate against generic ladder when RoleDefinition assigned  
- Claim promo readiness without next-role expectation mapping  
- Send private-tier classes to cloud without per-class opt-in  
