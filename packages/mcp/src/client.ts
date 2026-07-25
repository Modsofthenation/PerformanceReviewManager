import { readFileSync, realpathSync } from "node:fs";
import { basename, resolve, sep } from "node:path";

export type PrmClientOptions = {
  baseUrl?: string;
  password?: string;
  token?: string | null;
};

export class PrmApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "PrmApiError";
  }
}

function assertUploadPathAllowed(filePath: string) {
  const resolved = realpathSync(resolve(filePath));
  const roots = (process.env.PRM_UPLOAD_ROOTS ?? "")
    .split(":")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((r) => realpathSync(resolve(r)));
  const defaults = [realpathSync(resolve(process.cwd())), realpathSync("/tmp")];
  const allow = [...defaults, ...roots];
  const ok = allow.some((root) => resolved === root || resolved.startsWith(root + sep));
  if (!ok) {
    throw new Error(
      `filePath not under allowed roots (cwd, /tmp, or PRM_UPLOAD_ROOTS): ${resolved}`,
    );
  }
  return resolved;
}

/**
 * Thin HTTP client for the local PRM API (http://127.0.0.1:8787).
 * Handles unlock + token reuse so MCP tools can mutate the vault.
 */
export class PrmClient {
  readonly baseUrl: string;
  private password: string | null;
  private token: string | null;

  constructor(opts: PrmClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.PRM_API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
    this.password = opts.password ?? process.env.PRM_PASSWORD ?? null;
    this.token = opts.token ?? process.env.PRM_TOKEN ?? null;
  }

  getSessionToken() {
    return this.token;
  }

  async status() {
    return this.requestJson<Record<string, unknown>>("GET", "/api/workspace/status", { auth: false });
  }

  async unlock(password?: string) {
    const pw = password ?? this.password;
    if (!pw) {
      throw new Error(
        "Password required. Call prm_unlock with password, or set PRM_PASSWORD (no demo default).",
      );
    }
    const res = await this.requestJson<{ token: string; name?: string }>("POST", "/api/workspace/unlock", {
      auth: false,
      body: { password: pw },
    });
    this.token = res.token;
    this.password = pw;
    return res;
  }

  /**
   * Reuse an existing token when the vault is already unlocked.
   * Does not auto-unlock with a default password — call prm_unlock explicitly.
   */
  async ensureUnlocked() {
    const s = await this.status();
    if (!s.initialized) {
      throw new Error("Workspace is not initialized. Open the UI (or POST /api/workspace/init) first.");
    }
    if (this.token && s.unlocked) {
      try {
        await this.rawJson("GET", "/api/people", { auth: true });
        return { token: this.token, reused: true as const };
      } catch {
        this.token = null;
      }
    }
    if (this.password) {
      const unlocked = await this.unlock();
      return { token: unlocked.token, reused: false as const, name: unlocked.name };
    }
    throw new Error("Vault locked. Call prm_unlock with the workspace password (or set PRM_PASSWORD).");
  }

  async listPeople() {
    return this.requestJson<Array<Record<string, unknown>>>("GET", "/api/people");
  }

  async getPerson(personId: string) {
    return this.requestJson<Record<string, unknown>>("GET", `/api/people/${encodeURIComponent(personId)}`);
  }

  async getDossier(personId: string) {
    return this.requestJson<Record<string, unknown>>("GET", `/api/people/${encodeURIComponent(personId)}/dossier`);
  }

  async getPacket(cycleId: string, personId: string) {
    return this.requestJson<{
      managerReview: { payload: Record<string, unknown> } | null;
    }>("GET", `/api/packets/${encodeURIComponent(cycleId)}/${encodeURIComponent(personId)}`);
  }

  async createPerson(body: {
    name: string;
    email?: string;
    title?: string;
    levelKey?: string;
    managerId?: string;
    hireDate?: string;
  }) {
    return this.requestJson<Record<string, unknown>>("POST", "/api/people", { body });
  }

  async listRoles() {
    return this.requestJson<Array<Record<string, unknown>>>("GET", "/api/roles");
  }

  async assignRole(body: {
    personId: string;
    roleDefinitionId: string;
    targetNextRoleDefinitionId?: string | null;
  }) {
    return this.requestJson<{ ok: true; assignmentId: string }>("POST", "/api/roles/assign", { body });
  }

  async listCycles() {
    return this.requestJson<Array<Record<string, unknown>>>("GET", "/api/cycles");
  }

  async createCycle(body: {
    name: string;
    windowStart: string;
    windowEnd: string;
    includeDirects?: boolean;
  }) {
    return this.requestJson<{ id: string }>("POST", "/api/cycles", { body });
  }

