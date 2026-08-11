import { eq } from "drizzle-orm";
import { oneOnOneItems, oneOnOneSessions, people } from "@prm/db";
import type {
  OneOnOneItemDTO,
  OneOnOneItemSource,
  OneOnOneSessionDTO,
  OneOnOneSessionStatus,
  Visibility,
} from "@prm/shared";
import type { Hono } from "hono";
import { buildSystemPrompt, getAiConfig, runChat, storeGeneration, type ChatMessage } from "./ai.js";
import { filterCitationsAgainstAllowlist } from "./citations.js";
import { getDb, id, logActivity, nowIso } from "./store.js";

const STATUSES = new Set<OneOnOneSessionStatus>(["planned", "in_progress", "done"]);
const SOURCES = new Set<OneOnOneItemSource>(["manual", "ai_suggested"]);

type EvidenceCtx = {
  lines: string[];
  citations: string[];
  dataClassesSent: string[];
};

type Helpers = {
  buildEvidenceContext: (personId: string, cycleId?: string) => EvidenceCtx;
};

function toItemDto(row: typeof oneOnOneItems.$inferSelect): OneOnOneItemDTO {
  return {
    id: row.id,
    sessionId: row.sessionId,
    sortOrder: row.sortOrder,
    questionText: row.questionText,
    answerText: row.answerText,
    source: (SOURCES.has(row.source as OneOnOneItemSource)
      ? row.source
      : "manual") as OneOnOneItemSource,
    generationId: row.generationId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSessionDto(
  row: typeof oneOnOneSessions.$inferSelect,
  items: OneOnOneItemDTO[],
): OneOnOneSessionDTO {
  return {
    id: row.id,
    personId: row.personId,
    occurredAt: row.occurredAt,
    title: row.title,
    status: (STATUSES.has(row.status as OneOnOneSessionStatus)
      ? row.status
      : "planned") as OneOnOneSessionStatus,
    notes: row.notes,
    visibility: (row.visibility as Visibility) || "em_only",
    items,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function itemsForSession(sessionId: string): OneOnOneItemDTO[] {
  return getDb()
    .select()
    .from(oneOnOneItems)
    .where(eq(oneOnOneItems.sessionId, sessionId))
    .all()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
    .map(toItemDto);
}

function loadSession(sessionId: string): OneOnOneSessionDTO | null {
  const row = getDb().select().from(oneOnOneSessions).where(eq(oneOnOneSessions.id, sessionId)).all()[0];
  if (!row) return null;
  return toSessionDto(row, itemsForSession(sessionId));
}

function nextSortOrder(sessionId: string): number {
  const rows = getDb()
    .select()
    .from(oneOnOneItems)
    .where(eq(oneOnOneItems.sessionId, sessionId))
    .all();
  if (!rows.length) return 0;
  return Math.max(...rows.map((r) => r.sortOrder)) + 1;
}

/** Parse AI output into question strings (JSON array preferred; fallback to lines). */
export function parseSuggestedQuestions(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((q) => {
            if (typeof q === "string") return q.trim();
            if (q && typeof q === "object" && typeof (q as { question?: string }).question === "string") {
              return String((q as { question: string }).question).trim();
            }
            return "";
          })
          .filter(Boolean);
      }
    }
  } catch {
    /* fall through */
  }
  return trimmed
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
    .filter((line) => line.length > 8 && /\?/.test(line));
}

export function registerOneOnOneRoutes(app: Hono<any>, helpers: Helpers) {
  app.get("/api/people/:id/one-on-ones", (c) => {
    const personId = c.req.param("id");
    const rows = getDb()
      .select()
      .from(oneOnOneSessions)
      .where(eq(oneOnOneSessions.personId, personId))
      .all()
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.createdAt.localeCompare(a.createdAt));
    return c.json({
      items: rows.map((row) => toSessionDto(row, itemsForSession(row.id))),
    });
  });

  app.post("/api/people/:id/one-on-ones", async (c) => {
    const personId = c.req.param("id");
    const db = getDb();
    const person = db.select().from(people).where(eq(people.id, personId)).all()[0];
    if (!person) return c.json({ error: "Person not found" }, 404);

    const body = await c.req.json<{
      title?: string;
      occurredAt?: string;
      status?: OneOnOneSessionStatus;
      notes?: string;
      questions?: string[];
    }>();

    const ts = nowIso();
    const sessionId = id("ono");
    const title = (body.title ?? `1:1 — ${person.name}`).trim() || `1:1 — ${person.name}`;
    const occurredAt = (body.occurredAt ?? ts.slice(0, 10)).trim();
    const status: OneOnOneSessionStatus =
      body.status && STATUSES.has(body.status) ? body.status : "planned";

    db.insert(oneOnOneSessions)
      .values({
        id: sessionId,
        personId,
        occurredAt,
        title,
        status,
        notes: body.notes?.trim() || null,
        visibility: "em_only",
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    const seedQuestions = (body.questions ?? [])
      .map((q) => q.trim())
      .filter(Boolean)
      .slice(0, 40);
    seedQuestions.forEach((questionText, i) => {
      db.insert(oneOnOneItems)
        .values({
          id: id("onoq"),
          sessionId,
          sortOrder: i,
          questionText,
          answerText: null,
          source: "manual",
          generationId: null,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
    });

    logActivity("one_on_one.create", "one_on_one_session", sessionId, {
      personId,
      questionCount: seedQuestions.length,
    });
    return c.json(loadSession(sessionId));
  });

  app.patch("/api/one-on-ones/:id", async (c) => {
    const sessionId = c.req.param("id");
    const db = getDb();
    const existing = db.select().from(oneOnOneSessions).where(eq(oneOnOneSessions.id, sessionId)).all()[0];
    if (!existing) return c.json({ error: "Session not found" }, 404);

    const body = await c.req.json<{
      title?: string;
      occurredAt?: string;
      status?: OneOnOneSessionStatus;
      notes?: string | null;
    }>();

    const patch: Partial<typeof oneOnOneSessions.$inferInsert> = { updatedAt: nowIso() };
    if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
    if (typeof body.occurredAt === "string" && body.occurredAt.trim()) {
      patch.occurredAt = body.occurredAt.trim();
    }
    if (body.status && STATUSES.has(body.status)) patch.status = body.status;
    if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;

    db.update(oneOnOneSessions).set(patch).where(eq(oneOnOneSessions.id, sessionId)).run();
    logActivity("one_on_one.update", "one_on_one_session", sessionId, {
      status: patch.status ?? existing.status,
    });
    return c.json(loadSession(sessionId));
  });

  app.delete("/api/one-on-ones/:id", (c) => {
    const sessionId = c.req.param("id");
    const db = getDb();
    const existing = db.select().from(oneOnOneSessions).where(eq(oneOnOneSessions.id, sessionId)).all()[0];
    if (!existing) return c.json({ error: "Session not found" }, 404);
    db.delete(oneOnOneItems).where(eq(oneOnOneItems.sessionId, sessionId)).run();
    db.delete(oneOnOneSessions).where(eq(oneOnOneSessions.id, sessionId)).run();
    logActivity("one_on_one.delete", "one_on_one_session", sessionId, { personId: existing.personId });
    return c.json({ ok: true });
  });

  app.post("/api/one-on-ones/:id/items", async (c) => {
    const sessionId = c.req.param("id");
    const db = getDb();
    const session = db.select().from(oneOnOneSessions).where(eq(oneOnOneSessions.id, sessionId)).all()[0];
    if (!session) return c.json({ error: "Session not found" }, 404);

    const body = await c.req.json<{
      questionText?: string;
      answerText?: string | null;
      source?: OneOnOneItemSource;
      generationId?: string | null;
    }>();
    const questionText = (body.questionText ?? "").trim();
    if (!questionText) return c.json({ error: "questionText required" }, 400);

    const ts = nowIso();
    const itemId = id("onoq");
    const source: OneOnOneItemSource =
      body.source && SOURCES.has(body.source) ? body.source : "manual";
    db.insert(oneOnOneItems)
      .values({
        id: itemId,
        sessionId,
        sortOrder: nextSortOrder(sessionId),
        questionText,
        answerText: body.answerText?.trim() || null,
        source,
        generationId: body.generationId ?? null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    db.update(oneOnOneSessions)
      .set({ updatedAt: ts })
      .where(eq(oneOnOneSessions.id, sessionId))
      .run();
    logActivity("one_on_one.item_create", "one_on_one_item", itemId, { sessionId, source });
    const row = db.select().from(oneOnOneItems).where(eq(oneOnOneItems.id, itemId)).all()[0];
    return c.json(toItemDto(row));
  });

  app.patch("/api/one-on-one-items/:id", async (c) => {
    const itemId = c.req.param("id");
    const db = getDb();
    const existing = db.select().from(oneOnOneItems).where(eq(oneOnOneItems.id, itemId)).all()[0];
    if (!existing) return c.json({ error: "Item not found" }, 404);

    const body = await c.req.json<{
      questionText?: string;
      answerText?: string | null;
      sortOrder?: number;
    }>();
    const patch: Partial<typeof oneOnOneItems.$inferInsert> = { updatedAt: nowIso() };
    if (typeof body.questionText === "string" && body.questionText.trim()) {
      patch.questionText = body.questionText.trim();
    }
    if (body.answerText !== undefined) patch.answerText = body.answerText?.trim() || null;
    if (typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)) {
      patch.sortOrder = Math.max(0, Math.floor(body.sortOrder));
    }

    db.update(oneOnOneItems).set(patch).where(eq(oneOnOneItems.id, itemId)).run();
    db.update(oneOnOneSessions)
      .set({ updatedAt: nowIso() })
      .where(eq(oneOnOneSessions.id, existing.sessionId))
      .run();
    logActivity("one_on_one.item_update", "one_on_one_item", itemId, { sessionId: existing.sessionId });
    const row = db.select().from(oneOnOneItems).where(eq(oneOnOneItems.id, itemId)).all()[0];
    return c.json(toItemDto(row));
  });

  app.delete("/api/one-on-one-items/:id", (c) => {
    const itemId = c.req.param("id");
    const db = getDb();
    const existing = db.select().from(oneOnOneItems).where(eq(oneOnOneItems.id, itemId)).all()[0];
    if (!existing) return c.json({ error: "Item not found" }, 404);
    db.delete(oneOnOneItems).where(eq(oneOnOneItems.id, itemId)).run();
    db.update(oneOnOneSessions)
      .set({ updatedAt: nowIso() })
      .where(eq(oneOnOneSessions.id, existing.sessionId))
      .run();
    logActivity("one_on_one.item_delete", "one_on_one_item", itemId, { sessionId: existing.sessionId });
    return c.json({ ok: true });
  });

  /**
   * Suggest 1:1 questions from dossier evidence. Does not auto-write answers.
   * Pass addToSession: true to append accepted questions onto the session.
   */
  app.post("/api/one-on-ones/:id/suggest-questions", async (c) => {
    const sessionId = c.req.param("id");
    const db = getDb();
    const session = db.select().from(oneOnOneSessions).where(eq(oneOnOneSessions.id, sessionId)).all()[0];
    if (!session) return c.json({ error: "Session not found" }, 404);
    const person = db.select().from(people).where(eq(people.id, session.personId)).all()[0];
    if (!person) return c.json({ error: "Person not found" }, 404);

    const body = await c.req.json<{
      cycleId?: string | null;
      count?: number;
      addToSession?: boolean;
    }>();
    const count = Math.min(12, Math.max(3, Number(body.count) || 6));
    const cfg = getAiConfig();
    if (!cfg.enabled) {
      return c.json({ error: "AI is disabled — add questions manually, or enable AI in Settings." }, 400);
    }

    const ctx = helpers.buildEvidenceContext(session.personId, body.cycleId || undefined);
    const existingQs = itemsForSession(sessionId).map((i) => i.questionText);
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: `${buildSystemPrompt()}

You prepare 1:1 questions for a solo engineering manager.
Return ONLY a JSON array of ${count} short question strings (no markdown fence).
Ground questions in the evidence; cite ids in brackets when a question depends on a specific item.
If evidence is thin, ask clarifying / capture questions and say so in one of the questions.
Do not invent projects or metrics.`,
      },
      {
        role: "user",
        content: `Person: ${person.name}${person.title ? ` (${person.title})` : ""}
Session: ${session.title} (${session.occurredAt})
Existing questions already on the agenda (do not duplicate):\n${existingQs.length ? existingQs.map((q) => `- ${q}`).join("\n") : "(none)"}

WORKSPACE EVIDENCE:
${ctx.lines.join("\n") || "(no evidence yet — suggest discovery questions)"}`,
      },
    ];

    try {
      const result = await runChat("one_on_one_questions", messages);
      const filtered = filterCitationsAgainstAllowlist(result.text, ctx.citations);
      const questions = parseSuggestedQuestions(filtered.text).slice(0, count);
      if (!questions.length) {
        return c.json({ error: "AI returned no usable questions — try again or add manually." }, 500);
      }
      const generationId = storeGeneration({
        feature: "one_on_one_questions",
        subjectPersonId: session.personId,
        cycleId: body.cycleId || undefined,
        model: result.model,
        outputText: filtered.text,
        citations: filtered.citationsUsed,
        dataClassesSent: ctx.dataClassesSent,
      });

      let added: OneOnOneItemDTO[] = [];
      if (body.addToSession) {
        const ts = nowIso();
        let order = nextSortOrder(sessionId);
        added = questions.map((questionText) => {
          const itemId = id("onoq");
          db.insert(oneOnOneItems)
            .values({
              id: itemId,
              sessionId,
              sortOrder: order++,
              questionText,
              answerText: null,
              source: "ai_suggested",
              generationId,
              createdAt: ts,
              updatedAt: ts,
            })
            .run();
          return toItemDto(db.select().from(oneOnOneItems).where(eq(oneOnOneItems.id, itemId)).all()[0]);
        });
        db.update(oneOnOneSessions)
          .set({ updatedAt: ts, status: session.status === "planned" ? "in_progress" : session.status })
          .where(eq(oneOnOneSessions.id, sessionId))
          .run();
      }

      return c.json({
        generationId,
        model: result.model,
        questions,
        citations: filtered.citationsUsed,
        citationsDropped: filtered.citationsDropped,
        dataClassesSent: ctx.dataClassesSent,
        added,
        session: loadSession(sessionId),
      });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "AI suggest failed" }, 500);
    }
  });
}
