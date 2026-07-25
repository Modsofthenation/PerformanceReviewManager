# Desktop (Tauri)

Native shell for Linux / Windows / macOS wrapping the Vite UI and local API.

## Dev

Requires Rust + platform WebView deps (WebKitGTK on Linux, WebView2 on Windows).

```bash
pnpm install
pnpm desktop:dev
```

`beforeDevCommand` runs `scripts/desktop-dev.sh`, which:

1. Writes a shared `PRM_LAUNCH_TOKEN` under `$PRM_DATA_DIR/.launch_token` (default `data/`)
2. Starts API + UI with that env so the API requires `x-prm-launch-token`
3. The Tauri process reads the same token, injects `window.__PRM_LAUNCH_TOKEN__`, and exposes `get_launch_config` IPC

Browser-only `pnpm dev` does **not** set the launch token (middleware stays off).

Optional: set `PRM_SPAWN_API=1` so the shell also starts the API via `pnpm exec tsx` (useful when not using `desktop-dev.sh`).

## Security slice

- **CSP** is set in `tauri.conf.json` (connect limited to local API / Vite / Tauri IPC)
- **Shell plugin removed** — no `shell:allow-open` / spawn from the webview
- **Launch token** binds the UI webview to the local API when the desktop script (or sidecar) sets `PRM_LAUNCH_TOKEN`

## Production build / API sidecar

```bash
pnpm desktop:build
```

`beforeBuildCommand`:

1. Bundles `@prm/api` into `src-tauri/sidecars/prm-api.mjs` (esbuild) and copies a portable **Node** binary + `better-sqlite3` next to it
2. Builds the UI into `apps/ui/dist`

At runtime the shell resolves `sidecars/` from the app resource dir (or `PRM_API_SIDECAR_DIR`), spawns bundled Node with the API entry, sets `PRM_LAUNCH_TOKEN` / `PRM_DATA_DIR`, and kills the child on exit — one process from the user’s point of view.

CI builds the same matrix (Ubuntu / macOS / Windows) on pushes to `main`.

## Data

Set `PRM_DATA_DIR` to override the SQLite/vault location (default `../../data` from the API cwd).
