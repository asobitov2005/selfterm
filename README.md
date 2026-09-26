# SelfTerm Linux

SelfTerm is a Linux desktop SSH manager with a self-hosted encrypted sync server.

It is designed around a Termius-like workflow: a compact host vault, saved SSH profiles, terminal tabs, and push/pull sync to your own server. It does not use Termius branding, services, or proprietary assets.

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

- Passwords are requested per session and are not saved.
- Private keys are read from your local file path when connecting.
- Sync uses AES-256-GCM with a key derived from your passphrase via scrypt.
- Put the sync server behind Tailscale, WireGuard, Cloudflare Access, or a reverse proxy with HTTPS.
