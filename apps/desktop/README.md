# Desktop (Tauri)

Native shell for Linux / Windows / macOS wrapping the Vite UI.

## Dev

Requires Rust + platform WebView deps (WebKitGTK on Linux, WebView2 on Windows).

```bash
pnpm install
pnpm desktop:dev
```

This runs API + UI (`beforeDevCommand`) and opens the Tauri window at the Vite URL.

## Production build

```bash
pnpm desktop:build
```

Bundles the UI (`apps/ui/dist`). The local API still needs to be available on `127.0.0.1:8787` for this slice (sidecar packaging of the Node API is the next hardening step), or run `pnpm dev:api` alongside the installed app during evaluation.

## Data

Set `PRM_DATA_DIR` to override the SQLite/vault location (default `../../data` from the API cwd).