  async addAchievement(
    personId: string,
    body: { title: string; description?: string; occurredAt?: string },
  ) {
    return this.requestJson<{ id: string }>("POST", `/api/people/${encodeURIComponent(personId)}/achievements`, {
      body,
    });
  }

  async addGoal(personId: string, body: { title: string; description?: string; status?: string }) {
    return this.requestJson<{ id: string }>("POST", `/api/people/${encodeURIComponent(personId)}/goals`, { body });
  }

  async addFeedback(
    personId: string,
    body: {
      body: string;
      fromName?: string;
      kind?: string;
      visibility?: string;
      occurredAt?: string;
    },
  ) {
    return this.requestJson<{ id: string }>("POST", `/api/people/${encodeURIComponent(personId)}/feedback`, {
      body,
    });
  }

  async uploadDocument(
    personId: string,
    opts: { filePath: string; title?: string; visibility?: string; occurredAt?: string },
  ) {
    await this.ensureUnlocked();
    if (!this.token) throw new Error("Not unlocked");

    const safePath = assertUploadPathAllowed(opts.filePath);
    const bytes = readFileSync(safePath);
    const filename = basename(safePath);
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)]), filename);
    if (opts.title) form.append("title", opts.title);
    if (opts.visibility) form.append("visibility", opts.visibility);
    if (opts.occurredAt) form.append("occurredAt", opts.occurredAt);

    const res = await fetch(`${this.baseUrl}/api/people/${encodeURIComponent(personId)}/documents`, {
      method: "POST",
      headers: { "x-prm-token": this.token },
      body: form,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new PrmApiError(
        typeof (json as { error?: string }).error === "string"
          ? (json as { error: string }).error
          : `Upload failed (${res.status})`,
        res.status,
        json,
      );
    }
    return json as { id: string; title: string; byteSize: number; checksum: string };
  }

  async importBundle(bundle: Record<string, unknown>, sourceFilename?: string) {
    return this.requestJson<{ bundleId: string; reviewId: string }>("POST", "/api/bundles/import", {
      body: { bundle, sourceFilename },
    });
  }

  async upsertManagerReview(body: {
    cycleId: string;
    subjectPersonId: string;
    payload: Record<string, unknown>;
    status?: string;
    gapAssessments?: Array<{ roleExpectationId: string; mark: string }>;
  }) {
    return this.requestJson<{ id: string }>("PUT", "/api/reviews/manager", { body });
  }

  async createPromotion(body: { personId: string; cycleId?: string }) {
    return this.requestJson<{ id: string; reviewId: string }>("POST", "/api/promotions", { body });
  }

  async resolvePersonId(personId?: string, personName?: string) {
    if (personId) return personId;
    if (!personName) throw new Error("personId or personName is required");
    const people = await this.listPeople();
    const needle = personName.trim().toLowerCase();
    const exact = people.filter((p) => String(p.name ?? "").toLowerCase() === needle);
    if (exact.length === 1) return String(exact[0].id);
    if (exact.length > 1) {
      throw new Error(`Multiple people named "${personName}". Pass personId instead.`);
    }
    const partial = people.filter((p) => String(p.name ?? "").toLowerCase().includes(needle));
    if (partial.length === 1) return String(partial[0].id);
    if (partial.length > 1) {
      throw new Error(
        `Ambiguous person "${personName}". Matches: ${partial.map((p) => `${p.name} (${p.id})`).join(", ")}`,
      );
    }
    throw new Error(`No person found matching "${personName}". Use prm_list_people.`);
  }

  private async requestJson<T>(
    method: string,
    path: string,
    opts: { body?: unknown; auth?: boolean } = {},
  ): Promise<T> {
    const needAuth = opts.auth !== false;
    if (needAuth) await this.ensureUnlocked();
    return this.rawJson<T>(method, path, { ...opts, auth: needAuth });
  }

  private async rawJson<T>(
    method: string,
    path: string,
    opts: { body?: unknown; auth?: boolean } = {},
  ): Promise<T> {
    const needAuth = opts.auth === true;
    const headers: Record<string, string> = { accept: "application/json" };
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    if (needAuth) {
      if (!this.token) throw new Error("Not unlocked — call prm_unlock first");
      headers["x-prm-token"] = this.token;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && needAuth) {
        this.token = null;
      }
      throw new PrmApiError(
        typeof (json as { error?: string }).error === "string"
          ? (json as { error: string }).error
          : `PRM API ${method} ${path} failed (${res.status})`,
        res.status,
        json,
      );
    }
    return json as T;
  }
}

export function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function errorResult(err: unknown) {
  const message =
    err instanceof PrmApiError
      ? `${err.message}${err.body ? `\n${JSON.stringify(err.body, null, 2)}` : ""}`
      : err instanceof Error
        ? err.message
        : String(err);
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}
