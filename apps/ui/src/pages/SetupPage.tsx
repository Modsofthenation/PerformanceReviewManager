import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import type {
  OnboardingStateDTO,
  PeopleImportResult,
  PersonDTO,
  RoleDefinitionDTO,
} from "@prm/shared";
import { api } from "../lib/api";

const LEVELS = ["IC1", "IC2", "IC3", "IC4", "IC5", "IC6", "L1", "M1", "M2", "M3"];

const STEPS = [
  { id: "team", label: "Team" },
  { id: "roles", label: "Roles" },
  { id: "ai", label: "AI" },
  { id: "integrations", label: "Integrations" },
  { id: "backfill", label: "Backfill" },
  { id: "done", label: "Done" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

type AssignDraft = { roleId: string; nextId: string };

type ThinItem = {
  personId: string;
  name: string;
  evidenceCount: number;
  thin: boolean;
  achievementCount: number;
  feedbackCount: number;
};

type AiForm = {
  enabled: boolean;
  provider: string;
  modelDigest: string;
  modelDraft: string;
  localOnly: boolean;
  ollamaBaseUrl: string;
};

const INTEGRATION_GUIDES: Record<
  string,
  { title: string; blurb: string; steps: string[]; links: Array<{ label: string; href: string }> }
> = {
  jira: {
    title: "Jira Cloud",
    blurb: "Pulls cycle-window issues (and optional comments) into dossier achievements.",
    steps: [
      "Open your Jira site (https://your-domain.atlassian.net).",
      "Click your avatar → Account settings → Security → Create and manage API tokens.",
      "Create a token, copy it once, and paste it below with your Atlassian account email.",
      "Site URL is the full https://…atlassian.net host (no trailing path).",
      "After save + Test, link each direct on their person page, then Sync.",
    ],
    links: [
      { label: "Create Atlassian API token", href: "https://id.atlassian.com/manage-profile/security/api-tokens" },
      { label: "Jira Cloud REST docs", href: "https://developer.atlassian.com/cloud/jira/platform/rest/v3/" },
    ],
  },
  bitbucket: {
    title: "Bitbucket Cloud",
    blurb: "Imports merged PRs in the active cycle window as achievements.",
    steps: [
      "Note your workspace slug from bitbucket.org/your-workspace/….",
      "Avatar → Personal settings → App passwords → Create app password.",
      "Grant read access for repositories and pull requests.",
      "Use your Bitbucket username (not email) plus the app password.",
      "Link accounts on each person page before Sync all.",
    ],
    links: [
      {
        label: "Create Bitbucket app password",
        href: "https://bitbucket.org/account/settings/app-passwords/",
      },
    ],
  },
  github: {
    title: "GitHub",
    blurb: "Imports merged PRs for linked GitHub users in the cycle window.",
    steps: [
      "GitHub → Settings → Developer settings → Personal access tokens.",
      "Classic PAT: enable repo (private) or public_repo as needed.",
      "Fine-grained: grant read access to the repositories you care about.",
      "Optional org slug scopes searches; API base defaults to https://api.github.com.",
      "Link GitHub users on person pages, then Sync.",
    ],
    links: [
      { label: "GitHub personal access tokens", href: "https://github.com/settings/tokens" },
    ],
  },
  linear: {
    title: "Linear",
    blurb: "Imports completed issues assigned to linked Linear users.",
    steps: [
      "Linear → Settings → API → Personal API keys.",
      "Create a key (starts with lin_api_…) and paste it below.",
      "GraphQL endpoint defaults to https://api.linear.app/graphql.",
      "Link Linear users on person pages before syncing.",
    ],
    links: [{ label: "Linear API keys", href: "https://linear.app/settings/account/security/api-keys" }],
  },
};

async function persistStep(step: StepId, extra?: { completed?: boolean; skipped?: Partial<Record<string, boolean>> }) {
  await api("/api/onboarding", {
    method: "PUT",
    body: JSON.stringify({ step, ...extra }),
  });
}

export function SetupPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<OnboardingStateDTO | null>(null);
  const [step, setStep] = useState<StepId>("team");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadStatus() {
    const data = await api<OnboardingStateDTO>("/api/onboarding");
    setStatus(data);
    if (data.completed) {
      navigate("/", { replace: true });
      return data;
    }
    const allowed = STEPS.map((s) => s.id);
    const next = allowed.includes(data.step as StepId) ? (data.step as StepId) : "team";
    setStep(next);
    return data;
  }

  useEffect(() => {
    void loadStatus().catch((e) => setMsg(e instanceof Error ? e.message : "Failed to load setup"));
  }, []);

  async function go(next: StepId, opts?: { skipped?: Partial<Record<string, boolean>>; completed?: boolean }) {
    setBusy(true);
    setMsg(null);
    try {
      await persistStep(next, opts);
      if (opts?.completed) {
        navigate("/", { replace: true });
        return;
      }
      setStep(next);
      await loadStatus();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save progress");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    await go("done", { completed: true });
  }

  async function skipCurrent() {
    const idx = STEPS.findIndex((s) => s.id === step);
    const next = STEPS[Math.min(idx + 1, STEPS.length - 1)]!.id;
    await go(next, { skipped: { [step]: true } });
  }

  if (!status) {
    return (
      <div className="setup-shell">
        <p className="muted">Loading setup…</p>
      </div>
    );
  }

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="setup-shell">
      <header className="setup-header">
        <div>
          <p className="setup-kicker">Workspace setup</p>
          <h1>{status.workspaceName ?? "Your team"}</h1>
          <p className="muted" style={{ margin: 0 }}>
            One path: team → roles → optional AI & integrations → evidence. Catalog edits stay secondary.
          </p>
        </div>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => void finish()}>
          Skip setup
        </button>
      </header>

      <ol className="setup-steps" aria-label="Setup progress">
        {STEPS.map((s, i) => {
          const done = i < stepIndex || Boolean(status.skipped?.[s.id]);
          const current = s.id === step;
          return (
            <li key={s.id} className={`setup-step${current ? " on" : ""}${done && !current ? " done" : ""}`}>
              <button type="button" disabled={busy} onClick={() => void go(s.id)}>
                <span className="setup-step-num">{i + 1}</span>
                <span>{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {msg && <p className="muted">{msg}</p>}

      <div className="setup-panel panel stack">
        {step === "team" && (
          <TeamStep
            onContinue={() => void go("roles")}
            onChanged={() => void loadStatus()}
            busy={busy}
          />
        )}
        {step === "roles" && (
          <RolesStep
            onContinue={() => void go("ai")}
            onSkip={() => void skipCurrent()}
            busy={busy}
          />
        )}
        {step === "ai" && (
          <AiStep
            onContinue={() => void go("integrations")}
            onSkip={() => void skipCurrent()}
            busy={busy}
          />
        )}
        {step === "integrations" && (
          <IntegrationsStep
            onContinue={() => void go("backfill")}
            onSkip={() => void skipCurrent()}
            busy={busy}
          />
        )}
        {step === "backfill" && (
          <BackfillStep
            onContinue={() => void go("done")}
            onSkip={() => void skipCurrent()}
            busy={busy}
          />
        )}
        {step === "done" && <DoneStep status={status} onFinish={() => void finish()} busy={busy} />}
      </div>
    </div>
  );
}

function StepChrome({
  title,
  detail,
  children,
  primary,
  secondary,
}: {
  title: string;
  detail: string;
  children: ReactNode;
  primary?: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <>
      <div>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <p className="muted" style={{ margin: "0.35rem 0 0" }}>
          {detail}
        </p>
      </div>
      {children}
      {(primary || secondary) && (
        <div className="cta-primary-row">
          {secondary}
          {primary}
        </div>
      )}
    </>
  );
}

function TeamStep({
  onContinue,
  onChanged,
  busy,
}: {
  onContinue: () => void;
  onChanged: () => void;
  busy: boolean;
}) {
  const [people, setPeople] = useState<PersonDTO[]>([]);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [levelKey, setLevelKey] = useState("IC3");
  const [csvText, setCsvText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);

  async function load() {
    setPeople(await api<PersonDTO[]>("/api/people"));
  }

  useEffect(() => {
    void load();
  }, []);

  const em = people.find((p) => !p.managerId);
  const directs = people.filter((p) => p.managerId);

  async function addPerson(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLocalBusy(true);
    setMsg(null);
    try {
      await api("/api/people", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          title: title.trim() || undefined,
          levelKey,
          managerId: em?.id,
        }),
      });
      setName("");
      setTitle("");
      await load();
      onChanged();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not add person");
    } finally {
      setLocalBusy(false);
    }
  }

  async function importCsv(e: FormEvent) {
    e.preventDefault();
    if (!csvText.trim()) return;
    setLocalBusy(true);
    setMsg(null);
    try {
      const result = await api<PeopleImportResult>("/api/people/import", {
        method: "POST",
        body: JSON.stringify({ csv: csvText }),
      });
      setMsg(`Created ${result.created.length}, skipped ${result.skipped.length}, errors ${result.errors.length}`);
      if (result.created.length) {
        setCsvText("");
        await load();
        onChanged();
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLocalBusy(false);
    }
  }

  return (
    <StepChrome
      title="Add your team"
      detail="Confirm yourself as EM, then add directs one-by-one or paste a CSV. Roles come next."
      primary={
        <button className="btn" type="button" disabled={busy || directs.length === 0} onClick={onContinue}>
          Continue to roles
        </button>
      }
      secondary={
        directs.length === 0 ? (
          <span className="muted">Add at least one direct to continue.</span>
        ) : (
          <span className="muted">
            {em ? `EM: ${em.name}` : "No EM yet"} · {directs.length} direct{directs.length === 1 ? "" : "s"}
          </span>
        )
      }
    >
      {em ? (
        <p style={{ margin: 0 }}>
          EM account: <strong>{em.name}</strong>
          {em.title ? ` · ${em.title}` : ""}
        </p>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          First person without a manager becomes EM — add yourself below if create skipped your name.
        </p>
      )}

      <form className="stack" onSubmit={addPerson}>
        <div className="grid-2">
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Maya Chen" />
          </div>
          <div className="field">
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Software Engineer" />
          </div>
          <div className="field">
            <label>Level</label>
            <select value={levelKey} onChange={(e) => setLevelKey(e.target.value)}>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button className="btn" disabled={localBusy || !name.trim()}>
          {em ? "Add direct" : "Add as EM"}
        </button>
      </form>

      {directs.length > 0 && (
        <ul className="setup-person-list">
          {directs.map((p) => (
            <li key={p.id}>
              <strong>{p.name}</strong>
              <span className="muted">
                {p.title ?? "—"}
                {p.levelKey ? ` · ${p.levelKey}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      <details className="setup-details">
        <summary>Paste CSV instead</summary>
        <form className="stack" onSubmit={importCsv} style={{ marginTop: "0.75rem" }}>
          <p className="muted" style={{ margin: 0 }}>
            Columns: name,email,title,levelKey,hireDate. EM must already exist.
          </p>
          <textarea
            rows={5}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={"name,email,title,levelKey,hireDate\nMaya Chen,maya@example.com,SWE,IC4,2024-03-01"}
          />
          <button className="btn secondary" disabled={localBusy || !csvText.trim() || !em}>
            Import CSV
          </button>
        </form>
      </details>
      {msg && <p className="muted">{msg}</p>}
    </StepChrome>
  );
}

function RolesStep({
  onContinue,
  onSkip,
  busy,
}: {
  onContinue: () => void;
  onSkip: () => void;
  busy: boolean;
}) {
  const [roles, setRoles] = useState<RoleDefinitionDTO[]>([]);
  const [people, setPeople] = useState<PersonDTO[]>([]);
  const [drafts, setDrafts] = useState<Record<string, AssignDraft>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);

  async function load() {
    const [r, p] = await Promise.all([
      api<RoleDefinitionDTO[]>("/api/roles"),
      api<PersonDTO[]>("/api/people"),
    ]);
    const directs = p.filter((x) => x.managerId);
    setRoles(r);
    setPeople(directs);
    const next: Record<string, AssignDraft> = {};
    for (const person of directs) {
      next[person.id] = {
        roleId: person.roleDefinitionId ?? "",
        nextId: person.targetNextRoleDefinitionId ?? "",
      };
    }
    setDrafts(next);
  }

  useEffect(() => {
    void load().catch((e) => setMsg(e instanceof Error ? e.message : "Failed to load roles"));
  }, []);

  const unassigned = useMemo(
    () => people.filter((p) => !drafts[p.id]?.roleId && !p.roleDefinitionId),
    [people, drafts],
  );

  async function saveAll() {
    const assignments = people
      .map((p) => {
        const d = drafts[p.id];
        if (!d?.roleId) return null;
        return {
          personId: p.id,
          roleDefinitionId: d.roleId,
          targetNextRoleDefinitionId: d.nextId || null,
        };
      })
      .filter(Boolean) as Array<{
      personId: string;
      roleDefinitionId: string;
      targetNextRoleDefinitionId: string | null;
    }>;
    if (!assignments.length) {
      setMsg("Pick a current role for at least one person.");
      return;
    }
    setLocalBusy(true);
    setMsg(null);
    try {
      const res = await api<{ saved: number; errors: string[] }>("/api/roles/assign-bulk", {
        method: "POST",
        body: JSON.stringify({ assignments }),
      });
      setMsg(`Saved ${res.saved} assignment${res.saved === 1 ? "" : "s"}`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Assign failed");
    } finally {
      setLocalBusy(false);
    }
  }

  return (
    <StepChrome
      title="Assign roles"
      detail="PE Engineering Career Framework is already loaded. Tag each direct with a current role (optional next). Editing definitions is optional."
      primary={
        <button
          className="btn"
          type="button"
          disabled={busy || localBusy || people.some((p) => !drafts[p.id]?.roleId)}
          onClick={async () => {
            await saveAll();
            onContinue();
          }}
        >
          Save & continue
        </button>
      }
      secondary={
        <>
          <button className="btn secondary" type="button" disabled={localBusy} onClick={() => void saveAll()}>
            Save assignments
          </button>
          <button className="btn ghost" type="button" disabled={busy} onClick={onSkip}>
            Skip for now
          </button>
        </>
      }
    >
      {unassigned.length > 0 && (
        <p className="muted" style={{ margin: 0 }}>
          {unassigned.length} still need a current role before you continue.
        </p>
      )}

      {people.length === 0 ? (
        <p className="muted">Add directs on the Team step first.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Current role</th>
                <th>Next (optional)</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const d = drafts[p.id] ?? { roleId: "", nextId: "" };
                return (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      {!p.roleDefinitionId && !d.roleId ? (
                        <div>
                          <span className="status-pill warn">needs role</span>
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <select
                        value={d.roleId}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [p.id]: { roleId: e.target.value, nextId: "" },
                          }))
                        }
                      >
                        <option value="">Select…</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.levelKey ? `${r.levelKey} · ` : ""}
                            {r.title}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={d.nextId}
                        disabled={!d.roleId}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [p.id]: { ...d, nextId: e.target.value },
                          }))
                        }
                      >
                        <option value="">—</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.levelKey ? `${r.levelKey} · ` : ""}
                            {r.title}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <details className="setup-details" open={showCatalog} onToggle={(e) => setShowCatalog((e.target as HTMLDetailsElement).open)}>
        <summary>Advanced: browse / edit role catalog</summary>
        <p className="muted">
          {roles.length} roles loaded. Full create/edit/extract tools live on{" "}
          <Link to="/roles">Roles</Link> — assignment above is the primary job here.
        </p>
        <ul>
          {roles.slice(0, 12).map((r) => (
            <li key={r.id}>
              <strong>
                {r.levelKey ? `${r.levelKey} · ` : ""}
                {r.title}
              </strong>{" "}
              <span className="muted">{r.track}</span>
            </li>
          ))}
          {roles.length > 12 && <li className="muted">…and {roles.length - 12} more</li>}
        </ul>
      </details>
      {msg && <p className="muted">{msg}</p>}
    </StepChrome>
  );
}

function AiStep({
  onContinue,
  onSkip,
  busy,
}: {
  onContinue: () => void;
  onSkip: () => void;
  busy: boolean;
}) {
  const [form, setForm] = useState<AiForm>({
    enabled: true,
    provider: "anthropic",
    modelDigest: "claude-sonnet-4-5",
    modelDraft: "claude-sonnet-4-5",
    localOnly: false,
    ollamaBaseUrl: "http://127.0.0.1:11434",
  });
  const [apiKey, setApiKey] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);

  useEffect(() => {
    void api<{
      enabled: boolean;
      provider: string;
      modelDigest?: string;
      modelDraft?: string;
      localOnly: boolean;
      ollamaBaseUrl?: string;
      hasApiKey: boolean;
    }>("/api/ai/settings").then((s) => {
      setForm({
        enabled: Boolean(s.enabled) || !s.hasApiKey,
        provider: s.provider || "anthropic",
        modelDigest: s.modelDigest || "claude-sonnet-4-5",
        modelDraft: s.modelDraft || "claude-sonnet-4-5",
        localOnly: s.localOnly,
        ollamaBaseUrl: s.ollamaBaseUrl || "http://127.0.0.1:11434",
      });
    });
  }, []);

  async function saveAndTest() {
    setLocalBusy(true);
    setMsg(null);
    try {
      await api("/api/ai/settings", {
        method: "PUT",
        body: JSON.stringify({
          ...form,
          apiKey: apiKey || undefined,
        }),
      });
      setApiKey("");
      if (form.provider === "ollama" || form.localOnly || apiKey || form.enabled) {
        const res = await api<{ ok: boolean; error?: string; model?: string }>("/api/ai/test", {
          method: "POST",
          body: "{}",
        });
        setMsg(res.ok ? `Connected (${res.model ?? "ok"})` : res.error ?? "Test failed");
        if (res.ok) onContinue();
      } else {
        setMsg("Saved — add a key to test, or skip.");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setLocalBusy(false);
    }
  }

  return (
    <StepChrome
      title="Optional: AI for digests & drafts"
      detail="Writing desk works without AI. Enable a provider when you want grounded suggestions — you can change this later in Settings."
      primary={
        <button className="btn" type="button" disabled={busy || localBusy} onClick={() => void saveAndTest()}>
          {localBusy ? "Saving…" : "Save & continue"}
        </button>
      }
      secondary={
        <button className="btn ghost" type="button" disabled={busy} onClick={onSkip}>
          Skip AI for now
        </button>
      }
    >
      <div className="field">
        <label>
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />{" "}
          Enable AI features
        </label>
      </div>
      <div className="field">
        <label>Provider</label>
        <select
          value={form.provider}
          onChange={(e) => {
            const provider = e.target.value;
            setForm({
              ...form,
              provider,
              modelDigest:
                provider === "cursor"
                  ? ""
                  : provider === "openai" || provider === "openai_compatible"
                    ? "gpt-4o-mini"
                    : provider === "ollama"
                      ? "llama3.1"
                      : "claude-sonnet-4-5",
              modelDraft:
                provider === "cursor"
                  ? ""
                  : provider === "openai" || provider === "openai_compatible"
                    ? "gpt-4o-mini"
                    : provider === "ollama"
                      ? "llama3.1"
                      : "claude-sonnet-4-5",
              ollamaBaseUrl:
                provider === "openai_compatible"
                  ? form.ollamaBaseUrl && form.ollamaBaseUrl !== "http://127.0.0.1:11434"
                    ? form.ollamaBaseUrl
                    : ""
                  : form.ollamaBaseUrl || "http://127.0.0.1:11434",
            });
          }}
        >
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
          <option value="cursor">Cursor Cloud Agents</option>
          <option value="openai_compatible">OpenAI-compatible gateway</option>
          <option value="ollama">Ollama (local)</option>
        </select>
      </div>
      {form.provider === "cursor" && (
        <p className="muted" style={{ margin: 0 }}>
          Uses a dashboard <code>crsr_…</code> key with the Cloud Agents API (no-repo agents). Leave models blank for
          your Cursor default. Get a key at{" "}
          <a href="https://cursor.com/dashboard/api" target="_blank" rel="noreferrer">
            cursor.com/dashboard/api
          </a>
          .
        </p>
      )}
      {form.provider !== "ollama" && (
        <div className="field">
          <label>API key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              form.provider === "cursor"
                ? "crsr_…"
                : form.provider === "anthropic"
                  ? "sk-ant-…"
                  : "sk-…"
            }
          />
        </div>
      )}
      {(form.provider === "ollama" || form.provider === "openai_compatible") && (
        <div className="field">
          <label>{form.provider === "openai_compatible" ? "Gateway base URL" : "Ollama base URL"}</label>
          <input
            value={form.ollamaBaseUrl}
            onChange={(e) => setForm({ ...form, ollamaBaseUrl: e.target.value })}
            placeholder={
              form.provider === "openai_compatible"
                ? "https://gateway.example/v1"
                : "http://127.0.0.1:11434"
            }
            required={form.provider === "openai_compatible"}
          />
        </div>
      )}
      <div className="field">
        <label>
          <input
            type="checkbox"
            checked={form.localOnly}
            onChange={(e) => setForm({ ...form, localOnly: e.target.checked })}
          />{" "}
          Local-only (block cloud providers)
        </label>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Keys are encrypted with your workspace secret. Private notes stay off cloud by default until you opt in under
        Settings → AI. Cursor Cloud Agents runs are slower than Anthropic/OpenAI chat.
      </p>
      {msg && <p className="muted">{msg}</p>}
    </StepChrome>
  );
}

function IntegrationsStep({
  onContinue,
  onSkip,
  busy,
}: {
  onContinue: () => void;
  onSkip: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState<string | null>("jira");
  const [msg, setMsg] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);

  // Minimal per-provider forms
  const [jira, setJira] = useState({ enabled: false, baseUrl: "", authEmail: "", token: "" });
  const [bitbucket, setBitbucket] = useState({
    enabled: false,
    workspaceSlug: "",
    authUsername: "",
    token: "",
  });
  const [github, setGithub] = useState({ enabled: false, workspaceSlug: "", baseUrl: "https://api.github.com", token: "" });
  const [linear, setLinear] = useState({
    enabled: false,
    baseUrl: "https://api.linear.app/graphql",
    token: "",
  });

  useEffect(() => {
    void api<{
      jira: { enabled: boolean; baseUrl: string | null; authEmail: string | null; hasToken: boolean };
      bitbucket: {
        enabled: boolean;
        workspaceSlug: string | null;
        authUsername: string | null;
        hasToken: boolean;
      };
      github: { enabled: boolean; workspaceSlug: string | null; baseUrl: string | null; hasToken: boolean };
      linear?: { enabled: boolean; baseUrl: string | null; hasToken: boolean };
    }>("/api/integrations").then((s) => {
      setJira((j) => ({
        ...j,
        enabled: s.jira.enabled,
        baseUrl: s.jira.baseUrl ?? "",
        authEmail: s.jira.authEmail ?? "",
      }));
      setBitbucket((b) => ({
        ...b,
        enabled: s.bitbucket.enabled,
        workspaceSlug: s.bitbucket.workspaceSlug ?? "",
        authUsername: s.bitbucket.authUsername ?? "",
      }));
      setGithub((g) => ({
        ...g,
        enabled: s.github.enabled,
        workspaceSlug: s.github.workspaceSlug ?? "",
        baseUrl: s.github.baseUrl ?? "https://api.github.com",
      }));
      if (s.linear) {
        setLinear((l) => ({
          ...l,
          enabled: s.linear!.enabled,
          baseUrl: s.linear!.baseUrl ?? "https://api.linear.app/graphql",
        }));
      }
    });
  }, []);

  async function saveProvider(
    provider: "jira" | "bitbucket" | "github" | "linear",
    body: Record<string, unknown>,
  ) {
    setLocalBusy(true);
    setMsg(null);
    try {
      await api(`/api/integrations/${provider}`, { method: "PUT", body: JSON.stringify(body) });
      try {
        await api(`/api/integrations/${provider}/test`, { method: "POST", body: "{}" });
        setMsg(`${INTEGRATION_GUIDES[provider]?.title ?? provider} saved and connected`);
      } catch (err) {
        setMsg(
          `${INTEGRATION_GUIDES[provider]?.title ?? provider} saved — test: ${
            err instanceof Error ? err.message : "failed"
          }`,
        );
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setLocalBusy(false);
    }
  }

  return (
    <StepChrome
      title="Optional: connect trackers"
      detail="Configure zero or more providers. Link each person’s accounts later on their dossier, then sync into the active cycle window."
      primary={
        <button className="btn" type="button" disabled={busy} onClick={onContinue}>
          Continue
        </button>
      }
      secondary={
        <button className="btn ghost" type="button" disabled={busy} onClick={onSkip}>
          Skip integrations
        </button>
      }
    >
      {Object.entries(INTEGRATION_GUIDES).map(([id, guide]) => (
        <details
          key={id}
          className="setup-details"
          open={open === id}
          onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open ? id : null)}
        >
          <summary>
            <strong>{guide.title}</strong>
            <span className="muted"> — {guide.blurb}</span>
          </summary>
          <div className="stack" style={{ marginTop: "0.75rem" }}>
            <ol className="setup-guide-list">
              {guide.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <p className="muted" style={{ margin: 0 }}>
              {guide.links.map((l, i) => (
                <span key={l.href}>
                  {i > 0 ? " · " : ""}
                  <a href={l.href} target="_blank" rel="noreferrer">
                    {l.label}
                  </a>
                </span>
              ))}
            </p>

            {id === "jira" && (
              <div className="stack">
                <label className="field">
                  <span>
                    <input
                      type="checkbox"
                      checked={jira.enabled}
                      onChange={(e) => setJira({ ...jira, enabled: e.target.checked })}
                    />{" "}
                    Enable Jira
                  </span>
                </label>
                <div className="field">
                  <label>Site URL</label>
                  <input
                    value={jira.baseUrl}
                    onChange={(e) => setJira({ ...jira, baseUrl: e.target.value })}
                    placeholder="https://your-domain.atlassian.net"
                  />
                </div>
                <div className="field">
                  <label>Atlassian email</label>
                  <input
                    value={jira.authEmail}
                    onChange={(e) => setJira({ ...jira, authEmail: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>API token</label>
                  <input
                    type="password"
                    value={jira.token}
                    onChange={(e) => setJira({ ...jira, token: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={localBusy}
                  onClick={() =>
                    void saveProvider("jira", {
                      enabled: jira.enabled,
                      baseUrl: jira.baseUrl,
                      authEmail: jira.authEmail,
                      token: jira.token || undefined,
                    })
                  }
                >
                  Save Jira
                </button>
              </div>
            )}

            {id === "bitbucket" && (
              <div className="stack">
                <label className="field">
                  <span>
                    <input
                      type="checkbox"
                      checked={bitbucket.enabled}
                      onChange={(e) => setBitbucket({ ...bitbucket, enabled: e.target.checked })}
                    />{" "}
                    Enable Bitbucket
                  </span>
                </label>
                <div className="field">
                  <label>Workspace slug</label>
                  <input
                    value={bitbucket.workspaceSlug}
                    onChange={(e) => setBitbucket({ ...bitbucket, workspaceSlug: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Username</label>
                  <input
                    value={bitbucket.authUsername}
                    onChange={(e) => setBitbucket({ ...bitbucket, authUsername: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>App password</label>
                  <input
                    type="password"
                    value={bitbucket.token}
                    onChange={(e) => setBitbucket({ ...bitbucket, token: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={localBusy}
                  onClick={() =>
                    void saveProvider("bitbucket", {
                      enabled: bitbucket.enabled,
                      workspaceSlug: bitbucket.workspaceSlug,
                      authUsername: bitbucket.authUsername,
                      token: bitbucket.token || undefined,
                    })
                  }
                >
                  Save Bitbucket
                </button>
              </div>
            )}

            {id === "github" && (
              <div className="stack">
                <label className="field">
                  <span>
                    <input
                      type="checkbox"
                      checked={github.enabled}
                      onChange={(e) => setGithub({ ...github, enabled: e.target.checked })}
                    />{" "}
                    Enable GitHub
                  </span>
                </label>
                <div className="field">
                  <label>Org (optional)</label>
                  <input
                    value={github.workspaceSlug}
                    onChange={(e) => setGithub({ ...github, workspaceSlug: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>API base</label>
                  <input
                    value={github.baseUrl}
                    onChange={(e) => setGithub({ ...github, baseUrl: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Personal access token</label>
                  <input
                    type="password"
                    value={github.token}
                    onChange={(e) => setGithub({ ...github, token: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={localBusy}
                  onClick={() =>
                    void saveProvider("github", {
                      enabled: github.enabled,
                      workspaceSlug: github.workspaceSlug || null,
                      baseUrl: github.baseUrl,
                      token: github.token || undefined,
                    })
                  }
                >
                  Save GitHub
                </button>
              </div>
            )}

            {id === "linear" && (
              <div className="stack">
                <label className="field">
                  <span>
                    <input
                      type="checkbox"
                      checked={linear.enabled}
                      onChange={(e) => setLinear({ ...linear, enabled: e.target.checked })}
                    />{" "}
                    Enable Linear
                  </span>
                </label>
                <div className="field">
                  <label>GraphQL endpoint</label>
                  <input
                    value={linear.baseUrl}
                    onChange={(e) => setLinear({ ...linear, baseUrl: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>API key</label>
                  <input
                    type="password"
                    value={linear.token}
                    onChange={(e) => setLinear({ ...linear, token: e.target.value })}
                    placeholder="lin_api_…"
                  />
                </div>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={localBusy}
                  onClick={() =>
                    void saveProvider("linear", {
                      enabled: linear.enabled,
                      baseUrl: linear.baseUrl,
                      token: linear.token || undefined,
                    })
                  }
                >
                  Save Linear
                </button>
              </div>
            )}
          </div>
        </details>
      ))}
      {msg && <p className="muted">{msg}</p>}
    </StepChrome>
  );
}

function BackfillStep({
  onContinue,
  onSkip,
  busy,
}: {
  onContinue: () => void;
  onSkip: () => void;
  busy: boolean;
}) {
  const [items, setItems] = useState<ThinItem[]>([]);
  const [thinCount, setThinCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [achTitle, setAchTitle] = useState("");
  const [achDesc, setAchDesc] = useState("");
  const [fbBody, setFbBody] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);

  async function load() {
    const res = await api<{ thinCount: number; items: ThinItem[] }>("/api/workspace/thin-dossiers");
    setItems(res.items);
    setThinCount(res.thinCount);
    if (!selectedId && res.items[0]) setSelectedId(res.items[0].personId);
    else if (selectedId && !res.items.some((i) => i.personId === selectedId) && res.items[0]) {
      setSelectedId(res.items[0].personId);
    }
  }

  useEffect(() => {
    void load().catch((e) => setMsg(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  const selected = items.find((i) => i.personId === selectedId) ?? null;
  const filled = Math.max(0, items.length - thinCount);
  const pct = items.length ? Math.round((filled / items.length) * 100) : 100;

  async function addAchievement() {
    if (!selectedId || !achTitle.trim()) return;
    setLocalBusy(true);
    try {
      await api(`/api/people/${selectedId}/achievements`, {
        method: "POST",
        body: JSON.stringify({ title: achTitle.trim(), description: achDesc.trim() || undefined }),
      });
      setAchTitle("");
      setAchDesc("");
      setMsg(`Added achievement for ${selected?.name}`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setLocalBusy(false);
    }
  }

  async function addFeedback() {
    if (!selectedId || !fbBody.trim()) return;
    setLocalBusy(true);
    try {
      await api(`/api/people/${selectedId}/feedback`, {
        method: "POST",
        body: JSON.stringify({ body: fbBody.trim(), kind: "coaching" }),
      });
      setFbBody("");
      setMsg(`Added feedback for ${selected?.name}`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setLocalBusy(false);
    }
  }

  return (
    <StepChrome
      title="Backfill evidence"
      detail="Cold-start dossiers beat blank writing desks. Aim for at least two evidence items per direct — you can keep going later on Backfill."
      primary={
        <button className="btn" type="button" disabled={busy} onClick={onContinue}>
          {thinCount === 0 ? "Continue" : "Continue with remaining thin dossiers"}
        </button>
      }
      secondary={
        <button className="btn ghost" type="button" disabled={busy} onClick={onSkip}>
          Skip backfill
        </button>
      }
    >
      <div className="setup-progress" role="status" aria-live="polite">
        <div className="setup-progress-meta">
          <strong>
            {filled}/{items.length || 0} directs populated
          </strong>
          <span className="muted">
            {thinCount === 0 ? "All dossiers have ≥2 items" : `${thinCount} still thin (<2 items)`}
          </span>
        </div>
        <div className="setup-progress-track" aria-hidden>
          <div className="setup-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid-2">
        <div className="stack">
          <ul className="backfill-list">
            {items.map((i) => (
              <li key={i.personId}>
                <button
                  type="button"
                  className={`backfill-person${selectedId === i.personId ? " on" : ""}`}
                  onClick={() => setSelectedId(i.personId)}
                >
                  <strong>{i.name}</strong>
                  <span className="muted">
                    {i.evidenceCount} item{i.evidenceCount === 1 ? "" : "s"}
                    {i.thin ? " · thin" : " · ok"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {items.length === 0 && <p className="muted">No directs yet — go back to Team.</p>}
        </div>
        <div className="stack">
          {selected ? (
            <>
              <h3 style={{ margin: 0 }}>{selected.name}</h3>
              <p className="muted" style={{ margin: 0 }}>
                {selected.achievementCount} achievements · {selected.feedbackCount} feedback
              </p>
              <div className="field">
                <label>Quick achievement</label>
                <input
                  value={achTitle}
                  onChange={(e) => setAchTitle(e.target.value)}
                  placeholder="Shipped X / Owned Y"
                />
                <textarea
                  rows={2}
                  value={achDesc}
                  onChange={(e) => setAchDesc(e.target.value)}
                  placeholder="Optional detail"
                />
                <button
                  type="button"
                  className="btn secondary"
                  disabled={localBusy || !achTitle.trim()}
                  onClick={() => void addAchievement()}
                >
                  Add achievement
                </button>
              </div>
              <div className="field">
                <label>Quick feedback note</label>
                <textarea
                  rows={3}
                  value={fbBody}
                  onChange={(e) => setFbBody(e.target.value)}
                  placeholder="Coaching note or peer highlight"
                />
                <button
                  type="button"
                  className="btn secondary"
                  disabled={localBusy || !fbBody.trim()}
                  onClick={() => void addFeedback()}
                >
                  Add feedback
                </button>
              </div>
            </>
          ) : (
            <p className="muted">Select a person to capture evidence.</p>
          )}
        </div>
      </div>
      {msg && <p className="muted">{msg}</p>}
    </StepChrome>
  );
}

function DoneStep({
  status,
  onFinish,
  busy,
}: {
  status: OnboardingStateDTO;
  onFinish: () => void;
  busy: boolean;
}) {
  return (
    <StepChrome
      title="You're ready"
      detail="Open a review cycle when you want self/peer bundles and the writing desk. Home becomes your command center."
      primary={
        <button className="btn" type="button" disabled={busy} onClick={onFinish}>
          Go to command center
        </button>
      }
      secondary={
        <Link className="btn secondary" to="/cycles">
          Create a cycle
        </Link>
      }
    >
      <ul className="setup-person-list">
        <li>
          <strong>{status.directCount}</strong> <span className="muted">directs</span>
        </li>
        <li>
          <strong>{status.unassignedRoleCount === 0 ? "All" : status.directCount - status.unassignedRoleCount}</strong>{" "}
          <span className="muted">with roles assigned</span>
        </li>
        <li>
          <strong>{status.aiEnabled ? "AI on" : "AI off"}</strong>{" "}
          <span className="muted">{status.hasAiKey ? "· key on file" : "· no key"}</span>
        </li>
        <li>
          <strong>{status.integrationsEnabled.length}</strong>{" "}
          <span className="muted">integration{status.integrationsEnabled.length === 1 ? "" : "s"} enabled</span>
        </li>
        <li>
          <strong>{Math.max(0, status.directCount - status.thinEvidenceCount)}</strong>{" "}
          <span className="muted">dossiers past the thin threshold</span>
        </li>
      </ul>
    </StepChrome>
  );
}
