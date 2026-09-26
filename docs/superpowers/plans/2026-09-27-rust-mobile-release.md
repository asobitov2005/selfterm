# SelfTerm Android, iOS va Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Delegation faqat foydalanuvchi tanlagan execution usuli bo‘lsa ishlatiladi.

**Goal:** Umumiy Rust SSH/vault/sync yadrosini Android va iOS’da amaliy terminal UX bilan ishga tushirish, so‘ng besh platformada dalilli stable release.

**Architecture:** Tauri mobile shell desktopdagi Rust core/SSH/protocolni ishlatadi. React UI kichik ekran/keyboard/lifecyclega moslashtiriladi; platform keystore, keychain va document picker Rust adapter yoki kichik native plugin orqali ulanadi. Internetdagi sync service local-only uchun shart emas.

**Tech Stack:** Tauri2, Rust core/SSH, React/TypeScript/xterm.js, Android SDK/NDK, Kotlin platform glue when required, Xcode/Swift glue when required, Android Keystore/iOS Keychain, native platform CI and real-device testing.

**Spec:** [2026-09-27-rust-migration-design.md](../specs/2026-09-27-rust-migration-design.md)

## Global Constraints

- Brand: SelfTerm; rename uchun alohida owner qarori.
- Targets: Windows x64, Linux x64, macOS x64/arm64, Android arm64, iOS arm64.
- Client storage: persistent on-device SQLite, embedded in Rust; local HTTP server yoki local PostgreSQL talab qilinmaydi.
- No plaintext vault/SSH credentials/private keys in server, logs, backups, frontend persistence or Git.
- Unknown SSH host requires explicit fingerprint acceptance; changed key blocks connection.
- Mobil background execution va IP-change session survival kafolatlanmaydi; Mosh/relay scope’da yo‘q.
- Proposed mobile floors Android10/API29 va iOS16 A1 dalillari bilan tasdiqlanadi. UI min360 CSS px; imported key/password mobile baseline, desktop agent feature mobiles uchun va’da emas.
- Signed artifact, actual install va real-device test natijasisiz mobile release “supported” deb yozilmaydi.

## Review Focus

1. Keyboard/IME composition shell’ga ikki marta command yoki noto‘g‘ri Ctrl signal yubormasin — C2.
2. OS app’ni kill qilsa SQLite’dagi committed hosts va offline edits qolishi, cache cleanup DBga tegmasligi — C1/C4.
3. Document-picker URI/path boshqa platformada ishlatilmasin, imported private key browser persistence’ga tushmasin — C3.
4. Background/resume/network switch’da old shell input avtomatik replay qilinmasin — C4.
5. App upgrade/signing/product ID o‘zgarishi eski local data’ni yashirmasin yoki o‘chirmasin — C5/C6.

## Task C1: Native shell, persistent app data va secure-store adapters

**Files:** Create `apps/client/src-tauri/gen/android/` va `gen/apple/` native source/configs, `apps/client/src-tauri/src/mobile/{mod,storage,secrets}.rs`, platform-specific plugin source only needed; `docs/rust-migration/mobile-feasibility.md`, mobile test runner instructions.

**Interfaces:** Consumes A1 target evidence, A3 `SecretStore`, A4 `VaultRepository`; native `SecretStore` set/get/delete, app-data path and lifecycle events exposed narrow Rust adapter orqali. Android secure store wraps generated device unlock key with Keystore-backed key; iOS Keychain suitable accessibility class configured. No plain DB in app cache, no developer machine absolute path compiled in.

