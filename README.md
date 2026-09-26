# SelfTerm

SelfTerm is an SSH manager with saved hosts, terminal tabs, and encrypted sync to a server you control.

It provides a compact host vault, saved SSH profiles, terminal tabs, and push/pull sync to your own server.

## Cross-platform Rust roadmap

The current implementation uses Electron, React, and Node.js. The planned Rust/Tauri version targets **Windows, Linux, macOS, Android, and iOS**, with persistent local SQLite storage and optional cloud or self-hosted sync. The cross-platform version is not implemented yet.

- [Detailed migration roadmap](docs/rust-migration/README.md)
- [Architecture, encryption, and API design](docs/superpowers/specs/2026-09-27-rust-migration-design.md)
- [Rust core and desktop plan](docs/superpowers/plans/2026-09-27-rust-core-desktop.md)
- [Cloud and self-hosted backend plan](docs/superpowers/plans/2026-09-27-rust-sync-service.md)
- [Android, iOS, and release plan](docs/superpowers/plans/2026-09-27-rust-mobile-release.md)
- [Verification and release matrix](docs/rust-migration/validation.md)

The [`electronjs`](https://github.com/asobitov2005/selfterm/tree/electronjs) branch preserves the original application. `main` contains the source and migration documentation.

## Run the desktop app

```bash
npm install
npm run dev
```

## Run the self-host sync server

```bash
SYNC_TOKEN="change-this-long-token" SELFTERM_DATA_DIR="./data" npm run server
```

The server listens on `0.0.0.0:8787` by default.

Desktop sync stores an encrypted vault blob on the server. The server only sees ciphertext. Use the same passphrase on every client when pushing or pulling.

## Build Linux packages

```bash
npm run dist
```

The AppImage and `.deb` output will be in `release/`.

## Security notes

- Passwords are requested per session unless you choose to save them using the operating system credential storage.
- Private keys are read from your local file path when connecting.
- Sync uses AES-256-GCM with a key derived from your passphrase via scrypt.
- Put the sync server behind Tailscale, WireGuard, Cloudflare Access, or a reverse proxy with HTTPS.
