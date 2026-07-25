#!/usr/bin/env node
/**
 * Cwd-independent Tauri hook. Lives in src-tauri so `node run-hook.mjs …` works
 * when Tauri's cwd is src-tauri; also invokable as `node src-tauri/run-hook.mjs`
 * when cwd is apps/desktop (CI / tauri-action).
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const srcTauri = dirname(fileURLToPath(import.meta.url));
const desktopRoot = join(srcTauri, "..");
const repoRoot = join(desktopRoot, "../..");
const hook = process.argv[2] ?? "build";

function run(command, args, opts = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: opts.cwd ?? desktopRoot,
    shell: process.platform === "win32",
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (hook === "dev") {
  run("bash", [join(desktopRoot, "scripts/desktop-dev.sh")], { cwd: desktopRoot });
} else {
  run(process.execPath, [join(desktopRoot, "scripts/bundle-api-sidecar.mjs"), "--node"], {
    cwd: desktopRoot,
    shell: false,
  });
  run("pnpm", ["--dir", repoRoot, "--filter", "@prm/ui", "build"], { cwd: desktopRoot });
}
