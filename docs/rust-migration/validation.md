# SelfTerm tekshiruv va release matritsasi

Sana: 2026-09-27. `PASS` faqat actual command/device dalili bilan qo‘yiladi. Ushbu faylda future Rust ishlarining hammasi hozir **NOT RUN**; bu reja, tayyor implementatsiya emas.

## Hozirgi Electron baseline

| Tekshiruv | Natija | Chegara |
| --- | --- | --- |
| `npm run build` | PASS | Vite production frontend; desktop launch/SSH emas |
| `node --check electron/main.cjs` | PASS | Syntax only |
| `node --check electron/preload.cjs` | PASS | Syntax only |
| `node --check server/server.js` | PASS | Syntax only |
| Legacy server health/auth/empty vault/invalid format/push-pull | PASS | Temp dir va synthetic data; real credentials yo‘q |
| `.gitignore` ignored vs tracked representative paths | PASS | Dependencies/output/secrets excluded, source/locks/templates retained |
| Real SSH session, host trust, agent/keyring | NOT RUN | Future regression fixtures kerak |
| Windows/macOS/mobile install | NOT RUN | Current build configuration Linux packaging |

## Client test matrix

| Invariant | Task | Zarur dalil |
| --- | --- | --- |
| App works without account/server/internet | A4/A8/C1 | Network requests0, no local listening HTTP server |
| Persistent SQLite survives restart/cache cleanup | A4/C1 | Separate process/device close+reopen, committed UUIDs preserved |
| Crash/disk full does not replace DB | A4 | Killed transaction + failure injection + old committed rows intact |
| Bundled SQLite contains WAL-reset fix | A1/A4 | `sqlite_version()` >=3.51.3 for every target |
| DB/WAL/backups contain no plaintext hosts/credentials | A4/C1 | Synthetic sentinel scan and encrypted roundtrip |
| Migration preserves IDs/groups/notes/settings/history | A5 | Legacy JSON/v1 fixture, no overwrite, duplicate import0 |
| OS-bound legacy passwords handled honestly | A5 | Same-device exporter; other-device PasswordRequired |
| Keys stored only after explicit import/save choice | A3/A5/C3 | Key/password opt-in/no plaintext export/renderer persistence |
| Wrong key/corrupt envelope rejected | A3/A4/B5 | Tamper nonce/ciphertext/AAD/UUID/epoch tests |
| Recovery unlock on new device | B6/C6 | Original device removed, saved recovery key works |
| Lock redacts UI and closes sessions | A8/C4 | Idle/OS/manual lock tests, committed ciphertext persists |
| Password/private key/desktop agent auth | A6 | OpenSSH fixture, per-platform agent evidence |
| Unknown/changed SSH identity verified | A6 | User prompt, changed key auth attempt count0 |
| PTY failure/cancel/close state correct | A6 | Never premature Connected, final event once |
| UTF-8 across chunks/output backpressure | A7 | Byte equality, emoji,10MiB fixture, <=1MiB queue |
| Hidden tab stays connected, close isolated | A7/A8 | StrictMode/tab lifecycle tests |
| Terminal output cannot auto-run native commands/clipboard writes | A7 | OSC52/links/capabilities negative tests |
| Terminal mobile keyboard/IME/touch works | C2 | Android+iOS actual keyboard/rotation/tablet evidence |
| Background/kill/reconnect never replays input | C4 | Actual devices, pending edits persisted |
| Desktop/mobile upgrade keeps SQLite | A9/C5 | Installed app upgrade, same profile/bundle ID |

## Backend/sync test matrix

| Invariant | Task | Zarur dalil |
| --- | --- | --- |
| Own server and managed service same API/image | B1/B7 | Same artifact, only config differs |
| User A cannot access user B | B2/B3 | GET/PUT/device/delete/versions all ownership covered |
| Token expiry/refresh rotation/reuse/revoke | B2 | Controlled time + concurrent rotation + immediate revocation |
| Account reset does not decrypt/erase vault | B2/B6 | Ciphertext same; recovery still required |
| CAS prevents lost update | B3 | Concurrent writes: exactly1 success, rest409 |
| PUT retry after response loss is idempotent | B3/B5 | Same revision/result within24h request scope |
| Quota/body/KDF concurrency bounded | B3/B4 | 413/429, parallel quota, memory allocation limit tests |
| Server/logs cannot see host plaintext/key/recovery | B3/B4 | Fixture sentinel absence DB/logs/metrics, server no decrypt dependency |
| Two clients merge distinct edits and expose true conflicts | B5 | Disjoint same-base edits + same-record/delete-vs-edit |
| Stale offline delete does not resurrect | B5 | Tombstone test after long simulated offline |
| Clock skew not winner policy | B5 | +/-24h device clocks, same merge result |
| Instance/URL switch does not leak auth | B5/B6 | Canonical origin/instance pin, no redirect auth forwarding |
| Key rotation correctly changes local and remote epochs | B6 | Old key cannot open future payload; local device/sync re-encrypted |
| Selfhost does not need central cloud | B7 | Central endpoint unavailable; own server account+sync work |
| Volume/server reboot preserve accounts and vaults | B7 | Container recreate/reboot + old encrypted payload decrypt |
| SMTP/verification/reset delivery reliable | B4/B8 | Durable outbox restart/retry and one-time tokens |
| Backup restores usable encrypted vault | B8 | Fresh DB restore, re-login, passphrase/recovery decrypt |
| Backup rollback is not silently trusted by old clients | B8 | New instance ID, old binding stops, explicit rebind preserves local edits |
| Cloud storage and load bounded | B8 | Measured p95/errors/CPU/RAM/DB/KDF queue |

