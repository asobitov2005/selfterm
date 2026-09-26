# SelfTerm Rust Core va Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Delegation faqat foydalanuvchi tanlagan execution usuli bo‘lsa ishlatiladi.

**Goal:** Mavjud Electron ilovasining funksiyalarini yo‘qotmasdan persistent SQLite, encrypted vault va xavfsiz Rust SSH bilan Windows/Linux/macOS Tauri beta yaratish.

**Architecture:** Rust core platform-independent domain, cryptography, local SQLite va sync contractlarini egallaydi. Rust SSH sessiyalari alohida crate’da; Tauri faqat typed adapter, React/xterm.js UI saqlanadi. Mobil feasibility boshida tekshiriladi, yakuniy mobil release C rejasida.

**Tech Stack:** Rust stable pinned after probe, Tauri 2, Tokio, russh, rusqlite bundled SQLite, RustCrypto Argon2id/XChaCha/HKDF, serde/uuid, React/TypeScript/Vite/xterm.js, Vitest, OpenSSH container fixture.

**Spec:** [2026-09-27-rust-migration-design.md](../specs/2026-09-27-rust-migration-design.md)

## Global Constraints

- Brand: SelfTerm; rename uchun alohida owner qarori.
- Runtime: Rust core/server; Tauri 2 + React/TypeScript/xterm.js UI; Electron/Node.js runtime yangi clientga kirmaydi.
- Targets: Windows x64, Linux x64, macOS x64/arm64, Android arm64, iOS arm64.
- Client storage: persistent on-device SQLite, embedded in Rust; local HTTP server yoki local PostgreSQL talab qilinmaydi.
- No plaintext vault/SSH credentials/private keys in server, logs, backups, frontend persistence or Git.
- V1 faqat import/read compatibility; yangi v1 writes va unattended destructive replacement yo‘q.
- Unknown SSH host requires explicit fingerprint acceptance; changed key blocks connection.
- Mobil background execution va IP-change session survival kafolatlanmaydi; Mosh/relay scope’da yo‘q.
- Spec’dagi validation limits, crypto parameters, proposed OS floors va session queue/timeout limitlari aynan qo‘llanadi; M1 dalillari asosida spec o‘zgarishi alohida review qilinadi.

## Review Focus

1. Process kill yoki disk full vaqtida UI “saved” degan profil keyingi startup’da yo‘qolmasligi — A4.
2. Legacy saved password boshqa OS’da decrypt bo‘lmasa host saqlansin, original overwrite qilinmasin — A5.
3. Split UTF-8 va kuchli terminal output buffering’da bytes yo‘qolmasin — A6/A7.
4. Known host key almashsa password/private key authentication oldidan connection bloklansin — A6.
5. React StrictMode, tab switch va vault lock sessiya/secret leak yoki double-connect yaratmasin — A7/A8.

## Task A1: Besh platforma feasibility probe va reproducible workspace

**Files:** Create `probes/cross-platform/README.md`, `probes/cross-platform/src/main.rs`, `probes/cross-platform/ui/terminal.ts`, `docs/rust-migration/feasibility.md`; successful probe’dan keyin create root `Cargo.toml`, `rust-toolchain.toml`, `crates/*/Cargo.toml`, `apps/client/package.json`, `apps/client/src-tauri/tauri.conf.json`. Existing root frontend shu bosqichda o‘chirilmaydi.

**Interfaces:** Produces verified toolchain/dependency lock, target matrix, secure-store feasibility va byte-channel measurement. Probe disposable; uning kodini production deb merge qilmaslik. A2 uchun approved workspace member names `selfterm-core`, `selfterm-protocol`, `selfterm-ssh`, `selfterm-client`, `selfterm-server`.

