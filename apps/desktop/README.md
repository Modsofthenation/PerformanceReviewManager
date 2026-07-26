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
3. The Tauri process reads the same token, injects `window.__PRM_LAUNCH_TOKEN__` and `window.__PRM_API_BASE_URL__`, and exposes `get_launch_config` IPC

Browser-only `pnpm dev` does **not** set the launch token (middleware stays off). The UI uses relative `/api` under Vite (proxied). Packaged builds must use the injected absolute API base URL — relative `/api` has no proxy in the Tauri webview.

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
2. Builds the UI into `apps/ui/dist` (Tauri `frontendDist` is `../../ui/dist` from `src-tauri`)

At runtime the shell resolves `sidecars/` from the app resource dir (or `PRM_API_SIDECAR_DIR`), spawns bundled Node with the API entry, sets `PRM_LAUNCH_TOKEN` / `PRM_DATA_DIR` / `PRM_UI_DIR`, waits until `/api/health` responds, then opens the webview at the API origin (same-origin `/api` + static UI from `ui-dist/`). On exit it kills the child — one process from the user’s point of view.

On Windows the Node child is spawned with `CREATE_NO_WINDOW`. Sidecar stdout/stderr append to `%APPDATA%\com.prm.workbench\desktop-api.log`.

### Updates

Settings → **Check for updates** compares the packaged version (`get_app_version` IPC) to the latest GitHub Release. Fully signed silent auto-update still needs `tauri-plugin-updater` + CI signing keys.

Packaged data lives in the OS app-data directory (for example `%APPDATA%\com.prm.workbench` on Windows). Sidecar stdout/stderr is appended to `desktop-api.log` there for debugging startup failures.

CI builds the same matrix (Ubuntu / macOS / Windows) on pushes to `main`. Each green desktop job uploads an Actions artifact (retained 30 days):

| Artifact name | Typical contents |
|---------------|------------------|
| `desktop-linux-x86_64` | `.deb` / `.AppImage` under `bundle/` |
| `desktop-macos-aarch64` | `.dmg` / `.app` under `bundle/` |
| `desktop-windows-x86_64` | `.msi` / NSIS `.exe` under `bundle/` |

Download from the run’s **Artifacts** section in the GitHub UI, or:

```bash
gh run download <run-id> -n desktop-windows-x86_64
# also: desktop-macos-aarch64, desktop-linux-x86_64
```

## Icons

Source mark: `apps/desktop/app-icon.png` (1024²). Regenerate platform icons with:

```bash
cd apps/desktop && pnpm exec tauri icon ./app-icon.png -o src-tauri/icons
```

Windows needs `icons/icon.ico`; macOS needs `icons/icon.icns`.
