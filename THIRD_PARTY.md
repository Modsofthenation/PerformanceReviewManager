# Third-party notices

Performance Review Manager is MIT-licensed (see [`LICENSE`](./LICENSE)). Packaged desktop builds may also ship the following redistributed components:

## Node.js (desktop API sidecar)

When building installers with `PRM_BUNDLE_NODE=1` / `bundle-api-sidecar.mjs --node`, a portable **Node.js** binary is copied next to `prm-api.mjs` under `apps/desktop/src-tauri/sidecars/`.

- Project: [nodejs/node](https://github.com/nodejs/node)
- License: MIT (see Node’s `LICENSE` in the upstream release tarball)
- Purpose: runtime for the bundled Hono API sidecar inside the Tauri app

Node is **not** modified; it is redistributed as a binary dependency of the desktop package.

## better-sqlite3 (native binding)

The sidecar copies the `better-sqlite3` package (and small helper deps such as `bindings`) into `sidecars/node_modules/` so the API can open SQLite without a system-wide install.

- Package: [WiseLibs/better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- License: MIT

## Other npm / Cargo dependencies

Application source depends on many MIT/Apache-2.0 (and similar) libraries declared in the root `pnpm-lock.yaml` and `apps/desktop/src-tauri/Cargo.lock`. Those licenses apply to their respective packages; this notice only calls out binaries/resources that are **copied into** desktop installer artifacts beyond normal node_modules resolution at build time.