- [ ] **Step 1 — Failing acceptance baseline:** Har platformada compile+launch, terminalga raw bytes write, software keyboard input, SSH fixture connect, OS store set/get/delete hali dalilsiz ekanini feasibility matritsasida `NOT RUN` bilan yozish. Desktop/mobile practical OS floorsni spec bilan solishtirish.
- [ ] **Step 2 — Probe:** Windows/Linux/macOS native runner va Android/iOS real device’da kichik Tauri shell ishlatish. `russh` password/Ed25519/encrypted RSA auth va secure store’ni tekshirish. Windows agent named pipe qo‘llanishini alohida tekshirish; universal agent claim qilmaslik.
- [ ] **Step 3 — Measure:** Argon2id 64MiB/t3/p4 unlock latency/RSS, terminal 16KiB chunks/1MiB queue, ASCII va IME keyboard natijalarini `feasibility.md`ga device/OS/library versions bilan yozish. Initial UX budget unlock <=2s va single active terminal 2MiB/min output’da responsive input; failing measurement spec’ni qayta ko‘rishga sabab.
- [ ] **Step 4 — Gate:** `cargo check --locked` har qo‘llangan target, frontend build va real-device checklist natijalari mavjud bo‘lsin. iOS compile on macOS. Failure bo‘lsa aynan library/plugin/OS muammosini qayd qilish va yechimni tekshirish; “Tauri supports mobile” bilan yopmaslik.
- [ ] **Step 5 — Commit:** `chore: establish verified Rust workspace and platform feasibility`. Pin tested exact Rust toolchain, Cargo.lock/package-lock va MSRV policy; `electronjs`ga push qilmaslik.

## Task A2: Domain/protocol DTO, errors va contract fixtures

**Files:** Create `crates/selfterm-core/src/{lib,domain,public_view,error}.rs`, `crates/selfterm-protocol/src/{lib,envelope,auth,error}.rs`, `crates/selfterm-core/tests/domain.rs`, `crates/selfterm-protocol/tests/envelope.rs`, `tests/fixtures/v2-contract.json`, `docs/rust-migration/contracts.md`.

**Interfaces:** Produces spec’dagi `Host`, `CredentialRef`, `VaultPayload`, `VaultSecret`, `Tombstone`, `AppearanceSettings`, `PublicHost`, `PublicVault`, IDs; `DecimalU64`, `EnvelopeV2`, `VaultResponse { envelope, revision }`, `AuthTokens`, `ApiError`, `SyncBinding { origin, instance_id, user_id, vault_id }`. `AppError` codes include `Locked`, `InvalidInput`, `CorruptStorage`, `UnsupportedSchema`, `WrongKey`, `Conflict`, `AuthRequired`, `KeyRequired`, `RollbackDetected`, `InstanceChanged`, `UnsupportedAuth`, `HostKeyChanged`, `Cancelled`, `Io`, `Network`. Integer counters Rust u64, JSON/TS decimal strings.

- [ ] **Step 1 — Failing tests:** `rejects_zero_and_overflow_ports`, `preserves_unicode_notes`, `public_view_redacts_all_secret_fields`, `rejects_unknown_envelope_suite`, `rejects_oversized_or_wrong_length_wrappers`; assertions: port 0/65536 rejected, 65535 accepted; serialized PublicVault has no password/privateKey/token/secret value.
- [ ] **Step 2 — Verify red:** `cargo test -p selfterm-core --test domain` va `cargo test -p selfterm-protocol --test envelope`; production contracts yo‘qligi yoki validation yetishmasligi sabab fail.
- [ ] **Step 3 — Implement:** `Host::validate(&self) -> Result<(), AppError>`, `PublicVault::from_payload(&VaultPayload) -> Self`, `EnvelopeV2::validate(&self) -> Result<(), ProtocolError>`. UUID/size/color/auth validation spec bo‘yicha; `serde` unknown security-critical fields reject. Wrappers suite exact allowed values bilan bounded.
- [ ] **Step 4 — Verify green:** Yuqoridagi testlar; `cargo fmt --check`; fixture JSON roundtrip Rust va kelajak TSga mos. `contracts.md` field casing va error mapping aniq yozilgan bo‘lsin.
- [ ] **Step 5 — Commit:** `feat: define validated vault and sync protocol contracts`.

## Task A3: Encryption, wrappers, lock va recovery

**Files:** Create `crates/selfterm-core/src/{crypto,secrets}.rs`, `crates/selfterm-core/tests/crypto.rs`, `tests/fixtures/crypto-v2.json` (synthetic), `docs/rust-migration/crypto-review.md`.

