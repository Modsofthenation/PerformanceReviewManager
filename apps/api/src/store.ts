import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
  statSync,
  rmSync,
  copyFileSync,
} from "node:fs";
import { join, basename } from "node:path";
import { openDatabase, type Db } from "@prm/db";
import { activityEvents, workspace } from "@prm/db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

const ROOT = process.env.PRM_DATA_DIR ?? join(process.cwd(), "../../data");
const DB_PATH = join(ROOT, "prm.sqlite");
const DB_ENC_PATH = join(ROOT, "prm.sqlite.enc");
const VAULT_PATH = join(ROOT, "vault.json");
const SESSION_PATH = join(ROOT, ".session");

export const paths = {
  root: ROOT,
  db: DB_PATH,
  dbEnc: DB_ENC_PATH,
  vault: VAULT_PATH,
  files: join(ROOT, "files"),
  documents: join(ROOT, "files", "documents"),
  frameworks: join(ROOT, "files", "frameworks"),
  exports: join(ROOT, "files", "exports"),
};

mkdirSync(paths.documents, { recursive: true });
mkdirSync(paths.frameworks, { recursive: true });
mkdirSync(paths.exports, { recursive: true });

type VaultMeta = {
  version: 1;
  salt: string;
  passwordHash: string;
  encryptedAtRest: boolean;
};

let sqliteHandle: ReturnType<typeof openDatabase>["sqlite"] | null = null;
let dbHandle: Db | null = null;
let sessionToken: string | null = null;
let workspaceSecret: Buffer | null = null;

function readVault(): VaultMeta | null {
  if (!existsSync(VAULT_PATH)) return null;
  return JSON.parse(readFileSync(VAULT_PATH, "utf8")) as VaultMeta;
}

function writeVault(meta: VaultMeta) {
  writeFileSync(VAULT_PATH, JSON.stringify(meta, null, 2), { mode: 0o600 });
}

export function encryptBytes(plain: Buffer, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

export function decryptBytes(blob: Buffer, key: Buffer) {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const data = blob.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export function encryptSecret(plain: string, key: Buffer) {
  const blob = encryptBytes(Buffer.from(plain, "utf8"), key);
  return blob.toString("base64");
}

export function decryptSecret(payload: string, key: Buffer) {
  return decryptBytes(Buffer.from(payload, "base64"), key).toString("utf8");
}

/** Encrypt a file to sibling `.enc` and remove plaintext. */
export function sealFile(filePath: string, key: Buffer) {
  if (!existsSync(filePath)) return;
  const plain = readFileSync(filePath);
  const encPath = `${filePath}.enc`;
  writeFileSync(encPath, encryptBytes(plain, key), { mode: 0o600 });
  unlinkSync(filePath);
}

/** Decrypt `.enc` sibling back to plaintext path. */
export function openSealedFile(filePath: string, key: Buffer) {
  const encPath = `${filePath}.enc`;
  if (!existsSync(encPath)) return existsSync(filePath);
  const plain = decryptBytes(readFileSync(encPath), key);
  writeFileSync(filePath, plain, { mode: 0o600 });
  unlinkSync(encPath);
  return true;
}

function sealTree(dir: string, key: Buffer) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) sealTree(p, key);
    else if (!name.endsWith(".enc")) sealFile(p, key);
  }
}

function openTree(dir: string, key: Buffer) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) openTree(p, key);
    else if (name.endsWith(".enc")) {
      const target = p.slice(0, -4);
      openSealedFile(target, key);
    }
  }
}

function closeDbHandles() {
  if (sqliteHandle) {
    try {
      sqliteHandle.close();
    } catch {
      /* ignore */
    }
  }
  sqliteHandle = null;
  dbHandle = null;
}

