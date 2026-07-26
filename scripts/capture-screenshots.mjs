#!/usr/bin/env node
/**
 * Gallery capture for README. Usage:
 *   pnpm screenshots
 *   UI_URL=http://localhost:5173 PRM_PASSWORD=workbench pnpm screenshots
 * Expects UI + API running (defaults: UI :5173, API :8787).
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const UI = process.env.UI_URL || "http://localhost:5173";
const API = process.env.API_URL || "http://127.0.0.1:8787";
const PASSWORD = process.env.PRM_PASSWORD || "workbench";
const OUT = path.resolve("docs/screenshots");

fs.mkdirSync(OUT, { recursive: true });

async function unlockToken() {
  const res = await fetch(`${API}/api/workspace/unlock`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Unlock failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.token;
}

async function apiJson(token, pathName, init) {
  const res = await fetch(`${API}${pathName}`, {
    ...init,
    headers: {
      "x-prm-token": token,
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${pathName} → ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function ensureSubmittedPromo(token, promos) {
  const draft = promos.find((p) => p.status === "draft") || promos[0];
  if (!draft?.id) return draft;
  if (draft.status === "submitted") return draft;
  const detail = await apiJson(token, `/api/promotions/${draft.id}`);
  const payload = detail?.review?.payload ?? {};
  await apiJson(token, `/api/promotions/${draft.id}`, {
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
        mark: a.mark,
      })),
    }),
  });
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
  const token = await unlockToken();
  const people = await apiJson(token, "/api/people");
  const cycles = await apiJson(token, "/api/cycles");
  const promos = await apiJson(token, "/api/promotions");
  const promo = await ensureSubmittedPromo(token, promos);
  const directs = people.filter((p) => p.managerId);
  const person = directs[0] || people[0];
  const cycle = cycles[0];

  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome-stable",
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--window-size=1440,900"],
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);

  // Unlock screen
  await page.goto(UI, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("prm_token"));
  await fetch(`${API}/api/workspace/lock`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-prm-token": token },
    body: "{}",
  }).catch(() => {});
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".unlock-card, .unlock-screen, input[type=password]", { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 400));
  await shot(page, "01-unlock");

  // Re-unlock for app pages
  const token2 = await unlockToken();
  await page.evaluate((t) => localStorage.setItem("prm_token", t), token2);
  await page.goto(UI, { waitUntil: "networkidle0" });
  await page.waitForSelector(".app-shell", { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 700));
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
