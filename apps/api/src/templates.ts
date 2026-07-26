import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readWorkspaceSettings, writeWorkspaceSettings } from "./workspaceSettings.js";

export type TemplateBlock = {
  type: string;
  key: string;
  label?: string;
  prompt?: string;
  required?: boolean;
  min_length?: number;
  competencies?: string[];
  require_evidence_outside_middle?: boolean;
  [key: string]: unknown;
};

export type FormTemplate = {
  key: string;
  name: string;
  blocks: TemplateBlock[];
  clonedFrom?: string | null;
  updatedAt?: string;
};

type PackFile = {
  pack_id: string;
  templates: Record<string, { name: string; blocks: TemplateBlock[] }>;
};

function loadDefaultPack(): PackFile {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "defaultTemplatePack.json"),
    join(here, "../../../docs/product/default_eng_template_pack.json"),
  ];
  for (const path of candidates) {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as PackFile;
    } catch {
      /* try next */
    }
  }
  throw new Error("Default template pack not found");
}

export function defaultTemplates(): Record<string, FormTemplate> {
  const pack = loadDefaultPack();
  const out: Record<string, FormTemplate> = {};
  for (const [key, tpl] of Object.entries(pack.templates)) {
    out[key] = {
      key,
      name: tpl.name,
      blocks: tpl.blocks,
      clonedFrom: null,
      updatedAt: undefined,
    };
  }
  return out;
}

export function listTemplates(): FormTemplate[] {
  const settings = readWorkspaceSettings();
  const stored = settings.templates as Record<string, FormTemplate> | undefined;
  if (!stored || !Object.keys(stored).length) {
    const defaults = defaultTemplates();
    writeWorkspaceSettings({ templates: defaults });
    return Object.values(defaults);
  }
  return Object.values(stored);
}

export function getTemplate(key: string): FormTemplate | null {
  return listTemplates().find((t) => t.key === key) ?? null;
}

export function saveTemplate(tpl: FormTemplate): FormTemplate {
  const all = Object.fromEntries(listTemplates().map((t) => [t.key, t]));
  const next = { ...tpl, updatedAt: new Date().toISOString() };
  all[tpl.key] = next;
  writeWorkspaceSettings({ templates: all });
  return next;
}

export function cloneTemplate(sourceKey: string, newKey: string, newName?: string): FormTemplate {
  const source = getTemplate(sourceKey);
  if (!source) throw new Error(`Template ${sourceKey} not found`);
  if (getTemplate(newKey)) throw new Error(`Template key ${newKey} already exists`);
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(newKey)) {
    throw new Error("Key must be snake_case (letters, numbers, underscore)");
  }
  return saveTemplate({
    key: newKey,
    name: newName || `${source.name} (copy)`,
    blocks: structuredClone(source.blocks),
    clonedFrom: sourceKey,
  });
}

export function deleteTemplate(key: string) {
  const defaults = defaultTemplates();
  if (defaults[key] && !listTemplates().find((t) => t.key === key)?.clonedFrom) {
    // Allow resetting a default by re-saving from pack — deletion of stock keys resets
    const all = Object.fromEntries(listTemplates().map((t) => [t.key, t]));
    all[key] = defaults[key];
    writeWorkspaceSettings({ templates: all });
    return;
  }
  const all = Object.fromEntries(listTemplates().map((t) => [t.key, t]));
  if (!all[key]) throw new Error("Not found");
  if (!all[key].clonedFrom && defaults[key]) {
    throw new Error("Cannot delete stock templates — clone first, or reset via clone overwrite");
  }
  delete all[key];
  writeWorkspaceSettings({ templates: all });
}

/** Build empty fields object from template text/select-like blocks for bundle export. */
export function emptyFieldsFromTemplate(tpl: FormTemplate): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const block of tpl.blocks) {
    if (block.type === "text" || block.type === "private_text") {
      fields[block.key] = "";
    } else if (block.type === "promo_interest" || block.type === "observation_confidence") {
      fields[block.key] = block.type === "promo_interest" ? "unsure" : "occasional";
    }
  }
  return fields;
}
