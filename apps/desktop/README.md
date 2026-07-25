# Desktop (Tauri)

Native shell for Linux / Windows / macOS wrapping the Vite UI.

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

## Security slice

- **CSP** is set in `tauri.conf.json` (connect limited to local API / Vite / Tauri IPC)
- **Shell plugin removed** — no `shell:allow-open` / spawn from the webview
- **Launch token** binds the UI webview to the local API when the desktop script (or sidecar) sets `PRM_LAUNCH_TOKEN`

## Production build

```bash
pnpm desktop:build
```

Bundles the UI (`apps/ui/dist`). The local API still needs to be available on `127.0.0.1:8787` for this slice (sidecar packaging of the Node API is the next step). When you start the API for a packaged app, set the same `PRM_LAUNCH_TOKEN` as in `data/.launch_token` (or export it before launch).

## Data

Set `PRM_DATA_DIR` to override the SQLite/vault location (default `../../data` from the API cwd).
