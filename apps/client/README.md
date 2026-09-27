# SelfTerm Rust client

This is the production Tauri integration under development. It embeds the existing React/xterm UI and the Rust client core. The local SQLite vault does not require a backend server. The separate feasibility probe remains under `probes/cross-platform`.

From the repository root:

```sh
npm ci
npm ci --prefix apps/client
npm run dev:rust
```

The launcher starts Vite automatically, then the native application. Do not launch the debug binary without its Vite server. To use a separate Cargo build directory:

```sh
CARGO_TARGET_DIR="$HOME/.cache/selfterm/target" npm run dev:rust
```

Use `npm run dist:rust` to build an installer in a native packaging environment. Native Linux prerequisites are the same as the feasibility probe. Windows/macOS/mobile packages must be built and tested in their corresponding environments.

The vault lives in Tauri's application data directory as `selfterm.sqlite3`, under application identifier `dev.selfterm.client`. It does not overwrite the legacy Electron vault. Creation requires a passphrase of at least 16 Unicode characters and produces a recovery key shown once for offline storage. Host passwords remain in Rust and enter SQLite only inside authenticated ciphertext. Public host views contain credential references, never credential bytes.

Current integration supports vault creation/unlock, encrypted host CRUD, appearance settings and manual/15-minute native idle lock. SSH, SFTP, sync and desktop sharing adapters are still being implemented; the UI reports unavailable functionality explicitly. Recovery-key based unlock is available from the unlock screen. OS-session lock integration is still required. These limitations must be removed before this build replaces the Electron release.
