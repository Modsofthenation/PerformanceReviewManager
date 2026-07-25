#!/usr/bin/env node
/**
 * Bundle @prm/api for Tauri to spawn (with optional portable Node).
 * Output: apps/desktop/src-tauri/sidecars/
 *   prm-api.mjs
 *   node(.exe)          — when PRM_BUNDLE_NODE=1 or --node
 *   node_modules/better-sqlite3 (+ deps) for the native binding
 */
import {
  mkdirSync,
  writeFileSync,
  cpSync,
  rmSync,
  chmodSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");
const outDir = join(root, "apps/desktop/src-tauri/sidecars");
const outFile = join(outDir, "prm-api.mjs");
const bundleNode =
  process.env.PRM_BUNDLE_NODE === "1" || process.argv.includes("--node");

mkdirSync(outDir, { recursive: true });

const require = createRequire(import.meta.url);

function resolvePkg(name) {
  try {
    return dirname(require.resolve(`${name}/package.json`, { paths: [root, join(root, "apps/api"), join(root, "apps/desktop")] }));
  } catch {
    return null;
  }
}

function loadEsbuild() {
  try {
    return createRequire(join(root, "apps/desktop/package.json"))("esbuild");
  } catch {
    try {
      return require("esbuild");
    } catch {
      return null;
    }
  }
}

function copyNativeDeps() {
  const nm = join(outDir, "node_modules");
  rmSync(nm, { recursive: true, force: true });
  mkdirSync(nm, { recursive: true });
  const sqlitePkg = resolvePkg("better-sqlite3");
  if (!sqlitePkg) {
    console.warn("better-sqlite3 not found — sidecar will fail at runtime");
    return;
  }
  cpSync(sqlitePkg, join(nm, "better-sqlite3"), { recursive: true, dereference: true });
  const sqliteRequire = createRequire(join(sqlitePkg, "package.json"));
  for (const name of ["bindings", "file-uri-to-path"]) {
    try {
      const src = dirname(sqliteRequire.resolve(`${name}/package.json`));
      cpSync(src, join(nm, name), { recursive: true, dereference: true });
      console.log("Copied dep", name, "→", join(nm, name));
    } catch (err) {
      console.warn(`skip missing dep ${name}:`, err instanceof Error ? err.message : err);
    }
  }
  writeFileSync(
    join(outDir, "package.json"),
    JSON.stringify({ type: "module", private: true, name: "prm-api-sidecar" }, null, 2),
  );
}

function copyNodeBinary() {
  const isWin = process.platform === "win32";
  const dest = join(outDir, isWin ? "node.exe" : "node");
  try {
    cpSync(process.execPath, dest, { dereference: true });
    if (!isWin) chmodSync(dest, 0o755);
    console.log("Copied Node binary:", dest);
  } catch (err) {
    console.warn("Could not copy Node binary:", err instanceof Error ? err.message : err);
  }
}

let esbuild = loadEsbuild();

if (!esbuild) {
  // Dev-friendly launcher when esbuild isn't on the resolution path.
  const launcher = `#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../../..");
const entry = join(root, "apps/api/src/index.ts");
const child = spawn(process.execPath, ["--import", "tsx", entry], {
  stdio: "inherit",
  env: process.env,
  cwd: join(root, "apps/api"),
});
child.on("exit", (code) => process.exit(code ?? 1));
`;
  writeFileSync(outFile, launcher);
  console.log("Wrote launcher sidecar (esbuild unavailable):", outFile);
  if (bundleNode) copyNodeBinary();
  process.exit(0);
}

await esbuild.build({
  entryPoints: [join(root, "apps/api/src/index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: outFile,
  external: ["better-sqlite3"],
  banner: {
    js: [
      'import { createRequire as __prmCreateRequire } from "module";',
      "import { fileURLToPath as __prmFileURLToPath } from \"url\";",
      "import { dirname as __prmDirname, join as __prmJoin } from \"path\";",
      "const require = __prmCreateRequire(import.meta.url);",
      "const __prmSidecarDir = __prmDirname(__prmFileURLToPath(import.meta.url));",
      'process.env.NODE_PATH = [__prmJoin(__prmSidecarDir, "node_modules"), process.env.NODE_PATH].filter(Boolean).join(process.platform === "win32" ? ";" : ":");',
    ].join(""),
  },
});
console.log("Bundled API sidecar:", outFile);
copyNativeDeps();
if (bundleNode) copyNodeBinary();

// Touch mtime so Cargo/tauri notice resources changed
try {
  execFileSync("node", ["-e", ""], { stdio: "ignore" });
} catch {
  /* ignore */
}