function removeSidecars() {
  for (const side of [`${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
    if (existsSync(side)) unlinkSync(side);
  }
}

export function getDb(): Db {
  if (!dbHandle) {
    if (!existsSync(DB_PATH)) {
      throw new Error("Workspace locked or not initialized");
    }
    const opened = openDatabase(DB_PATH);
    sqliteHandle = opened.sqlite;
    dbHandle = opened.db;
  }
  return dbHandle;
}

export function isInitialized(): boolean {
  return Boolean(readVault()) || existsSync(DB_PATH) || existsSync(DB_ENC_PATH);
}

export function isUnlocked(): boolean {
  return Boolean(sessionToken && workspaceSecret && existsSync(DB_PATH) && dbHandle);
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

export function createSession(password: string, salt: string) {
  sessionToken = nanoid(32);
  workspaceSecret = deriveWorkspaceSecret(password, salt);
  // Persist token only — never write the workspace AES key to disk.
  // API restart requires re-unlock (secret stays in-process memory).
  writeFileSync(
    SESSION_PATH,
    JSON.stringify({
      token: sessionToken,
      createdAt: new Date().toISOString(),
      salt,
    }),
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
    const raw = JSON.parse(readFileSync(SESSION_PATH, "utf8")) as {
      token: string;
      secret?: string;
      salt?: string;
    };
    sessionToken = raw.token;
    // Legacy sessions may still contain a secret; ignore it and force re-unlock.
    if (raw.secret) {
      try {
        unlinkSync(SESSION_PATH);
      } catch {
        /* ignore */
      }
      sessionToken = null;
      workspaceSecret = null;
      return null;
    }
    return sessionToken;
  } catch {
    return null;
  }
}

export function getSessionToken() {
  return sessionToken;
}

export function getWorkspaceSecret() {
  return workspaceSecret;
}

export function setWorkspaceSecret(secret: Buffer) {
  workspaceSecret = secret;
}

export function requireSession(token: string | undefined) {
  const current = getSessionToken();
  return Boolean(current && token && current === token && workspaceSecret && existsSync(DB_PATH));
}

/** Initialize vault + open plaintext DB for first-time create/seed. */
export function bootstrapVault(password: string) {
  const { hash, salt } = hashPassword(password);
  writeVault({ version: 1, salt, passwordHash: hash, encryptedAtRest: false });
  closeDbHandles();
  if (existsSync(DB_PATH)) {
    // fresh
  }
  const opened = openDatabase(DB_PATH);
  sqliteHandle = opened.sqlite;
  dbHandle = opened.db;
  createSession(password, salt);
  return { salt, hash };
}

/** Unlock: verify password, decrypt DB + files, open handles. */
export function unlockVault(password: string) {
  let vault = readVault();

  // Migrate legacy workspace (password in SQLite, no vault.json)
  if (!vault && existsSync(DB_PATH)) {
    const opened = openDatabase(DB_PATH);
    const row = opened.db.select().from(workspace).limit(1).all()[0];
    if (!row || !verifyPassword(password, row.passwordHash, row.passwordSalt)) {
      opened.sqlite.close();
      throw new Error("Invalid password");
    }
    vault = {
      version: 1,
      salt: row.passwordSalt,
      passwordHash: row.passwordHash,
      encryptedAtRest: false,
    };
    writeVault(vault);
    opened.sqlite.close();
  }

  if (!vault) throw new Error("Workspace not initialized");
  if (!verifyPassword(password, vault.passwordHash, vault.salt)) {
    throw new Error("Invalid password");
  }

  const secret = deriveWorkspaceSecret(password, vault.salt);
  closeDbHandles();

  if (existsSync(DB_ENC_PATH)) {
    const plain = decryptBytes(readFileSync(DB_ENC_PATH), secret);
    writeFileSync(DB_PATH, plain, { mode: 0o600 });
    unlinkSync(DB_ENC_PATH);
  } else if (!existsSync(DB_PATH)) {
    throw new Error("No database found");
  }

  openTree(paths.files, secret);

  const opened = openDatabase(DB_PATH);
  sqliteHandle = opened.sqlite;
  dbHandle = opened.db;
  createSession(password, vault.salt);
  writeVault({ ...vault, encryptedAtRest: false });
  return getSessionToken()!;
}

/** Lock: checkpoint/close DB, encrypt at rest, clear session. */
export function lockVault() {
  const secret = getWorkspaceSecret();
  const vault = readVault();
  if (!secret || !vault) {
    clearSession();
    closeDbHandles();
    return;
  }

  try {
    if (sqliteHandle) {
      sqliteHandle.pragma("wal_checkpoint(TRUNCATE)");
    }
  } catch {
    /* ignore */
  }
  closeDbHandles();
  removeSidecars();

  if (existsSync(DB_PATH)) {
    const plain = readFileSync(DB_PATH);
    writeFileSync(DB_ENC_PATH, encryptBytes(plain, secret), { mode: 0o600 });
    unlinkSync(DB_PATH);
  }

  sealTree(paths.files, secret);
  writeVault({ ...vault, encryptedAtRest: true });
  clearSession();
}

export function encryptionStatus() {
  const vault = readVault();
  return {
    hasVault: Boolean(vault),
    encryptedAtRest: Boolean(vault?.encryptedAtRest) || existsSync(DB_ENC_PATH),
    plaintextDbPresent: existsSync(DB_PATH),
  };
}

export function writeEncryptedDocument(filename: string, data: Buffer) {
  const secret = getWorkspaceSecret();
  if (!secret) throw new Error("Workspace locked");
  const safe = basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageName = `${nanoid(8)}_${safe}`;
  const storagePath = join(paths.documents, storageName);
  writeFileSync(storagePath, data, { mode: 0o600 });
  // while unlocked we keep plaintext working copy; sealed on lock
  return { storagePath, storageName, byteSize: data.length };
}

export function readDocumentFile(storagePath: string) {
  const secret = getWorkspaceSecret();
  if (existsSync(storagePath)) return readFileSync(storagePath);
  if (existsSync(`${storagePath}.enc`) && secret) {
    openSealedFile(storagePath, secret);
    return readFileSync(storagePath);
  }
  throw new Error("Document not found");
}

export function nowIso() {
  return new Date().toISOString();
}

export function id(prefix?: string) {
  return prefix ? `${prefix}_${nanoid(10)}` : nanoid(12);
}

export function checksum(payload: string | Buffer) {
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
  db.insert(activityEvents)
    .values({
      id: eventId,
      action,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      detailJson: JSON.stringify(detail),
      prevHash,
      hash,
      createdAt,
    })
    .run();
  if (ws) {
    db.update(workspace).set({ lastActivityHash: hash }).where(eq(workspace.id, ws.id)).run();
  }
  return hash;
}

/** Ensure DB is open only when this process holds the in-memory secret (post-unlock). */
export function ensureOpenFromSession() {
  // Drop legacy sessions that stored the AES key on disk.
  if (existsSync(SESSION_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(SESSION_PATH, "utf8")) as { secret?: string };
      if (raw.secret) unlinkSync(SESSION_PATH);
    } catch {
      /* ignore */
    }
  }
  if (sessionToken && workspaceSecret && existsSync(DB_PATH) && !dbHandle) {
    const opened = openDatabase(DB_PATH);
    sqliteHandle = opened.sqlite;
    dbHandle = opened.db;
  }
}

ensureOpenFromSession();
