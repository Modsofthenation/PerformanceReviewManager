#!/usr/bin/env node
/**
 * Gallery capture for README. Usage:
 *   pnpm screenshots
 *   UI_URL=http://localhost:5173 PRM_PASSWORD=workbench pnpm screenshots
 * Expects UI + API running (defaults: UI :5173, API :8787).
 *
 * Recreates a demo workspace so shots stay consistent, then captures:
 *   1. Theme matrix — every accent × dark/light for key pages
 *   2. Product tour — every main page (rotating accents for variety)
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const UI = process.env.UI_URL || "http://localhost:5173";
const API = process.env.API_URL || "http://127.0.0.1:8787";
const PASSWORD = process.env.PRM_PASSWORD || "workbench";
const OUT = path.resolve("docs/screenshots");
const THEMES_OUT = path.join(OUT, "themes");

const ACCENTS = ["teal", "ocean", "forest", "slate", "coral", "amber", "magenta", "citrus"];
const MODES = ["dark", "light"];

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(THEMES_OUT, { recursive: true });

async function api(pathName, init = {}, token) {
  const res = await fetch(`${API}${pathName}`, {
    ...init,
    headers: {
      ...(token ? { "x-prm-token": token } : {}),
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(`${pathName} → ${res.status} ${text}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function ensureFreshDemo() {
  const status = await api("/api/workspace/status");
  if (status.initialized) {
    try {
      await api("/api/workspace/destroy", {
        method: "POST",
        body: JSON.stringify({ password: PASSWORD, confirm: "DELETE" }),
      });
    } catch (e) {
      if (e.status === 401 || e.status === 403) {
        throw new Error(
          `Could not erase workspace for screenshots (password "${PASSWORD}" rejected or legal hold). ` +
            `Stop the API and delete data/, or unlock with the correct password.`,
        );
      }
      throw e;
    }
  }
}

async function ensureSubmittedPromo(token, _people, cycles) {
  let promos = await api("/api/promotions", {}, token);
  if (!Array.isArray(promos)) promos = [];

  let draft = promos.find((p) => p.status === "draft") || promos[0];
  if (!draft?.id) {
    const people = await api("/api/people", {}, token);
    const list = Array.isArray(people) ? people : [];
    const eligible =
      list.find((p) => p.managerId && p.targetNextRoleDefinitionId) ||
      list.find((p) => p.targetNextRoleDefinitionId);
    if (!eligible?.id) {
      console.warn("no person with target next role — skipping promo screenshots");
      return null;
    }
    const created = await api(
      "/api/promotions",
      {
        method: "POST",
        body: JSON.stringify({ personId: eligible.id, cycleId: cycles[0]?.id }),
      },
      token,
    );
    draft = { id: created.id, status: "draft" };
  }

  if (draft.status === "submitted") return draft;
  const detail = await api(`/api/promotions/${draft.id}`, {}, token);
  const payload = detail?.review?.payload ?? {};
  await api(
    `/api/promotions/${draft.id}`,
    {
      method: "PUT",
      body: JSON.stringify({
        status: "submitted",
        decisionReason: "Screenshot gallery: show promo committee export",
        payload: {
          case_summary: payload.case_summary || "Ready for committee review with evidence-backed case.",
          scope_examples: payload.scope_examples || "Led cross-team delivery on critical path work.",
          remaining_gaps: payload.remaining_gaps || "Continue building skip-level visibility.",
          recommendation: payload.recommendation || "ready",
        },
        assessments: (detail.assessments || []).map((a) => ({
          roleExpectationId: a.roleExpectationId,
          mark: a.mark === "emerging" ? "demonstrating" : a.mark,
        })),
      }),
    },
    token,
  );
  return { ...draft, status: "submitted" };
}

async function shot(page, name, dir = OUT) {
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("wrote", file);
}

async function applyAppearance(page, mode, accent) {
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: mode }]);
  await page.evaluate(
    (m, a) => {
      localStorage.setItem("prm_theme", m);
      localStorage.setItem("prm_accent", a);
      document.documentElement.setAttribute("data-theme", m);
      document.documentElement.setAttribute("data-color-mode", m);
      document.documentElement.setAttribute("data-accent", a);
      document.documentElement.style.colorScheme = m;
      window.dispatchEvent(new CustomEvent("prm-theme-change", { detail: m }));
      window.dispatchEvent(new CustomEvent("prm-accent-change", { detail: a }));
    },
    mode,
    accent,
  );
  await new Promise((r) => setTimeout(r, 200));
}

async function gotoApp(page, route, mode, accent) {
  await applyAppearance(page, mode, accent);
  await page.goto(`${UI}${route}`, { waitUntil: "networkidle0" });
  await applyAppearance(page, mode, accent);
  await page.waitForSelector(".main, .app-shell, .unlock-screen", { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 400));
}

async function scrollHeadingIntoView(page, text) {
  await page.evaluate((heading) => {
    const nodes = Array.from(document.querySelectorAll("h1, h2, h3, .page-header, .panel"));
    const el = nodes.find((n) => (n.textContent || "").includes(heading));
    el?.scrollIntoView({ block: "start" });
  }, text);
  await new Promise((r) => setTimeout(r, 350));
}

async function preparePage(page, name, route) {
  if (route === "/chat") {
    await page.waitForSelector(".chat-composer button", { timeout: 15000 });
    await page.evaluate(() => {
      document.querySelector(".chat-composer")?.scrollIntoView({ block: "end" });
    });
  }
  if (route === "/team-performance") {
    await page.waitForSelector(".tp-metrics, .tp-grid, h2", { timeout: 15000 });
  }
  if (route === "/sprint-pulse") {
    await page.waitForFunction(
      () =>
        (document.body?.innerText || "").toLowerCase().includes("sprint") ||
        (document.body?.innerText || "").toLowerCase().includes("pulse"),
      { timeout: 15000 },
    );
  }
  if (name.includes("writing-desk")) {
    await page.waitForFunction(
      () => (document.body?.innerText || "").includes("Evidence digest"),
      { timeout: 15000 },
    );
    await scrollHeadingIntoView(page, "Evidence digest");
  }
  if (name.includes("consistency")) {
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll("h2")).some((h) =>
          h.textContent?.includes("Calibration bundles"),
        ),
      { timeout: 15000 },
    );
    await scrollHeadingIntoView(page, "Calibration bundles");
  }
  if (name.includes("promotion-detail") || name.includes("promo-committee")) {
    await page.waitForFunction(
      () => (document.body?.innerText || "").includes("Promo committee export"),
      { timeout: 15000 },
    );
  }
  if (name.includes("settings")) {
    await page.waitForSelector(".page-section-nav, #settings-appearance", { timeout: 15000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise((r) => setTimeout(r, 300));
  }
  await new Promise((r) => setTimeout(r, 350));
}

async function main() {
  await ensureFreshDemo();

  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome-stable",
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--window-size=1440,900"],
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);

  // 01 — create workbench (empty vs demo)
  await page.goto(UI, { waitUntil: "networkidle0" });
  await page.evaluate(() => {
    localStorage.removeItem("prm_token");
    localStorage.setItem("prm_theme", "dark");
    localStorage.setItem("prm_accent", "coral");
  });
  await page.reload({ waitUntil: "networkidle0" });
  await applyAppearance(page, "dark", "coral");
  await page.waitForFunction(
    () =>
      (document.body?.innerText || "").includes("Create workbench") ||
      (document.body?.innerText || "").includes("Empty workspace"),
    { timeout: 15000 },
  );
  await new Promise((r) => setTimeout(r, 500));
  await shot(page, "01-unlock");

  const init = await api("/api/workspace/init", {
    method: "POST",
    body: JSON.stringify({ name: "Demo Org", password: PASSWORD, seed: true }),
  });
  const token = init.token;
  await page.evaluate((t) => localStorage.setItem("prm_token", t), token);
  await page.goto(UI, { waitUntil: "networkidle0" });
  await page.waitForSelector(".app-shell", { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 800));

  const peopleRaw = await api("/api/people", {}, token);
  const cyclesRaw = await api("/api/cycles", {}, token);
  const people = Array.isArray(peopleRaw) ? peopleRaw : [];
  const cycles = Array.isArray(cyclesRaw) ? cyclesRaw : [];
  if (people.length === 0) {
    throw new Error("Demo seed produced no people — cannot capture gallery");
  }
  const promo = await ensureSubmittedPromo(token, people, cycles);
  const directs = people.filter((p) => p.managerId);
  const person = directs[0] || people[0];
  const cycle = cycles.find((c) => c.status === "manager_open") || cycles[0];
  if (!cycle?.id) throw new Error("Demo seed produced no cycle");
  if (!promo?.id) throw new Error("Could not create a promotion packet for gallery shots");

  const writeRoute = `/cycles/${cycle.id}/write/${person.id}`;
  const matrixPages = [
    ["home", "/"],
    ["team", "/team"],
    ["person", `/team/${person.id}`],
    ["roles", "/roles"],
    ["cycles", "/cycles"],
    ["writing-desk", writeRoute],
    ["promotions", "/promotions"],
    ["promotion-detail", `/promotions/${promo.id}`],
    ["consistency", "/consistency"],
    ["team-performance", "/team-performance"],
    ["sprint-pulse", "/sprint-pulse"],
    ["backfill", "/backfill"],
    ["chat", "/chat"],
    ["settings", "/settings"],
  ];

  // Full theme × page matrix (every accent × dark/light × page)
  for (const mode of MODES) {
    for (const accent of ACCENTS) {
      const dir = path.join(THEMES_OUT, `${mode}-${accent}`);
      fs.mkdirSync(dir, { recursive: true });
      console.log(`theme matrix ${mode}/${accent}`);
      for (const [slug, route] of matrixPages) {
        await gotoApp(page, route, mode, accent);
        await preparePage(page, slug, route);
        await shot(page, slug, dir);
      }
    }
  }

  // README product-tour shots — rotate accents so every theme appears in the tour
  const tour = [
    ["02-home", "/", "dark", "teal"],
    ["15-director-attention", "/", "dark", "amber", "Needs director attention"],
    ["03-team", "/team", "dark", "coral"],
    ["04-person", `/team/${person.id}`, "dark", "magenta"],
    ["05-roles", "/roles", "light", "ocean"],
    ["06-cycles", "/cycles", "dark", "citrus"],
    ["07-writing-desk", writeRoute, "dark", "coral"],
    ["16-writing-desk-director", writeRoute, "dark", "amber", "Evidence digest"],
    ["08-promotions", "/promotions", "light", "magenta"],
    ["09-promotion-detail", `/promotions/${promo.id}`, "dark", "ocean"],
    ["19-promo-committee", `/promotions/${promo.id}`, "dark", "ocean"],
    ["10-consistency", "/consistency", "dark", "forest"],
    ["17-consistency-director-packs", "/consistency", "dark", "forest", "Calibration bundles"],
    ["11-team-performance", "/team-performance", "light", "coral"],
    ["18-team-director-briefing", "/team-performance", "light", "amber"],
    ["20-sprint-pulse", "/sprint-pulse", "dark", "magenta"],
    ["12-backfill", "/backfill", "light", "citrus"],
    ["13-chat", "/chat", "dark", "ocean"],
    ["14-settings", "/settings", "dark", "coral"],
  ];

  for (const [name, route, mode, accent, heading] of tour) {
    await gotoApp(page, route, mode, accent);
    await preparePage(page, name, route);
    if (heading) await scrollHeadingIntoView(page, heading);
    await shot(page, name);
  }

  // Theme strip for README — home in every accent (dark + light)
  for (const mode of MODES) {
    for (const accent of ACCENTS) {
      await gotoApp(page, "/", mode, accent);
      await preparePage(page, "home", "/");
      await shot(page, `${mode}-${accent}-home`, THEMES_OUT);
    }
  }

  await browser.close();
  console.log("done", OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
