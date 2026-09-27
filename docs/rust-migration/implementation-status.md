# Rust implementation status

The migration is developed on `feat/rust-migration`. The Electron baseline remains available on `electronjs`. This document records implemented behavior; the design plans are not a claim that every feature ships today.

## Implemented

- Rust workspace with shared protocol and embedded client core; pinned toolchain and dependency lockfile.
- Persistent bundled SQLite with WAL, FULL durability, foreign keys, transactional initial schema and optimistic generation checks.
- Versioned encrypted envelopes: Argon2id passphrase derivation, XChaCha20-Poly1305 authenticated encryption, independent recovery key wrapping and randomized nonces.
- Strict envelope validation before expensive key derivation; decimal string counters preserve the full unsigned 64-bit range.
- Native unlocked vault service with host/settings changes, encrypted credential storage, redacted renderer views, deletion tombstones and secret cleanup.
- Lock drops native secret/key owners. Wrong authentication does not replace an existing unlocked state with an empty vault.
- Tauri application connects the existing UI to native vault creation/unlock, encrypted host CRUD and appearance settings. Creation shows a recovery key once. Native worker isolates SQLite/KDF work from the WebView event loop; manual and 15-minute idle locking drop unlocked state.
- Tests cover reopening, wrong passwords, recovery, authenticated metadata tampering, unsupported KDF parameters, generation conflicts, corrupt file preservation, renderer redaction and absence of plaintext fixture labels/passwords in database files.

## Still required

OS lock integration; password rotation UI; verified legacy import; full SSH host trust and lifecycle; SFTP; synchronization server and client; mobile packaging; RDP/VNC. Platform feasibility results remain in `feasibility.md`.

Run `cargo test -p selfterm-core -p selfterm-protocol` for the portable core. On a native Tauri development machine run `cargo clippy --workspace --all-targets -- -D warnings`. Client launch instructions are in `apps/client/README.md`. Linux feasibility probe instructions remain in `probes/cross-platform/README.md`; that probe is separate from the production application.
