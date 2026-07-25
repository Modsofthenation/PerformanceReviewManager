import { createHash, randomBytes, scryptSync, timingSafeEqual, createCipheriv, createDecipheriv } from "node:crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { openDatabase, type Db } from "@prm/db";
import { activityEvents, workspace } from "@prm/db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

const ROOT = process.env.PRM_DATA_DIR ?? join(process.cwd(), "../../data");
const DB_PATH = join(ROOT, "prm.sqlite");
const SESSION_PATH = join(ROOT, ".session");

export const paths = {
  root: ROOT,
  db: DB_PATH,
  files: join(ROOT, "files"),
  documents: join(ROOT, "files", "documents"),
  frameworks: join(ROOT, "files", "frameworks"),
  exports: join(ROOT, "files", "exports"),
};

mkdirSync(paths.documents, { recursive: true });
mkdirSync(paths.frameworks, { recursive: true });
mkdirSync(paths.exports, { recursive: true });

let sqliteHandle: ReturnType<typeof openDatabase>["sqlite"] | null = null;
let dbHandle: Db | null = null;
let sessionToken: string | null = null;
let workspaceSecret: Buffer | null = null;

export function getDb(): Db {
  if (!dbHandle) {
    const opened = openDatabase(DB_PATH);
    sqliteHandle = opened.sqlite;
    dbHandle = opened.db;
  }
  return dbHandle;
}

export function isInitialized(): boolean {
  try {
    const db = getDb();
    const row = db.select().from(workspace).limit(1).all();
    return row.length > 0;
  } catch {
    return false;
  }
}

export function hashPassword(password: string, salt?: string) {
  const s = salt ?? randomBytes(16).toString("hex");
  const hash = scryptSync(password, s, 64).toString("hex");
  return { hash, salt: s };
}

export function verifyPassword(password: string, hash: string, salt: string) {
  const next = scryptSync(password, salt, 64);
  const prev = Buffer.from(hash, "hex");
  return next.length === prev.length && timingSafeEqual(next, prev);
}

export function deriveWorkspaceSecret(password: string, salt: string) {
  return scryptSync(password, `prm-secret:${salt}`, 32);
}

export function encryptSecret(plain: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptSecret(payload: string, key: Buffer) {
  const [ivH, tagH, dataH] = payload.split(":");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivH, "hex"));
  decipher.setAuthTag(Buffer.from(tagH, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataH, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

export function createSession(password: string, salt: string) {
  sessionToken = nanoid(32);
  workspaceSecret = deriveWorkspaceSecret(password, salt);
  writeFileSync(
    SESSION_PATH,
    JSON.stringify({ token: sessionToken, createdAt: new Date().toISOString() }),
    { mode: 0o600 },
  );
  return sessionToken;
}

export function clearSession() {
  sessionToken = null;
  workspaceSecret = null;
  if (existsSync(SESSION_PATH)) unlinkSync(SESSION_PATH);
}

export function loadSessionFromDisk() {
  if (!existsSync(SESSION_PATH)) return null;
  try {
    const raw = JSON.parse(readFileSync(SESSION_PATH, "utf8")) as { token: string };
    sessionToken = raw.token;
    return sessionToken;
  } catch {
    return null;
  }
}

export function getSessionToken() {
  return sessionToken ?? loadSessionFromDisk();
}

export function getWorkspaceSecret() {
  return workspaceSecret;
}

export function setWorkspaceSecret(secret: Buffer) {
  workspaceSecret = secret;
}

export function requireSession(token: string | undefined) {
  const current = getSessionToken();
  return Boolean(current && token && current === token);
}

export function nowIso() {
  return new Date().toISOString();
}

export function id(prefix?: string) {
  return prefix ? `${prefix}_${nanoid(10)}` : nanoid(12);
}

export function checksum(payload: string) {
  return createHash("sha256").update(payload).digest("hex");
}

export function logActivity(action: string, entityType?: string, entityId?: string, detail: Record<string, unknown> = {}) {
  const db = getDb();
  const ws = db.select().from(workspace).limit(1).all()[0];
  const prevHash = ws?.lastActivityHash ?? "genesis";
  const createdAt = nowIso();
  const eventId = id("act");
  const body = JSON.stringify({ action, entityType, entityId, detail, prevHash, createdAt });
  const hash = createHash("sha256").update(body).digest("hex");
  db.insert(activityEvents).values({
    id: eventId,
    action,
    entityType: entityType ?? null,
    entityId: entityId ?? null,
    detailJson: JSON.stringify(detail),
    prevHash,
    hash,
    createdAt,
  }).run();
  if (ws) {
    db.update(workspace).set({ lastActivityHash: hash }).where(eq(workspace.id, ws.id)).run();
  }
  return hash;
}
