import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResult, jsonResult, type PrmClient } from "./client.js";

const personRef = {
  personId: z.string().optional().describe("Person id (person_…). Prefer when known."),
  personName: z.string().optional().describe("Exact or unique partial name, e.g. \"Maya Chen\"."),
};

const visibility = z
  .enum(["em_only", "em_and_subject", "calib_export"])
  .optional()
  .describe("Share/export visibility. Default em_and_subject.");

const evidenceItem = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("achievement"),
    personId: z.string().optional(),
    personName: z.string().optional(),
    title: z.string(),
    description: z.string().optional(),
    occurredAt: z.string().optional().describe("YYYY-MM-DD"),
  }),
  z.object({
    type: z.literal("goal"),
    personId: z.string().optional(),
    personName: z.string().optional(),
    title: z.string(),
    description: z.string().optional(),
    status: z.string().optional().describe("e.g. on_track, at_risk, done"),
  }),
  z.object({
    type: z.literal("feedback"),
    personId: z.string().optional(),
    personName: z.string().optional(),
    body: z.string().describe("Note / feedback text (1:1, partner, incident, etc.)"),
    fromName: z.string().optional().describe("Source label, e.g. Jira, Google Doc, peer name"),
    kind: z.string().optional().describe("coaching | praise | incident (or custom)"),
    visibility,
    occurredAt: z.string().optional(),
  }),
  z.object({
    type: z.literal("document"),
    personId: z.string().optional(),
    personName: z.string().optional(),
    filePath: z.string().describe("Absolute path to a local file the MCP process can read"),
    title: z.string().optional(),
    visibility,
    occurredAt: z.string().optional(),
  }),
]);

