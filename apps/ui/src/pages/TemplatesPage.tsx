import { useEffect, useState } from "react";
import type { FormTemplateDTO } from "@prm/shared";
import { api } from "../lib/api";
import { NextStep, PageHeader } from "../components/PageChrome";

export function TemplatesPage() {
  const [templates, setTemplates] = useState<FormTemplateDTO[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<FormTemplateDTO | null>(null);
  const [cloneKey, setCloneKey] = useState("");
  const [cloneName, setCloneName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await api<{ templates: FormTemplateDTO[] }>("/api/templates");
    setTemplates(res.templates);
    if (!selected && res.templates[0]) {
      setSelected(res.templates[0].key);
      setDraft(res.templates[0]);
    }
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  useEffect(() => {
    if (!selected) return;
    const t = templates.find((x) => x.key === selected);
    if (t) setDraft(structuredClone(t));
  }, [selected, templates]);

  return (
    <div className="stack">
      <PageHeader
        title="Form templates"
        job="Clone and edit self/peer (and other pack) templates. Bundle export uses the saved blocks for empty field shapes."
      />
      {error && (
        <NextStep tone="warn" label="Templates unavailable" detail={error} />
      )}
      {msg && <p className="muted">{msg}</p>}

      <div className="grid-2">
        <div className="panel stack">
          <h2 style={{ margin: 0 }}>Library</h2>
          <ul className="backfill-list">
            {templates.map((t) => (
              <li key={t.key}>
                <button
                  type="button"
                  className={`backfill-person${selected === t.key ? " on" : ""}`}
                  onClick={() => setSelected(t.key)}
                >
                  <span>
                    <strong>{t.name}</strong>
                    <span className="muted"> · {t.key}</span>
                  </span>
                  {t.clonedFrom ? <span className="status-pill">clone</span> : <span className="status-pill ok">stock</span>}
                </button>
              </li>
            ))}
          </ul>
          <div className="field">
            <label>Clone selected as key</label>
            <input
              value={cloneKey}
              onChange={(e) => setCloneKey(e.target.value)}
              placeholder="ic_self_custom"
            />
          </div>
          <div className="field">
            <label>Clone display name</label>
            <input value={cloneName} onChange={(e) => setCloneName(e.target.value)} placeholder="IC Self (custom)" />
          </div>
          <button
            type="button"
            className="btn"
            disabled={!selected || !cloneKey.trim()}
            onClick={async () => {
              try {
                const tpl = await api<FormTemplateDTO>("/api/templates/clone", {
                  method: "POST",
                  body: JSON.stringify({
                    sourceKey: selected,
                    newKey: cloneKey.trim(),
                    name: cloneName.trim() || undefined,
                  }),
                });
                setMsg(`Cloned ${tpl.key}`);
                setCloneKey("");
                setCloneName("");
                await load();
                setSelected(tpl.key);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Clone failed");
              }
            }}
          >
            Clone template
          </button>
        </div>

        <div className="panel stack">
          <h2 style={{ margin: 0 }}>Edit</h2>
          {!draft ? (
            <p className="muted">Select a template</p>
          ) : (
            <>
              <div className="field">
                <label>Name</label>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Blocks JSON</label>
                <textarea
                  rows={16}
                  className="mono"
                  value={JSON.stringify(draft.blocks, null, 2)}
                  onChange={(e) => {
                    try {
                      const blocks = JSON.parse(e.target.value) as FormTemplateDTO["blocks"];
                      setDraft({ ...draft, blocks });
                      setError(null);
                    } catch {
                      setError("Blocks JSON is invalid — fix before save");
                    }
                  }}
                />
              </div>
              <div className="cta-primary-row">
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    try {
                      const saved = await api<FormTemplateDTO>(`/api/templates/${draft.key}`, {
                        method: "PUT",
                        body: JSON.stringify({ name: draft.name, blocks: draft.blocks }),
                      });
                      setMsg(`Saved ${saved.key}`);
                      await load();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Save failed");
                    }
                  }}
                >
                  Save template
                </button>
                {draft.clonedFrom ? (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={async () => {
                      if (!window.confirm(`Delete clone ${draft.key}?`)) return;
                      await api(`/api/templates/${draft.key}`, { method: "DELETE" });
                      setSelected(null);
                      await load();
                    }}
                  >
                    Delete clone
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