**Interfaces:** `VaultKey::generate() -> VaultKey`; `seal(payload: &VaultPayload, key: &VaultKey, context: VaultContext) -> Result<EncryptedPayload, AppError>`; `open(payload: &EncryptedPayload, key: &VaultKey, context: VaultContext) -> Result<VaultPayload, AppError>`; `wrap_key(key, passphrase, context) -> Result<PassphraseWrap, AppError>`; `unwrap_key(wrapper, passphrase, context) -> Result<VaultKey, AppError>`; recovery wrap/unwrap analoglari `RecoveryKey` bilan; `derive_device_key`/`derive_sync_key` spec HKDF bilan. `VaultContext { vault_id, key_epoch }`. `SecretStore` trait: `put/get/delete` platform adapter uchun.

- [ ] **Step 1 — Failing tests:** `wrong_passphrase_fails`, `tampered_ciphertext_nonce_or_aad_fails`, `fresh_nonce_per_seal`, `recovery_unlocks_same_dek`, `passphrase_change_keeps_payload_readable`, `device_and_sync_keys_are_distinct`, `host_secret_not_in_serialized_envelope`. AAD boshqa UUID/key_epoch/domain’da authenticate bo‘lmasin.
- [ ] **Step 2 — Verify red:** `cargo test -p selfterm-core --test crypto`.
- [ ] **Step 3 — Implement:** V2 XChaCha/Argon2id params exactly spec; CSPRNG nonce/salt; `SecretBox`/redacted Debug; plaintext serialization faqat encryption boundary’da. Recovery key userga bir marta ko‘rsatiladi; server DTO’da recovery plaintext field yo‘q.
- [ ] **Step 4 — Verify green:** `cargo test -p selfterm-core --test crypto`; deterministic synthetic fixture authenticated decryption; negative malformed KDF/nonce fuzz cases; external crypto-review checklistga suite/nonce/AAD/key lifecycle dalillarini yozish. Existing sessions lock’da close qilish A8’da.
- [ ] **Step 5 — Commit:** `feat: encrypt vaults and add passphrase and recovery unlock`.

## Task A4: Persistent SQLite va crash-safe mutationlar

**Files:** Create `crates/selfterm-core/src/storage.rs`, `crates/selfterm-core/src/storage/migrations/0001.sql`, `crates/selfterm-core/tests/storage.rs`, `crates/selfterm-core/tests/support/storage_child.rs`, `apps/client/src-tauri/src/platform_paths.rs`.

**Interfaces:** `VaultRepository::open(path: PathBuf) -> Result<Self, AppError>`; async actor methods `load(vault_id) -> Result<StoredVault, AppError>`, `commit(change: LocalCommit) -> Result<u64, AppError>`, `backup(destination: PathBuf) -> Result<(), AppError>`. `StoredVault { envelope, local_generation, encrypted_device_state, encrypted_sync_state }`; `LocalCommit` includes all same-vault ciphertext changes + optional import digest. `VaultService` actor encrypts domain changes BEFORE DB query and returns PublicVault AFTER committed transaction. Production path persistent per-platform app-data, never tmp/cache/in-memory.

- [ ] **Step 1 — Failing tests:** `committed_host_survives_process_restart`, `killed_transaction_does_not_destroy_previous_commit`, `disk_full_returns_error_without_saved_ack`, `corrupt_database_is_not_replaced`, `backup_includes_uncheckpointed_commits`, `database_wal_and_logs_contain_no_plaintext_sentinel`. Fixture sentinel `synthetic-secret-must-not-be-on-disk`; raw sqlite/DB/WAL/backup scan should not find it.
- [ ] **Step 2 — Verify red:** `cargo test -p selfterm-core --test storage`; separate subprocess kill assertion, no in-memory-only durability test.
- [ ] **Step 3 — Implement:** `rusqlite` bundled SQLite >=3.51.3 + dedicated worker; actual linked version CI’da assert; WAL/FULL/foreign_keys/busy_timeout values spec’dagi. Migrations transaction+backup; encrypted envelope/device/sync+import ledger one commit. Unix private permissions + Windows user ACL, no startup deletion of WAL. Multi-instance DB mutation expected generation CAS localda ham stale write’ni rad qiladi.
- [ ] **Step 4 — Verify green:** Storage suite native desktop OS’da; no bind/listen sockets while local-only; close/reopen/upgrade backup fixture integrity. SQLite backup API’dan foydalanish, active DB yolg‘iz file-copy qilmaslik.
- [ ] **Step 5 — Commit:** `feat: persist encrypted local vault state in SQLite`.