## Platform evidence

| Platform | Build/test host | Package | Required actual checks |
| --- | --- | --- | --- |
| Windows x64 | Windows runner + real machine | Signed NSIS | WebView2, password/key/agent capability, secure store, resize, upgrade |
| Linux x64 | Linux native runner + X11/Wayland | AppImage/deb | WebKitGTK, DB permissions, unavailable keyring path, SSH, fonts |
| macOS x64/arm64 | macOS/Xcode | Signed/notarized app/dmg | Keychain, agent, GUI launch, permissions, upgrade |
| Android arm64 | SDK/NDK + real device | APK/AAB | Files/Keystore, IME, background, SQLite, sync, signing upgrade |
| iOS arm64 | macOS/Xcode + iPhone/iPad | Signed/TestFlight | Keychain/Files, soft keyboard, suspension, SQLite, sync, upgrade |

Minimum OS versions spec’dagi product targets; “supports version X” faqat shu OS/device evidence bilan. Linux current Fedora version CI’da aniq qayd etiladi; “all distributions/all phones” claim yo‘q.

## Verification commands (future implementation)

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --locked
npm --prefix apps/client ci
npm --prefix apps/client run typecheck
npm --prefix apps/client run test
npm --prefix apps/client run build
```

E2E commands implementationda exact scriptlarga yoziladi: SSH container fixture + PostgreSQL + two sync clients, deployment smoke va backup/restore harness. Hozirgi repoda Rust workspace/scripts hali mavjud emas; yuqoridagi future commandsni hozir o‘tgan deb hisoblamaslik.

## Release gate

1. M1 feasibility va dependency/toolchain pinlari dalilli.
2. Core+desktop parity va legacy importer tests pass.
3. Tenant/auth/encryption/CAS/sync tests pass, unresolved data-loss/security blocker0.
4. Selfhost fresh install/upgrade/restore va public cloud restore drill pass.
5. Android/iOS real-device keyboard/lifecycle/upgrade tests pass.
6. License/name policy, dependency notices, versioning, signed artifacts va release documentation tayyor.
7. Product description supported capabilitiesga mos; roadmap features shipped deb yozilmagan.
8. Owner-authorized publication scope va credentials mavjud; public cloud email/backups/incident ownership aniq.

## Evidence format

Har required test uchun quyidagilar yoziladi: source commit, test/command, timestamp UTC, runner/device+OS+architecture, result, artifact hash/log location (redacted), reviewer, known limitation. NOT RUN yoki SKIPPED PASS hisoblanmaydi. Baseline branch preservation uchun remote Git ref hashes tekshiriladi; source SHA yo‘q bo‘lsa release provenance to‘liq emas.

## Expanded scope gates — all currently NOT RUN

| Check | Owner | Required evidence |
| --- | --- | --- |
| Current Termius-like UI preserved | D1/D6 | Baseline screenshots, sidebar/hosts/tabs/themes unchanged, files closed/open layouts |
| SSH visible beside same-host SFTP | D6 | Terminal input/output continues during upload/edit/rename; independent panel close |
| Context menu and mobile long-press | D3/D7 | Keyboard/visible actions equivalent, gesture ambiguity and focus tests |
| Upload/download/replace atomic capability | D4 | Interrupted upload retains original; unsupported rename safe SaveAs; commit loss reconciliation |
| External writer/dirty editor | D5 | Fingerprint conflict, UTF-8/CRLF, bounded binary rejection; SFTP CAS limitation documented |
| Persistent encrypted drafts/queue | D4/D5 | Restart recovery, plaintext SQLite/WAL/log scan, lock cleanup |
| Mobile native files | D7 | Android URI/iOS scoped permissions, stream bounds, lost grant, actual devices |
| Profile schema + encrypted sync | E2/B5 | Legacy SSH ID/history preserved, old client rejects unsupported schema, protocol conflicts |
| RDP TLS/NLA/cert trust | E3 | Credentials never precede trust; changed cert blocked; actual Windows NLA/xrdp |
| VNC secure transport | E4 | Verified TLS or trusted in-process SSH; insecure default block, auth constraints |
| Bounded protocol/compositor | E4/E5 | Malformed lengths/rectangles, CopyRect ordering, stalled renderer, measured RSS/frame budgets |
| Desktop/mobile remote input | E6 | DPI/zoom/focus release, ViewOnly Rust gate, actual IME/touch/rotation |
| Clipboard and lifecycle | E7 | Default off, per-session permission, lock/background clears frame/input/secret data |
| All protocol stable release | D8/E8/C6 | Signed artifacts from reviewed commit, actual five-platform install/connect/use evidence |

These gates extend the earlier stable checklist; none has passed yet. RDP/VNC engines and mobile support remain conditional on E1 results. Transfer/desktop bytes never go through sync server. Full release cannot be called complete while D8/E8 are unresolved.