export function registerPrmTools(server: McpServer, client: PrmClient) {
  server.registerTool(
    "prm_status",
    {
      title: "Workspace status",
      description: "Check whether the local PRM vault is initialized/unlocked and basic counts.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return jsonResult(await client.status());
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "prm_unlock",
    {
      title: "Unlock workspace",
      description:
        "Unlock the encrypted PRM vault with the workspace password and cache the session token for later tools. Default demo password is workbench.",
      inputSchema: z.object({
        password: z.string().optional().describe("Workspace password. Defaults to PRM_PASSWORD or workbench."),
      }),
    },
    async ({ password }) => {
      try {
        const res = await client.unlock(password);
        return jsonResult({ ok: true, name: res.name, tokenCached: true });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "prm_list_people",
    {
      title: "List people",
      description: "List team members with role assignment summaries.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return jsonResult(await client.listPeople());
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "prm_get_person",
    {
      title: "Get person + dossier",
      description: "Fetch a person record plus goals, achievements, feedback, and documents.",
      inputSchema: z.object(personRef),
    },
    async ({ personId, personName }) => {
      try {
        const id = await client.resolvePersonId(personId, personName);
        const [person, dossier] = await Promise.all([client.getPerson(id), client.getDossier(id)]);
        return jsonResult({ person, dossier });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "prm_create_person",
    {
      title: "Create person",
      description: "Add a team member (subject). They do not need an app login.",
      inputSchema: z.object({
        name: z.string(),
        email: z.string().optional(),
        title: z.string().optional(),
        levelKey: z.string().optional().describe("e.g. IC3, IC4, M1"),
        managerId: z.string().optional().describe("Usually the EM person id"),
        hireDate: z.string().optional().describe("YYYY-MM-DD"),
      }),
    },
    async (args) => {
      try {
        return jsonResult(await client.createPerson(args));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "prm_list_roles",
    {
      title: "List roles",
      description: "List role definitions and expectations (stable ids). Use before prm_assign_role.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return jsonResult(await client.listRoles());
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "prm_assign_role",
    {
      title: "Assign role",
      description: "Assign current (+ optional next) RoleDefinition to a person.",
      inputSchema: z.object({
        ...personRef,
        roleDefinitionId: z.string().describe("Role definition id from prm_list_roles"),
        targetNextRoleDefinitionId: z
          .string()
          .nullable()
          .optional()
          .describe("Optional next-role definition id"),
      }),
    },
    async ({ personId, personName, roleDefinitionId, targetNextRoleDefinitionId }) => {
      try {
        const id = await client.resolvePersonId(personId, personName);
        return jsonResult(
          await client.assignRole({
            personId: id,
            roleDefinitionId,
            targetNextRoleDefinitionId: targetNextRoleDefinitionId ?? null,
          }),
        );
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "prm_list_cycles",
    {
      title: "List cycles",
      description: "List review cycles.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return jsonResult(await client.listCycles());
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "prm_create_cycle",
    {
      title: "Create cycle",
      description: "Create a review cycle and optionally enroll all directs.",
      inputSchema: z.object({
        name: z.string(),
        windowStart: z.string().describe("YYYY-MM-DD"),
        windowEnd: z.string().describe("YYYY-MM-DD"),
        includeDirects: z.boolean().optional(),
      }),
    },
    async (args) => {
      try {
        return jsonResult(await client.createCycle(args));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "prm_add_achievement",
    {
      title: "Add achievement",
      description: "Add an achievement to a person's dossier.",
      inputSchema: z.object({
        ...personRef,
        title: z.string(),
        description: z.string().optional(),
        occurredAt: z.string().optional(),
      }),
    },
    async ({ personId, personName, title, description, occurredAt }) => {
      try {
        const id = await client.resolvePersonId(personId, personName);
        return jsonResult(await client.addAchievement(id, { title, description, occurredAt }));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "prm_add_goal",
    {
      title: "Add goal",
      description: "Add a goal to a person's dossier.",
      inputSchema: z.object({
        ...personRef,
        title: z.string(),
        description: z.string().optional(),
        status: z.string().optional(),
      }),
    },
    async ({ personId, personName, title, description, status }) => {
      try {
        const id = await client.resolvePersonId(personId, personName);
        return jsonResult(await client.addGoal(id, { title, description, status }));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "prm_add_feedback",
    {
      title: "Add feedback / note",
      description:
        "Add an EM-entered note or feedback item on a person (1:1 themes, partner praise, incidents). Closest thing to freeform notes against a member.",
      inputSchema: z.object({
        ...personRef,
        body: z.string(),
        fromName: z.string().optional(),
        kind: z.string().optional(),
        visibility,
        occurredAt: z.string().optional(),
      }),
    },
    async ({ personId, personName, body, fromName, kind, visibility: vis, occurredAt }) => {
      try {
        const id = await client.resolvePersonId(personId, personName);
        return jsonResult(
          await client.addFeedback(id, { body, fromName, kind, visibility: vis, occurredAt }),
        );
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "prm_upload_document",
    {
      title: "Upload document",
      description:
        "Upload a local file into a person's dossier (pdf/docx/pptx/txt/md/csv/png/jpg, max 25MB). Use for transcripts, design docs, export packs, etc.",
      inputSchema: z.object({
        ...personRef,
        filePath: z.string().describe("Absolute path readable by this MCP process"),
        title: z.string().optional(),
        visibility,
        occurredAt: z.string().optional(),
      }),
    },
    async ({ personId, personName, filePath, title, visibility: vis, occurredAt }) => {
      try {
        const id = await client.resolvePersonId(personId, personName);
        return jsonResult(
          await client.uploadDocument(id, { filePath, title, visibility: vis, occurredAt }),
        );
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "prm_bulk_load_evidence",
    {
      title: "Bulk load evidence",
      description:
        "Bulk-create achievements, goals, feedback notes, and/or documents for one or many people. Ideal after pulling items from Jira/Google/Drive — map them here then call once.",
      inputSchema: z.object({
        items: z.array(evidenceItem).min(1).max(100),
      }),
    },
    async ({ items }) => {
      try {
        const results: Array<Record<string, unknown>> = [];
        for (const item of items) {
          const personId = await client.resolvePersonId(item.personId, item.personName);
          if (item.type === "achievement") {
            const created = await client.addAchievement(personId, {
              title: item.title,
              description: item.description,
              occurredAt: item.occurredAt,
            });
            results.push({ type: item.type, personId, ...created });
          } else if (item.type === "goal") {
            const created = await client.addGoal(personId, {
              title: item.title,
              description: item.description,
              status: item.status,
            });
            results.push({ type: item.type, personId, ...created });
          } else if (item.type === "feedback") {
            const created = await client.addFeedback(personId, {
              body: item.body,
              fromName: item.fromName,
              kind: item.kind,
              visibility: item.visibility,
              occurredAt: item.occurredAt,
            });
            results.push({ type: item.type, personId, ...created });
          } else {
            const created = await client.uploadDocument(personId, {
              filePath: item.filePath,
              title: item.title,
              visibility: item.visibility,
              occurredAt: item.occurredAt,
            });
            results.push({ type: item.type, personId, ...created });
          }
        }
        return jsonResult({ ok: true, count: results.length, results });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "prm_import_review_bundle",
    {
      title: "Import self/peer review bundle",
      description: "Import a self or peer review JSON bundle into a cycle.",
      inputSchema: z.object({
        bundle: z.record(z.string(), z.unknown()).describe("Bundle object with kind, cycleId, subjectPersonId, fields"),
        sourceFilename: z.string().optional(),
      }),
    },
    async ({ bundle, sourceFilename }) => {
      try {
        return jsonResult(await client.importBundle(bundle, sourceFilename));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "prm_set_private_notes",
    {
      title: "Set manager private notes",
      description:
        "Upsert EM-only private_notes on the manager review for a person/cycle (not shared in subject export). Merges into the existing draft payload when present.",
      inputSchema: z.object({
        cycleId: z.string(),
        ...personRef,
        privateNotes: z.string(),
      }),
    },
    async ({ cycleId, personId, personName, privateNotes }) => {
      try {
        const id = await client.resolvePersonId(personId, personName);
        const packet = await client.getPacket(cycleId, id);
        const existing = packet.managerReview?.payload ?? {};
        return jsonResult(
          await client.upsertManagerReview({
            cycleId,
            subjectPersonId: id,
            payload: {
              overall: existing.overall ?? 3,
              summary: existing.summary ?? "",
              strengths: existing.strengths ?? "",
              growth_areas: existing.growth_areas ?? "",
              dev_plan: existing.dev_plan ?? "",
              role_fit: existing.role_fit ?? "",
              promo_readiness: existing.promo_readiness ?? "not_applicable",
              ...existing,
              private_notes: privateNotes,
            },
            status: "draft",
          }),
        );
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "prm_create_promotion",
    {
      title: "Create promotion case",
      description: "Open a promotion packet for a person who has current + next role assigned.",
      inputSchema: z.object({
        ...personRef,
        cycleId: z.string().optional(),
      }),
    },
    async ({ personId, personName, cycleId }) => {
      try {
        const id = await client.resolvePersonId(personId, personName);
        return jsonResult(await client.createPromotion({ personId: id, cycleId }));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerPrompt(
    "prm_bulk_ingest_playbook",
    {
      title: "Bulk ingest playbook",
      description: "How to pull evidence from Jira/Google/etc and load it into PRM via MCP tools.",
      argsSchema: {
        source: z
          .string()
          .optional()
          .describe("External system, e.g. Jira, Google Drive, Notion"),
      },
    },
    async ({ source }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are helping an engineering manager bulk-load evidence into Performance Review Manager (local vault) via the PRM MCP tools.

External source context: ${source ?? "unspecified (Jira / Google / docs / chat exports)"}.

Workflow:
1. Call prm_status. If locked, prm_unlock (password workbench unless told otherwise).
2. prm_list_people / prm_list_roles to map names → person ids and role ids.
3. Gather items from the external system (tickets closed, docs, 1:1 notes, transcripts).
4. Normalize into prm_bulk_load_evidence items:
   - achievement — shipped outcomes with dates
   - goal — commitments / OKRs
   - feedback — freeform notes (set fromName to the system, e.g. "Jira", "Google Doc")
   - document — save file to disk first, then pass absolute filePath (pdf/docx/txt/md/csv/…)
5. Prefer one bulk call (≤100 items). On ambiguity of names, ask or use personId.
6. Verify with prm_get_person for a sample direct.

Never invent evidence. If the external source is thin, say so and only load what you have.
Do not write manager review ratings unless explicitly asked — use dossier tools instead.`,
          },
        },
      ],
    }),
  );
}