## Task A5: Electron JSON/v1 sync import va portable encrypted export

**Files:** Create `crates/selfterm-core/src/legacy.rs`, `crates/selfterm-core/tests/legacy.rs`, `tools/legacy-export/main.cjs`, `tools/legacy-export/package.json`, `tests/fixtures/legacy/*`, `docs/rust-migration/import.md`.

**Interfaces:** `preview_local(bytes: &[u8]) -> Result<ImportPreview, AppError>`; `preview_v1(blob: LegacyEnvelope, passphrase: SecretString) -> Result<ImportPreview, AppError>`; `apply_import(preview: ApprovedImport, service: &VaultService) -> Result<ImportReport, AppError>`. `ImportPreview` contains preserved IDs, warnings `PasswordRequired`/`LocalKeyBindingRequired` va source_digest. Exporter same Electron device/accountda existing safeStorage secretlarni decrypt qilib V2 encrypted-transfer contractga chiqaradi; `legacy-export` uchun synthetic test va user-run instructions; default no key-file export.

- [ ] **Step 1 — Failing tests:** `v1_node_fixture_decrypts_in_rust`, `wrong_v1_key_preserves_original`, `remote_v1_does_not_invent_history`, `os_bound_password_is_flagged`, `duplicate_import_is_idempotent`, `local_key_path_does_not_become_synced_secret`. Node scrypt N16384/r8/p1 AES-GCM fixture Rustda bir xil hosts berishi kerak.
- [ ] **Step 2 — Verify red:** `cargo test -p selfterm-core --test legacy`; synthetic export roundtrip testi exporter yo‘qligida fail.
- [ ] **Step 3 — Implement:** V1 bounded read only; local JSON appearance/history preserved; path binding only current device. Exporter exact legacy app identity/userData path explicit user selection bilan, `basic_text` reject, plaintext temp files/logs yo‘q. Source never mutated; SQLite import transaction old/new checks bilan.
- [ ] **Step 4 — Verify green:** Legacy suite + exporter synthetic Electron integration; old JSON byte-for-byte unchanged; DB restore old/new host count equals preview; repeat import duplicates zero. Existing root package name `selfterm-linux` va appId `dev.selfterm.linux` legacy identifiers sifatida faqat detection uchun; yangi productName `SelfTerm`, package `selfterm`, appId `dev.selfterm.app` A8’da explicit migration bilan.
- [ ] **Step 5 — Commit:** `feat: migrate legacy Electron vaults without data loss`.

## Task A6: SSH identity trust, auth va session lifecycle

**Files:** Create `crates/selfterm-ssh/src/{lib,auth,host_keys,sessions,transport,error}.rs`, `crates/selfterm-ssh/tests/{host_keys,auth,sessions}.rs`, `tests/e2e/ssh/compose.yml`, `tests/e2e/ssh/Dockerfile`, `tests/e2e/ssh/fixture.sh`.

**Interfaces:** Spec SSH methods `connect/write/resize/disconnect/ack_output`; `ConnectRequest { host_id, auth_input, initial_size }`, `SessionId(Uuid)`, `SessionEvent { session_id, seq, kind }`, `OutputSink` bounded receiver, `TrustDecision { challenge_id, accept }`. `SessionManager::resolve_host_key(TrustDecision)`; `HostKeyStore` implemented via core encrypted device_state. Fake/in-process server test double counts authentication attempts; fixture supports Ed25519/RSA/password/wrong-key/banner/PTTY rejection.