- [ ] **Step 1 — Failing acceptance:** Android/iOS real device local-only startup, SQLite saved-host restart and key store roundtrip initial `NOT RUN`; snapshot expected DB path outside temp/cache. `locked_secure_store_does_not_fallback_plaintext` test in adapter harness.
- [ ] **Step 2 — Implement:** Native builds, Android arm64/iOS arm64; bundle app identity `dev.selfterm.app`, displayName SelfTerm; platform permission/entitlement minimum. Bundle SQLite in Rust lib; single DB worker, WAL/FULL and native filesystem permissions.
- [ ] **Step 3 — Verify:** `npm --prefix apps/client run tauri android build -- --debug` and equivalent project-provided `tauri ios build -- --debug` scripts on macOS. Probe installed binary not only compile. Secure store unavailable/locked/error leads visible locked state, never hardcoded encryption key.
- [ ] **Step 4 — Persistence proof:** Create host -> force-stop -> restart -> host exists; OS cache cleanup -> DB exists; encrypted backup export/import -> same UUIDs; key store delete -> user can unlock using passphrase/recovery. Sensitive SQLite/WAL bytes scan matches A4 negative sentinel test.
- [ ] **Step 5 — Commit:** `feat: run SelfTerm Rust core with persistent mobile storage`.

## Task C2: Mobile terminal layout, keyboard, touch va accessibility

**Files:** Create `apps/client/src/features/terminal/{MobileKeyBar,useTerminalKeyboard}.tsx` (hook extension `.ts` where no JSX), `apps/client/src/features/terminal/keyboard.test.ts`, `apps/client/src/styles/mobile.css`; modify host/navigation/settings panels for narrow screen, no new backend semantics.

**Interfaces:** Existing A7 `write(sessionId, Uint8Array)` + `resize(TerminalSize)`; key translator pure function `encodeKey(input: KeyIntent) -> Uint8Array`, `KeyIntent` modifiers/keys/IME composition mapping. UI visual viewport adapts terminal height, safe area via CSS env; keybar never wraps user input into shell command.

- [ ] **Step 1 — Failing tests:** `ctrl_c_encodes_etx` -> bytes `[3]`; Esc `[27]`, Tab `[9]`, arrows conventional escape sequences; `ime_commits_once`, `paste_preserves_newlines_and_bracketed_paste_mode`, `modifier_resets_predictably`, `keyboard_resize_keeps_cursor_visible`.
- [ ] **Step 2 — Verify red:** Frontend keyboard/unit tests and small-screen integration fixtures on360/390/768 CSS px; tab/sidebar overlap assertions fail before adaptation.
- [ ] **Step 3 — Implement:** Ctrl/Alt/Esc/Tab/arrows strip, orientation/tablet split-view, keyboard safe area/visualViewport resize, accessible labels/touch targets >=44 CSS px. xterm native keyboard/composition pipeline authoritative; keybar injected only for explicit taps, no duplicate document-level key listener.
- [ ] **Step 4 — Verify green:** Android Gboard va iOS system keyboard real device: Latin, Uzbek apostrophe, Cyrillic, emoji, paste multiline, long selection, Ctrl-C during `sleep`, arrows in vim/top, tmux resize; hardware keyboard variant. Input never sent twice; manual screenshots/evidence to docs.
- [ ] **Step 5 — Commit:** `feat: make terminal input and layout usable on phones and tablets`.

## Task C3: Private-key import va mobile connection onboarding

**Files:** Create `apps/client/src-tauri/src/mobile/documents.rs`, `apps/client/src/features/hosts/ImportKey.tsx`, `apps/client/src/features/unlock/MobileUnlock.tsx`, `crates/selfterm-core/tests/key_import.rs`, `docs/users/mobile-keys.md`.

**Interfaces:** `import_key(selected_document: DocumentHandle, key_passphrase: Option<SecretString>) -> Result<ImportedKeyRef, AppError>` native picker handles user-granted file, bounded256KiB read Rust boundary; `ImportedKeyRef` internal secret UUID, public key fingerprint metadata. Core key bytes encrypted as VaultSecret; mobile path/URI never synced.

- [ ] **Step 1 — Failing tests:** `ed25519_import_and_connect`, `encrypted_rsa_prompts_passphrase`, `oversize_key_rejected`, `unsupported_format_visible_error`, `document_permission_revocation_does_not_break_imported_key`, `private_key_absent_from_browser_and_logs`. `LocalKey` copied host from desktop appears `needsLocalKeyBinding`, does not attempt desktop path.
- [ ] **Step 2 — Verify red:** `cargo test -p selfterm-core --test key_import`; native picker fixture test user cancellation -> `Cancelled`, no partial host/secret write.
- [ ] **Step 3 — Implement:** Document picker permission checks, import preview/fingerprint, explicit save into encrypted vault choice. Key passphrase transient; password-save choice preserved. Unknown-host fingerprint confirmation touch-accessible, changed-host-key reject still A6 invariant.
- [ ] **Step 4 — Verify green:** Import synthetic key via Android Files/iOS Files; restart app and connect; delete original selected file then imported key still works; cloud sync to second device only after explicit imported-key opt-in; account login alone cannot unlock key.
- [ ] **Step 5 — Commit:** `feat: import SSH keys safely on Android and iOS`.

