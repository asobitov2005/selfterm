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

The vault lives in Tauri's application data directory as `selfterm.sqlite3`, under application identifier `dev.selfterm.client`. It does not overwrite the legacy Electron vault. By default the workspace is created and opened automatically without asking for a password. A random encryption key stays in the OS secure store; SQLite still contains authenticated ciphertext, including host credentials.

Password protection is optional in **Settings**. Enabling it lets the user choose any non-empty password, supplies a recovery key for offline storage, and removes automatic device unlock. Disabling it stores the native key in the OS secure store again and restores automatic opening. The unlock screen and 15-minute idle lock apply only when password protection is enabled. Closing the application drops unlocked native keys in either mode. A vault previously created with a password must be unlocked once before its protection can be disabled.

Current integration supports encrypted host CRUD, appearance settings and optional vault protection. SSH, SFTP, sync and desktop sharing adapters are still being implemented; the UI reports unavailable functionality explicitly. OS-session lock integration is still required. These limitations must be removed before this build replaces the Electron release.
