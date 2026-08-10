# Security Policy

Performance Review Manager (PRM) is a **local, single-user** Engineering Manager workbench. Treat employee performance data as highly sensitive.

## Supported versions

| Version | Supported |
|---------|-----------|
| `0.1.x` (main) | Yes |
| Older tags / forks | Best-effort only |

## Threat model (honest)

PRM protects a vault on **one machine** for **one OS user**. It is not a multi-tenant SaaS boundary.

| Assumption | Implication |
|------------|-------------|
| Loopback API (`127.0.0.1`) | Remote network attackers should not reach the API. Shared OS accounts, malware, or other local processes can. |
| Workspace password | Encrypts SQLite + files **when locked**. While unlocked, data is plaintext on disk under the data directory. |
| Session token | Held in memory on the API and in the browser `localStorage`. Any XSS on the UI origin can steal it until lock / restart. |
| Demo password `workbench` | For exploration only. **Never** store real employee data behind the demo password. |
| Cloud AI / integrations | Explicit egress. Keys leave the machine under your provider contract when features are enabled and used. |

What PRM does **not** claim today:

- OS keychain custody for API keys (keys are encrypted with the workspace secret inside SQLite)
- Automatic refusal of Dropbox / iCloud / OneDrive data directories (warn when detected; sync folders remain risky)
- Cryptographic anonymity for peer feedback
- Tamper-proof legal custody of the activity log (hash-chained and HMAC-exportable, but the EM can re-sign after unlock)
- Signed auto-update for desktop installers (manual **Desktop Installers** / **Release** artifacts; verify checksums yourself)

Details: [`docs/architecture/TRUST_MODEL.md`](./docs/architecture/TRUST_MODEL.md).

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

### Preferred: GitHub private vulnerability reporting

If [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) is enabled on this repository, use **Security → Report a vulnerability** (or open a draft Security Advisory). That keeps PoCs out of the public issue tracker and gives maintainers a private thread.

Maintainers: enable it under **Settings → Code security → Private vulnerability reporting** before or when making the repo public. See [`docs/PUBLIC_RELEASE.md`](./docs/PUBLIC_RELEASE.md).

### Fallback: email

If private reporting is unavailable, email **zord.lack.net@gmail.com** with:

1. A clear description of the issue and impact
2. Steps to reproduce (PoC welcome; keep payloads minimal)
3. Affected commit / tag if known
4. Whether you plan to disclose publicly and on what timeline

We aim to acknowledge within **7 days** and to provide a remediation plan or fix timeline within **30 days** for confirmed issues in supported versions.

If the report involves real employee PII from a deployed vault, say so up front and redact identifiers in screenshots/logs.

## Safe handling for contributors

- Never commit real vault data (`data/`), `.session`, API keys, or integration tokens
- Prefer synthetic fixtures (`@example.com`, demo seed people)
- Do not weaken password checks, CORS, launch-token gates, or encryption for convenience without an explicit security review
- Demo defaults (`workbench`) must remain labeled as demo-only and must not silently apply to empty / production workspaces