- [ ] **Step 1 — Failing tests:** `unknown_key_waits_for_acceptance`, `changed_key_blocks_before_auth`, `wrong_password_does_not_save_history`, `password_and_encrypted_key_auth_work`, `agent_unavailable_is_explicit`, `cancel_closes_connect_attempt`, `pty_failure_not_connected`, `close_emitted_exactly_once`.
- [ ] **Step 2 — Verify red:** `cargo test -p selfterm-ssh`; start synthetic OpenSSH fixture for auth test; no connection to user production servers.
- [ ] **Step 3 — Implement:** `russh` with explicit host trust handler; deadline20s/keepalive15s; all credential lookup Rust-only. PTY size clamp/reject1..1000; late resize retained; cancel teardown; session ID owner bound. No stdout debug with key/password.
- [ ] **Step 4 — Verify green:** Native desktop tests and known-hosts persistence after restart. Changed-key test asserts `authentication_attempts == 0`. Successful PTY writes exactly one history entry, capped100. Agent Unix/Windows features claim only after platform probe passes.
- [ ] **Step 5 — Commit:** `feat: add verified SSH identities and Rust session lifecycle`.

## Task A7: Byte transport va typed Tauri bridge

**Files:** Create `apps/client/src-tauri/src/{lib,commands,state}.rs`, `apps/client/src-tauri/capabilities/default.json`, `apps/client/src/platform/{api,tauri,terminal-stream}.ts`, `apps/client/src/platform/terminal-stream.test.ts`, `crates/selfterm-ssh/tests/transport.rs`.

**Interfaces:** TS `SelfTermApi`: `getVault`, `saveHost`, `deleteHost`, `saveSettings`, `selectKey`, `connect`, `write`, `resize`, `disconnect`, `onSessionEvent`, `lock`, `unlock`; DTO/errors use A2. Output `Uint8Array` per session with sequence; renderer callback -> `ackOutput(sessionId, seq)`. Tauri channels scoped per authorized client window. Compatibility shim adapts old `window.selfterm` calls during port; removed only after A8.

- [ ] **Step 1 — Failing tests:** `split_utf8_preserves_bytes` feeds `[0xF0,0x9F]` then `[0x98,0x80]`, asserts xterm renders one emoji; `high_output_applies_backpressure_without_drops`; `hidden_tab_preserves_session`; `window_cannot_write_other_sessions`; `output_osc52_does_not_write_clipboard`.
- [ ] **Step 2 — Verify red:** `cargo test -p selfterm-ssh --test transport`; `npm --prefix apps/client run test -- terminal-stream` after Vitest setup.
- [ ] **Step 3 — Implement:** 16KiB chunks/1MiB queue, ack from xterm callback; writable capacity accounting and ordered final event. No terminal `.toString('utf8')` per chunk, no unbounded event broadcast. Minimum native capabilities/CSP, disable remote navigation and arbitrary shell/fs access.
- [ ] **Step 4 — Verify green:** Byte-for-byte output comparison for 10MiB stream including random chunk splits; peak per-session queue <=1MiB; UI stays responsive. xterm OSC52 auto clipboard disabled; write attempts before Connected produce typed state error.
- [ ] **Step 5 — Commit:** `feat: bridge Rust SSH streams to xterm with bounded byte transport`.

## Task A8: Desktop feature parity, unlock UX va branding

**Files:** Move frontend source to `apps/client/src`; create `features/{hosts,terminal,history,settings,unlock}/`, `features/unlock/unlock.test.tsx`, `features/terminal/lifecycle.test.tsx`, `apps/client/src-tauri/src/platform_secrets.rs`; modify root `package.json` as workspace scripts, Vite config, README. Preserve package-lock resolution during workspace conversion.

**Interfaces:** UI state uses PublicVault; secrets transient ConnectInput, never persisted UI state. `VaultService::{unlock,lock,public_view,save_host,delete_host,save_appearance,record_connection}` backed by A4. Lock closes sessions, clears decrypted memory/UI, persistent ciphertext stays intact. New branding `SelfTerm`, internal `selfterm`, `dev.selfterm.app`; A5 legacy data detection before first-run empty-vault UI.

