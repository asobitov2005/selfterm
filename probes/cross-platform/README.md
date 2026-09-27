# Disposable Rust/Tauri feasibility probe

This directory is a throwaway A1 probe. It is not SelfTerm production code and must not be moved into the app unchanged.

## Linux x64

The React + xterm.js UI checks 1 MiB of raw output in 64 ordered 16 KiB Tauri channel responses. Its byte pattern exercises NUL, ANSI control, split UTF-8 and invalid UTF-8 bytes; the frontend verifies every byte and waits for xterm.js to process each write. Typing in the terminal sends UTF-8 input through a scoped command/channel. A separate button writes, reads and deletes a uniquely named synthetic credential through the OS keyring adapter.

`ssh-client/` is a standalone Rust SSH client spike using `russh`. It pins the presented host key before Ed25519 authentication, opens a fixed fixture command, preserves output chunks as bytes, and disconnects. The fixture creates temporary host/user keys and starts a loopback-only OpenSSH daemon:

```sh
cargo test --locked --manifest-path ssh-client/Cargo.toml
cargo build --locked --manifest-path ssh-client/Cargo.toml
python3 run-sshd-fixture.py
```

Measure the planned Argon2id derivation with public synthetic inputs in an optimized build (the tool never prints the derived key):

```sh
cargo build --locked --release --example kdf --manifest-path ssh-client/Cargo.toml
/usr/bin/time -v ssh-client/target/release/examples/kdf
```

Record all three timings and peak RSS. This excludes DB decryption and UI work; device unlock latency still needs separate measurements.

Build the Tauri window on Ubuntu 24.04 with the [official Tauri Linux dependencies](https://tauri.app/start/prerequisites/). Then run `npm install`, `npm run build`, and `npm run tauri dev` inside this directory. Press **Test Rust output** and **Test secure storage**; type `o‘zbek ✓`, Enter, arrows, and Ctrl+C. Record OS/WebKitGTK versions, secure-store provider/result, 1 MiB callback time, terminal render latency, RSS, and artifacts in `../../docs/rust-migration/feasibility.md`.

Launch through `npm run tauri dev`, which starts Vite before the native window. Running the debug binary alone requires Vite to be running at `http://localhost:1420`; otherwise the window displays `Connection refused`. Release builds embed the frontend and do not require Vite. This development server is not the sync backend.

Run the app as your ordinary desktop user, in the same DBus session as the OS credential store. The stream and synthetic credential probes run automatically; credentials are deleted after readback. Do not run the app with sudo. If previous container builds created root-owned build artifacts, use a separate user-owned target directory:

```sh
CARGO_TARGET_DIR="$HOME/.cache/selfterm-probe/target" npm run tauri dev
```

## Other platforms

Do not mark a target supported from this Linux host or from a Rust target-only compile. Windows needs its native MSVC/WebView2 environment; Android needs Android Studio/JDK/SDK/NDK and a real device; macOS/iOS need macOS/Xcode and Apple hardware/signing for a real app run. Follow Tauri’s current platform prerequisite list and record each target independently. The iOS prerequisite is macOS-only.

Never use personal server credentials or private keys in this probe. The SSH script generates and removes temporary keys and binds the test server only to loopback. The keyring command stores a random-scope synthetic byte string and deletes it; if cleanup fails, report the test account identifier only after locating it in the OS credential manager.
