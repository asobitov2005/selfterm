# A1 platform feasibility evidence

Status: work in progress. This is evidence from one Ubuntu 24.04 x86_64 development host, not a support claim for all five platforms. Record exact tool versions and command output for every eventual device run.

## Host and baseline

| Item | Result |
| --- | --- |
| Host OS/CPU | Ubuntu 24.04 x86_64 (container kernel reports Linux 7.0.0) |
| Node/npm | Node 22.22.0, npm 11.11.1 |
| Rust | stable 1.98.1 (`48a229cea`, installed 2026-09-27) |
| Existing Electron Vite production build | PASS: `npm run build`, Vite 6.4.3, 5.92 s |
| Tauri React/xterm probe frontend | PASS: `npm run build`, Vite 8.3.1; emits a >500 kB bundle warning |
| Native dependencies on host | WebKitGTK 4.1, GTK 3 and DBus development files absent; do not install system packages into the host for this probe |
| Linux container | Ubuntu 24.04 Docker image; official Tauri Linux development dependencies installed in disposable container |
| Display/session | X11 `:0`; user DBus session present and currently owns `org.freedesktop.secrets` |
| Android tools/devices | `adb` exists but no attached device, Java, Android SDK or NDK detected |
| Apple tools | No `xcodebuild`; iOS/macOS native validation unavailable on Linux |
| Windows tools | No Windows/MSVC/WebView2 runner in this environment |

## SSH, raw bytes and host trust

| Probe | Evidence | Result |
| --- | --- | --- |
| Byte chunk handling | `cargo test --locked --manifest-path probes/cross-platform/ssh-client/Cargo.toml` | PASS: 2 tests cover arbitrary byte order and exact host fingerprint pins; both were observed failing before implementation |
| Rust SSH compilation | `cargo build --locked --manifest-path probes/cross-platform/ssh-client/Cargo.toml` | PASS with `russh` 0.63.3, ring crypto backend, Rust 1.98.1 |
| Local OpenSSH Ed25519 session | `python3 probes/cross-platform/run-sshd-fixture.py` | PASS: synthetic key auth, pinned server key, command output, session teardown |
| Changed server key | Same loopback fixture with wrong SHA256 pin | PASS: rejected before user authentication |
| Tauri desktop IPC | `cargo build --locked --manifest-path src-tauri/Cargo.toml` in Ubuntu 24.04 container with Tauri Linux dependencies | PASS |
| 1 MiB Tauri/xterm channel | Native Tauri window under Ubuntu 24.04 Xvfb; Rust sent 64 × 16 KiB, frontend verified every byte and waited for xterm write callbacks | PASS; 303.0 ms observed for the probe pattern, not a general terminal performance guarantee |
| Terminal keyboard/input path | Typed ASCII plus Enter in xterm; Rust echoed each byte through a raw IPC channel and frontend compared exact bytes | PASS for ASCII; Unicode/IME and special-key matrix NOT RUN |
| Native Secret Service store/read/delete | Probe command started, but `keyring::Entry::new` did not return within the 16-second window; it never reached the synthetic write | NOT VERIFIED; no probe secret was written |
| Password and encrypted RSA SSH auth | Not implemented in the disposable client | NOT RUN |
| Argon2id 64 MiB / t3 / p4 unlock latency and RSS | Not implemented in probe | NOT RUN |

## Native target matrix

| Platform | Native build | App launch | Keyboard/input | Secure storage | Status |
| --- | --- | --- | --- | --- | --- |
| Ubuntu 24.04 x64 | PASS: native Tauri debug binary built in Ubuntu 24.04 dependency container | PASS: X11 window opened after starting Vite at `localhost:1420` | PASS for ASCII echo; broader keyboard/IME coverage pending | NOT VERIFIED: Secret Service initialization stalled before write | PARTIAL |
| Windows x64 | No Windows/MSVC/WebView2 runner available | NOT RUN | NOT RUN | NOT RUN | BLOCKED BY RUNNER |
| macOS x64/arm64 | No macOS runner/Xcode | NOT RUN | NOT RUN | NOT RUN | BLOCKED BY RUNNER |
| Android arm64 | No Java/SDK/NDK/device; `adb devices -l` reports no devices | NOT RUN | NOT RUN | NOT RUN | BLOCKED BY SDK/DEVICE |
| iOS arm64 | Tauri’s official prerequisites require macOS/Xcode; this host is Linux | NOT RUN | NOT RUN | NOT RUN | BLOCKED BY MACOS/XCODE |

## Gate decision

Do not create the production Rust workspace or call A1 complete until actual Windows, macOS, Android and iOS runners/devices are exercised; Linux still needs Secret Service initialization/write/read/delete and broader input coverage. Compile-only Rust targets can add early signal but cannot satisfy app launch/keyboard/secure-store evidence. Continue independent planning tasks only after the responsible platform owners can provide these environments, or explicitly revise the gate with the user.
