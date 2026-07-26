#!/usr/bin/env node
/**
 * Gallery capture for README. Usage:
 *   pnpm screenshots
 *   UI_URL=http://localhost:5173 PRM_PASSWORD=workbench pnpm screenshots
 * Expects UI + API running (defaults: UI :5173, API :8787).
 *
 * Recreates a demo workspace so shots stay consistent:
 *   01-unlock = empty vs demo create choice
 *   remaining = seeded demo org (password workbench)
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const UI = process.env.UI_URL || "http://localhost:5173";
const API = process.env.API_URL || "http://127.0.0.1:8787";
const PASSWORD = process.env.PRM_PASSWORD || "workbench";
const OUT = path.resolve("docs/screenshots");

fs.mkdirSync(OUT, { recursive: true });

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

async function unlockToken(password = PASSWORD) {
  const json = await api("/api/workspace/unlock", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  return json.token;
}

async function ensureFreshDemo() {
  const status = await api("/api/workspace/status");
  if (status.initialized) {
    // Prefer destroy when the vault password matches; fall back to unlock+destroy.
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
      console.warn(
        "no person with target next role — skipping promo screenshots",
        list.map((p) => ({ name: p.name, next: p.targetNextRoleDefinitionId })),
      );
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

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("wrote", file);
}

async function gotoApp(page, route) {
  await page.goto(`${UI}${route}`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".main, .app-shell", { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 450));
}

async function scrollHeadingIntoView(page, text) {
  await page.evaluate((heading) => {
    const nodes = Array.from(document.querySelectorAll("h1, h2, h3, .page-header, .panel"));
    const el = nodes.find((n) => (n.textContent || "").includes(heading));
    el?.scrollIntoView({ block: "start" });
  }, text);
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
  await page.evaluate(() => localStorage.removeItem("prm_token"));
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(
    () =>
      (document.body?.innerText || "").includes("Create workbench") ||
      (document.body?.innerText || "").includes("Empty workspace"),
    { timeout: 15000 },
  );
  await new Promise((r) => setTimeout(r, 500));
  await shot(page, "01-unlock");

  // Seed demo org for the rest of the gallery
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
  const cycle = cycles[0];
  if (!cycle?.id) throw new Error("Demo seed produced no cycle");
  if (!promo?.id) throw new Error("Could not create a promotion packet for gallery shots");

  await shot(page, "02-home");
  await scrollHeadingIntoView(page, "Needs director attention");
  await shot(page, "15-director-attention");

  const routes = [
    ["03-team", "/team"],
    ["04-person", `/team/${person.id}`],
    ["05-roles", "/roles"],
    ["06-cycles", "/cycles"],
    ["07-writing-desk", `/cycles/${cycle.id}/write/${person.id}`],
    ["08-promotions", "/promotions"],
    ["10-consistency", "/consistency"],
    ["11-team-performance", "/team-performance"],
    ["20-sprint-pulse", "/sprint-pulse"],
    ["12-backfill", "/backfill"],
    ["13-chat", "/chat"],
    ["14-settings", "/settings"],
  ];
  if (promo?.id) routes.splice(6, 0, ["09-promotion-detail", `/promotions/${promo.id}`]);

  for (const [name, route] of routes) {
    await gotoApp(page, route);
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
        () => (document.body?.innerText || "").toLowerCase().includes("sprint") ||
          (document.body?.innerText || "").toLowerCase().includes("pulse"),
        { timeout: 15000 },
      );
    }
    if (name === "07-writing-desk") {
      await page.waitForFunction(
        () => (document.body?.innerText || "").includes("Evidence digest"),
        { timeout: 15000 },
      );
      await scrollHeadingIntoView(page, "Evidence digest");
    }
    if (name === "10-consistency") {
      await page.waitForFunction(
        () => Array.from(document.querySelectorAll("h2")).some((h) => h.textContent?.includes("Calibration bundles")),
        { timeout: 15000 },
      );
      await scrollHeadingIntoView(page, "Calibration bundles");
    }
    if (name === "09-promotion-detail") {
      await page.waitForFunction(
        () => (document.body?.innerText || "").includes("Promo committee export"),
        { timeout: 15000 },
      );
    }
    if (name === "14-settings") {
      await page.waitForSelector(".page-section-nav, #settings-appearance", { timeout: 15000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await new Promise((r) => setTimeout(r, 300));
    }
    await new Promise((r) => setTimeout(r, 450));
    await shot(page, name);

    if (name === "07-writing-desk") {
      await scrollHeadingIntoView(page, "Evidence digest");
      await shot(page, "16-writing-desk-director");
    }
    if (name === "10-consistency") {
      await scrollHeadingIntoView(page, "Calibration bundles");
      await shot(page, "17-consistency-director-packs");
    }
    if (name === "11-team-performance") {
      await shot(page, "18-team-director-briefing");
    }
    if (name === "09-promotion-detail") {
      await shot(page, "19-promo-committee");
    }
  }

  await browser.close();
  console.log("done", OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