- [ ] **Step 1 — Failing tests:** Host CRUD/search/groups, theme/font limits baseline parity; `strict_mode_starts_one_session`, `switch_tab_does_not_disconnect`, `closing_one_tab_keeps_other_tabs`, `lock_closes_all_sessions_and_redacts_hosts`, `no_keyring_requires_passphrase_each_restart`, `old_installation_is_detected_before_empty_vault_created`.
- [ ] **Step 2 — Verify red:** `npm --prefix apps/client run test`; UI fixture tests fail before actual feature modules/bridge exist. Use fake typed API for UI, actual Rust core via integration for persistence.
- [ ] **Step 3 — Implement:** Port bounded feature-by-feature; small files per responsibility; preserve current desktop UI/themes/fonts. Secure store adapter OS-specific; no plaintext fallback. 15min idle lock and OS-lock event handling; keyboard shortcuts scoped, settings input validation core-side authoritative.
- [ ] **Step 4 — Verify green:** Frontend tests/build/typecheck, Rust tests, full desktop checklist. Password fields cleared after command, no local/sessionStorage secrets, developer tools disabled release. Existing baseline untouched on `electronjs`; root legacy sources removed only when Rust parity build passes and legacy importer available.
- [ ] **Step 5 — Commit:** `feat: complete SelfTerm desktop parity on Tauri`.

## Task A9: Desktop CI, beta packages va rollback proof

**Files:** Create `.github/workflows/{checks,desktop-build}.yml`, `apps/client/src-tauri/tauri.{windows,linux,macos}.conf.json`, `docs/releases/desktop-beta.md`, `docs/rust-migration/desktop-evidence.md`.

**Interfaces:** Produces installable Linux AppImage/deb, Windows NSIS installer, macOS app/dmg x64/arm64. Unsigned build artifacts clearly labeled; signed public release in C7. CI commands use npm scripts from A8; cargo features mobile-independent.

- [ ] **Step 1 — Failing gate:** Fresh runners cannot assume global libs/keyring. Define matrix installation, Rust fmt/clippy/test, frontend typecheck/test/build and per-platform packaging. Create fixture “Electron import -> Rust edits -> restore Electron original” with documented non-backport behavior.
- [ ] **Step 2 — Implement CI:** Native runners, pinned toolchain/action SHAs, build cache no secrets/DB, `cargo ... --locked`, `npm ci`; Linux WebKitGTK deps and headless fixture; Windows/macOS packaging native.
- [ ] **Step 3 — Run:** `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace --locked`, client `typecheck/test/build`, `tauri build` for each native target. macOS graphical integration uses manual evidence if automation unavailable.
- [ ] **Step 4 — Verify:** Install fresh profile, import old profile, close/restart and upgrade beta. App listener inspection confirms local-only has no HTTP server. Evidence includes device OS/version, artifact SHA256, host CRUD/SSH/resize/keyring/lock tests; memory/size measurements recorded without arbitrary marketing guarantees.
- [ ] **Step 5 — Commit:** `ci: verify and package SelfTerm desktop beta`; branch ready for reviewed merge to main. Stop claiming M3 complete if a target only compiles but has not run.

## Dependency va handoff

A1 -> A2 -> A3 -> A4 -> A5; A6 uses A2/A4, A7 uses A6, A8 uses A3–A7, A9 uses A8. B1 begins after A2 contract; B5 client sync after A4/A8. C1 can begin early feasibility after A1, stable mobile release after B5/B6. Owner review of this plan precedes production implementation; this planning task does not execute any A task.

## Expanded UI/SFTP/RDP/VNC integration contract

User-approved planning scope now includes D/E plans: [UI/SFTP](2026-09-27-ui-sftp.md), [RDP/VNC](2026-09-27-rdp-vnc.md). Existing Termius-like SelfTerm UI must remain visually consistent; preserve sidebar/hosts/tabs/themes/fonts, additive panels only. E2 owns Host->ConnectionProfile schema migration (legacy IDs/history/secrets preserved); A2 supplies base IDs/envelope/error contracts. A6 transport is refcounted for PTY/SFTP/scoped VNC SSH channels; A7 exposes narrowly scoped adapters, A8 keeps current UI. B5 merges connection profiles and tombstones, never file contents/screens/clipboard; server envelope contract is unchanged. C4 background/lock interrupts transfers explicitly and closes graphical sessions; no silent transfer restart/input replay. C6/C7 full stable distribution requires D8 and E8 all-platform evidence. Earlier SSH-only beta can remain separately labeled.