## Task C4: Lifecycle, network changes va offline durability

**Files:** Create `apps/client/src-tauri/src/mobile/lifecycle.rs`, `apps/client/src/features/terminal/useSessionResume.ts`, `apps/client/src/features/sync/useForegroundSync.ts`, `docs/rust-migration/mobile-lifecycle-evidence.md`, core lifecycle integration tests.

**Interfaces:** Native foreground/background/OS-lock events -> shared `VaultService` and `SessionManager`; `resume` checks active transport, does not re-send input; B5 SyncEngine processes persisted queue only after unlock. App background flushes already queued mutations and stops new auth; closes sessions and locks vault at policy boundary, no indefinite background exception claim. On return user sees Closed/NeedsReconnect if transport unavailable.

- [ ] **Step 1 — Failing tests:** `background_preserves_committed_offline_edits`, `kill_during_sync_keeps_pending_mutation`, `resume_does_not_replay_command`, `wifi_to_cellular_change_shows_real_state`, `locked_vault_does_not_start_auth_or_sync`, `foreground_refresh_uses_one_token_rotation`.
- [ ] **Step 2 — Verify red:** Rust lifecycle/queue tests fake OS events; then device experiments airplane mode, screen lock, app switch, OS process kill. No “simulated background passed” substitutes for iOS behavior.
- [ ] **Step 3 — Implement:** Background transition blocks new input/auth, clears transient form secrets, records session state; execute lock policy with deterministic teardown. Pending SQLite commits finish before saved notification, sync transaction response loss B5 idempotency. Resume sync only foreground+unlocked; reconnect creates fresh SSH session with user intent.
- [ ] **Step 4 — Verify green:** Device tests min1min/5min background and force kill, app logs contain no secret; host count and queued edits stable on restart. Network switching disconnect acceptable, hidden command replay not acceptable. Document tmux on target as optional user workflow, not automatic local server/relay feature.
- [ ] **Step 5 — Commit:** `feat: handle mobile suspension and reconnect without data loss`.

## Task C5: Mobile CI, beta install va upgrade tests

**Files:** Create `.github/workflows/mobile-build.yml`, `docs/releases/mobile-beta.md`, `apps/client/src-tauri/tauri.{android,ios}.conf.json`, Android/iOS signing config secret references, `docs/rust-migration/mobile-upgrade.md`.

**Interfaces:** Android arm64 APK for beta and AAB for Play; iOS signed archive/TestFlight artifact on macOS. Android signing keystore and iOS certificates/profiles secret store’da; repo’da placeholders/native config only. Product bundle ID stable after first beta; DB paths derived OS APIs, legacy path bindings not guessed.

- [ ] **Step 1 — Failing gate:** Fresh Android/iOS build matrix, signed beta install, upgrade-with-data scenario must be `NOT RUN` until evidence. Record app1 host edits+pending sync -> app2 upgrade -> same DB/unlock/sync works, no app reinstall simulation.
- [ ] **Step 2 — Implement:** Cache SDK/toolchain safely, native shared project config checked in; generated build folders ignored, Gradle wrapper/Xcode shared schemes tracked. No secrets dumped `compose config`/build env/logs. Artifact SHA256 and version metadata captured.
- [ ] **Step 3 — Run:** Core mobile compile target, frontend typecheck/test/build, signed native beta archive/AAB. Provisioning/entitlements correct; real installation on Android/iPhone/iPad after CI build.
- [ ] **Step 4 — Verify:** Upgrade installed signed app over previous beta with persistent SQLite, background queue and imported keys; recovery on fresh second device; offline local-only startup no backend. Record supported OS floors based on devices actually tested.
- [ ] **Step 5 — Commit:** `ci: build and validate SelfTerm mobile beta artifacts`.

