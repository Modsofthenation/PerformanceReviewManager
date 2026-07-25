#!/usr/bin/env node
/**
 * One-off gallery capture for README. Usage:
 *   node scripts/capture-screenshots.mjs
 * Expects UI on localhost:5175 (or UI_URL) and API unlocked via password.
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const UI = process.env.UI_URL || "http://localhost:5175";
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

async function apiJson(token, pathName) {
  const res = await fetch(`${API}${pathName}`, { headers: { "x-prm-token": token } });
  if (!res.ok) throw new Error(`${pathName} → ${res.status}`);
  return res.json();
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("wrote", file);
}

async function main() {
  const token = await unlockToken();
  const people = await apiJson(token, "/api/people");
  const cycles = await apiJson(token, "/api/cycles");
  const promos = await apiJson(token, "/api/promotions");
  const directs = people.filter((p) => p.managerId);
  const person = directs[0] || people[0];
  const cycle = cycles[0];
  const promo = promos[0];

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
  await new Promise((r) => setTimeout(r, 500));
  await shot(page, "02-home");

  const routes = [
    ["03-team", "/team"],
    ["04-person", `/team/${person.id}`],
    ["05-roles", "/roles"],
    ["06-cycles", "/cycles"],
    ["07-writing-desk", `/cycles/${cycle.id}/write/${person.id}`],
    ["08-promotions", "/promotions"],
    ["10-consistency", "/consistency"],
    ["11-backfill", "/backfill"],
    ["12-chat", "/chat"],
    ["13-settings", "/settings"],
  ];
  if (promo?.id) routes.splice(6, 0, ["09-promotion-detail", `/promotions/${promo.id}`]);

  for (const [name, route] of routes) {
    await page.goto(`${UI}${route}`, { waitUntil: "networkidle0" });
    await page.waitForSelector(".main, .app-shell", { timeout: 15000 });
    if (route === "/chat") {
      await page.waitForSelector(".chat-composer button", { timeout: 15000 });
      await page.evaluate(() => {
        document.querySelector(".chat-composer")?.scrollIntoView({ block: "end" });
      });
    }
    await new Promise((r) => setTimeout(r, 450));
    await shot(page, name);
  }

  await browser.close();
  console.log("done", OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
