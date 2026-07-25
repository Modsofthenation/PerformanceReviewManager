# @prm/mcp — Cursor MCP for Performance Review Manager

Local stdio MCP server that lets an LLM unlock your PRM vault and **bulk-load** people evidence: achievements, goals, feedback/notes, documents/transcripts, role assignments, cycles, and review bundles.

Pair this with other MCPs (Google Drive, Jira, etc.): pull source material there, then call PRM tools here to write into the workbench.

## Prerequisites

1. PRM API running: `pnpm dev:api` (or `pnpm dev`) on `http://127.0.0.1:8787`
2. Workspace initialized + unlockable (seed password: `workbench`)

## Cursor setup

Add to **Cursor Settings → MCP** (or project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "prm": {
      "command": "pnpm",
      "args": ["--dir", "/absolute/path/to/PerformanceReviewManager", "exec", "tsx", "packages/mcp/src/index.ts"],
      "env": {
        "PRM_API_URL": "http://127.0.0.1:8787",
        "PRM_PASSWORD": "workbench"
      }
    }
  }
}
```

Or from this package directory:

```json
{
  "mcpServers": {
    "prm": {
      "command": "pnpm",
      "args": ["--filter", "@prm/mcp", "start"],
      "cwd": "/absolute/path/to/PerformanceReviewManager"
    }
  }
}
```

Copy the example at [`.cursor/mcp.json.example`](../../.cursor/mcp.json.example).

## Environment

| Var | Default | Meaning |
|-----|---------|---------|
| `PRM_API_URL` | `http://127.0.0.1:8787` | Local API base |
| `PRM_PASSWORD` | `workbench` | Unlock password |
| `PRM_TOKEN` | — | Optional existing `x-prm-token` |

## Tools (high level)

| Tool | Purpose |
|------|---------|
| `prm_status` / `prm_unlock` | Vault session |
| `prm_list_people` / `prm_get_person` / `prm_create_person` | People |
| `prm_list_roles` / `prm_assign_role` | Role bar |
| `prm_list_cycles` / `prm_create_cycle` | Cycles |
| `prm_add_achievement` / `prm_add_goal` / `prm_add_feedback` | Dossier evidence + notes |
| `prm_upload_document` | File → dossier (pdf/docx/txt/md/…) |
| `prm_bulk_load_evidence` | Batch achievements/goals/feedback/docs |
| `prm_import_review_bundle` | Self/peer JSON import |
| `prm_set_private_notes` | EM-only manager scratchpad |
| `prm_create_promotion` | Open promo packet |

Prompt: `prm_bulk_ingest_playbook` — workflow for Jira/Google → PRM (pair with the in-app **Backfill** wizard at `/backfill` for thin dossiers).

## Example: bulk load after a Jira sweep

```json
{
  "items": [
    {
      "type": "achievement",
      "personName": "Maya Chen",
      "title": "Closed PROJ-1842 checkout timeout epic",
      "description": "P95 timeouts −40%; paired with SRE.",
      "occurredAt": "2026-06-12"
    },
    {
      "type": "feedback",
      "personName": "Maya Chen",
      "fromName": "Jira",
      "kind": "praise",
      "body": "Design partners +1'd communication on PROJ-1842 rollout notes."
    },
    {
      "type": "document",
      "personName": "Maya Chen",
      "filePath": "/tmp/maya-1on1-2026-06-01.md",
      "title": "1:1 transcript 2026-06-01"
    }
  ]
}
```

## Security

- Talks only to loopback PRM by default.
- Holds the vault unlock password / session token in the MCP process env — treat like local secrets.
- Document uploads read **local filesystem paths** the MCP process can access; do not point it at untrusted paths.