## Task C6: Besh platforma end-to-end parity va independent review

**Files:** Create `tests/e2e/cross-platform/README.md`, `docs/releases/acceptance.md`, `docs/rust-migration/review-findings.md`; update validation matrix with actual evidence.

**Interfaces:** Consumes A9 desktop, B6/B7 backend/recovery, C5 mobile. Produces signed release candidate per target and recorded unresolved blocker list. Independent review may be human or separately authorized agent; this plan does not auto-spawn reviewers.

- [ ] **Step 1 — Define scenario:** Linux local host -> encrypted cloud sync -> Windows edit -> Android offline edit -> macOS conflict resolution -> iOS recovery unlock -> selfhost destination migration. Test fixture infrastructure is owner-controlled, synthetic credentials only.
- [ ] **Step 2 — Execute:** Same UUID/group/secret/reference across platforms except device-local known-hosts/agent paths/history. Unknown host trust each device; password/key opt-in sync; deleted host not resurrected by stale device. Closed-selfhost operator account and open-cloud verified account flows both pass.
- [ ] **Step 3 — Review:** Ownership/auth/CAS/idempotency, AEAD nonce/AAD/key lifecycle, SQLite plaintext scan/crash recovery, native capability scopes, terminal control sequences and input streams. No severe unresolved security/data-loss findings allowed for release.
- [ ] **Step 4 — Verify:** [validation matrix](../../rust-migration/validation.md) every required row passes or explicitly limits product claim. Fixes get targeted regression tests, rerun impacted suites only; failing target marked beta/unavailable, not silently “all platforms”.
- [ ] **Step 5 — Commit:** `test: record cross-platform acceptance and security review`.

## Task C7: Stable release, upgrades va operational ownership

**Files:** Create `.github/workflows/release.yml`, `docs/releases/CHANGELOG.md`, `docs/users/{installation,local-backup,troubleshooting}.md`, `THIRD_PARTY_NOTICES.md`; add LICENSE only owner-selected license text, not guessed.

**Interfaces:** Release manifests with version/source commit/SHA256/signatures; GitHub release desktop artifacts, server multiarch image; Android/iOS store listings supported features exactly evidencega mos. Desktop auto-updater separate opt-in signed channel; mobile updates store-managed, remote JS bundle swap yo‘q.

- [ ] **Step 1 — Prepare reviewable release:** Install/build evidence, import/backup/restore docs, compatibility changes, owner license/brand/domain decision, platform signing credentials references, cloud incident/backup contact. Future capabilities label roadmap, shipped capabilities label supported.
- [ ] **Step 2 — Verify artifacts:** Desktop code-sign/notarization policy, mobile signing/entitlements, image provenance/SBOM/dependency licenses. Verify signed update refuses tampered package; app schema unsupported/newer rejects destructive startup.
- [ ] **Step 3 — Rollback drill:** Last supported client vs server API compatibility, server prior image on expanded schema, SQLite backup restore in isolated profile, untouched Electron snapshot recovery. Never overwrite current DB with older incompatible schema automatically.
- [ ] **Step 4 — Publish authorized artifacts:** Owner-authorized environment/store/GitHub release scope only, use same reviewed commit/artifacts; staged rollout, monitor auth/DB/email/storage/errors. Production public cloud launch follows B8 gate. If account/store/domain credentials absent, report concrete ready artifact and remaining external dependency, not fabricated publication.
- [ ] **Step 5 — Record:** Release acceptance version, dates, commit, artifact hashes, cloud image digest and measured operational results. `electronjs` remains original code lineage; stable Rust code main’da reviewed merges bilan.

## Handoff

C1 uses A1/A3/A4; C2 uses A7; C3 uses A3/A6; C4 uses A4/A6/B5; C5 requires C1–C4. C6 requires all desktop/backend/mobile betas. C7 requires C6 and B8 for public cloud. Browser-only support, background roaming, billing/team vault featurelari alohida keyingi reja.
