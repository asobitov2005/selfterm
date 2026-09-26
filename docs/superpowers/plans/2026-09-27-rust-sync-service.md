# SelfTerm Rust Sync Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Delegation faqat foydalanuvchi tanlagan execution usuli bo‘lsa ishlatiladi.

**Goal:** Bitta Rust backendni ham self-hosted, ham umumiy cloud sifatida ishlatish; tenantlar ajratilgan, server plaintext’ni ko‘rmaydigan va offline/conflict-safe client sync.

**Architecture:** Axum API opaque session tokens orqali account/device auth qiladi; PostgreSQL per-user encrypted envelopesni atomic CAS bilan saqlaydi. Rust client SQLite’dagi local state va base snapshotdan three-way merge qiladi. Cloud va self-hosted orasidagi farq registration/SMTP/limits/operator konfiguratsiyasida, protocol/image’da emas.

**Tech Stack:** Rust Axum/Tokio, SQLx/PostgreSQL16, Argon2id, serde, tracing, reqwest/Rustls, Docker Compose/Caddy, SMTP outbox, core/protocol crates A rejasidan.

**Spec:** [2026-09-27-rust-migration-design.md](../specs/2026-09-27-rust-migration-design.md)

## Global Constraints

- Local-only account/backend’siz ishlaydi. Cloud va self-hosted bir xil image/API; Postgres yagona server DB engine.
- Client storage: persistent on-device SQLite, embedded in Rust; local HTTP server yoki local PostgreSQL talab qilinmaydi.
- Protocol: `/v1`, payload `selfterm-vault-v2`, SHA-256 SSH fingerprints, ISO8601 UTC server audit timestamps; client wall-clock conflict resolution uchun ishlatilmaydi.
- No plaintext vault/SSH credentials/private keys in server, logs, backups, frontend persistence or Git.
- Losing every unlocked device, passphrase and recovery key means encrypted data is unrecoverable; account password reset alone does not decrypt it.
- V1 faqat import/read compatibility; yangi v1 writes va unattended destructive replacement yo‘q.
- Limits/auth TTL/envelope/crypto values spec’dan aynan olinadi. Deploy secretlar actual Gitga yozilmaydi.
- Public production launch bu plan review vazifasida emas; image va test/staging dalillari tayyorlangandan keyingi alohida deployment.

## Review Focus

1. User A UUID’ni bilsa ham User B vault/device/version/delete’iga kira olmasin — B2/B3.
2. PUT response network’da yo‘qolganda retry ikkinchi revision yozmasin — B3/B5.
3. Device refresh concurrency/revocation eski session’ni qayta tiriltirmasin — B2/B5.
4. Offline delete vs edit, clock skew va instance switch lokal ma’lumotni yo‘qotmasin — B5.
5. Backup restore’da DB borligi bilan cheklanmay, eski ciphertext real kalit bilan ochilsin — B6/B8.

## Task B1: Server DB, readiness va instance contract

**Files:** Create `apps/server/src/{main,lib,config,health,repo}.rs`, `apps/server/migrations/{0001_identity,0002_vaults,0003_outbox_audit}.sql`, `apps/server/tests/startup.rs`, `apps/server/tests/support/mod.rs`, `apps/server/Cargo.toml`.

**Interfaces:** Consumes A2 `EnvelopeV2/ApiError/AuthTokens`. Produces `AppState { pool, config, clock, mailer }`, `build_router(state: AppState) -> Router`, `Config::load() -> Result<Config, ConfigError>`, durable `InstanceId`. Test `Harness::start(registration_mode)` gives two independently seeded user fixtures, HTTP client, synthetic mail sink and isolated Postgres DB; controlled clock for TTL tests. Tables spec10, ownership FKs/indexes; migrations additive and transactional.

- [ ] **Step 1 — Failing tests:** `bad_config_refuses_start`, `ready_503_without_db`, `instance_id_survives_restart`, `meta_has_no_secret_config`, `migrations_apply_to_empty_and_previous_db`. `DATABASE_URL` missing means explicit startup error; no silent ephemeral DB.
- [ ] **Step 2 — Verify red:** `cargo test -p selfterm-server --test startup` against ephemeral Postgres fixture, not production DB.
- [ ] **Step 3 — Implement:** Axum router/SQLx pool/structured tracing, graceful shutdown, live+ready endpoints. `/v1/meta` exact capability DTO; no global `/vault` or shared `SYNC_TOKEN`. Registration default closed; trusted proxies default empty; HTTPS public base URL validated.
- [ ] **Step 4 — Verify green:** Startup suite + SQLx migration schema assertions. Restart same DB keeps instance ID. Server dependency graph has no `selfterm-ssh`, private-key model or desktop Tauri.
- [ ] **Step 5 — Commit:** `feat: add persistent Rust sync service and instance metadata`.

## Task B2: Account/device auth, password reset va operator CLI

**Files:** Create `apps/server/src/auth/{mod,passwords,tokens,middleware}.rs`, `apps/server/src/{devices,mail,admin}.rs`, `apps/server/tests/{auth,devices,admin}.rs`, `crates/selfterm-protocol/src/auth.rs` DTO extensions.

**Interfaces:** `Authenticated { user_id, device_id, session_id }` extractor; `PasswordHasher::hash/verify`; `SessionService::{login,refresh,revoke_device,revoke_user}`. HTTP routes spec10. `selfterm-server user create --email <email>` and `user reset-password --email <email>` passwords interactive/no echo; direct DB operations transactionally. Mailer trait consumes `MailJob` with one-time tokens from worker, not log stdout.

- [ ] **Step 1 — Failing tests:** `closed_registration_rejected`, `unverified_account_cannot_login`, `password_stored_as_argon_hash`, `expired_token_rejected`, `refresh_rotates_once`, `refresh_reuse_revokes_family`, `revoked_device_denied_immediately`, `user_a_cannot_revoke_user_b`, `reset_response_does_not_enumerate_users`, `reset_does_not_modify_encrypted_vault`, `cli_secret_not_in_args_or_output`.
- [ ] **Step 2 — Verify red:** `cargo test -p selfterm-server --test auth --test devices --test admin`.
- [ ] **Step 3 — Implement:** Account password12..1024 bytes, Argon2id profile spec7, KDF bounded queue2 workers. Token CSPRNG32B+SHA256 DB hash; access15min/refresh30days absolute; atomic rotation+family reuse revocation. Email verify24h/reset30min one-time hashes; password change/reset invalidates sessions; account reset vault keys’ga tegmaydi.
- [ ] **Step 4 — Verify green:** Concurrent refresh test exactly one success, duplicate fails and family revoked; client refresh concurrency mutex B5’da prevents accidental reuse. CLI closed self-host creates verified user, optional SMTP unsupported reset UX clear. Auth traces/body/error serialization secrets scan.
- [ ] **Step 5 — Commit:** `feat: isolate accounts and devices with revocable sessions`.

## Task B3: Tenant vaults, revisions, idempotency va quotas

**Files:** Create `apps/server/src/vaults/{mod,service,validation}.rs`, `apps/server/src/repo/vaults.rs`, `apps/server/tests/{vaults,tenant_isolation}.rs`, update `apps/server/migrations/0002_vaults.sql` only while unreleased; after release new migrations.

**Interfaces:** `VaultService::create(auth, envelope) -> VaultResponse`; `get(auth, vault_id) -> VaultResponse`; `replace(auth, vault_id, expected_revision: u64, idempotency_key: Uuid, request_digest, envelope) -> VaultResponse`. Return ETag numeric string; reject mismatched body/path vault UUID. Request hash includes canonical validated envelope bytes + operation/path/If-Match; serialization defined in protocol fixture. Token user ID authoritative; body-supplied owner ID ignored/rejected.

- [ ] **Step 1 — Failing tests:** `cross_tenant_get_put_returns_404`, `one_vault_per_user`, `two_concurrent_writers_one_409`, `missing_if_match_428`, `duplicate_request_same_response`, `idempotency_key_reuse_with_other_body_409`, `quota_race_cannot_overflow`, `malformed_wrap_422`, `oversize_413`, `revision_never_decreases`.
- [ ] **Step 2 — Verify red:** `cargo test -p selfterm-server --test vaults --test tenant_isolation`.
- [ ] **Step 3 — Implement:** User+vault ownership filter each DB operation; CAS `revision = expected`; row/user lock for quota/history arithmetic; current envelope+wrappers+revision+idempotency one transaction. Create revision1; PUT increment1; body10MiB total, all retained data100MiB/user, versions last20/30days policy. Same idempotency response persisted24h.
- [ ] **Step 4 — Verify green:** 50 parallel writes same base -> exactly1 accepted and49 conflicts; retry same request -> same revision; encrypted envelope saved byte-equivalent; server cannot search hosts or decrypt. Changed `keyEpoch` permits same epoch or exactly+1 only; lower/jumps reject. Restoration of content must be client decrypt+re-encrypt at current epoch, never blindly roll key epoch backwards.
- [ ] **Step 5 — Commit:** `feat: store tenant vaults with atomic revision checks`.

## Task B4: SMTP outbox, limits, audit va deletion

**Files:** Create `apps/server/src/{limits,telemetry,outbox,account}.rs`, `apps/server/tests/{limits,outbox,account}.rs`, `docs/operators/privacy-and-retention.md`, `docs/operators/incident-response.md`.

**Interfaces:** Outbox worker durable jobs, exponential bounded retry, redacted failures; SMTP secret file loaded server-side. Limits keyed canonical trusted-proxy client IP/user; CLI + health bypass only defined operator policy. `DELETE /v1/account` current password+recent auth <=5min, deletes user data and tokens transactional. Audit only event kind/requestId/time/user internal ID, no plaintext credentials/hosts.

- [ ] **Step 1 — Failing tests:** `auth_limit_429`, `write_limit_user_scoped`, `spoofed_x_forwarded_for_ignored`, `mail_retry_does_not_log_token`, `reset_token_one_time`, `account_delete_erases_live_rows`, `maximum_ten_devices_enforced`, `oversized_body_rejected_before_large_allocation`.
- [ ] **Step 2 — Verify red:** `cargo test -p selfterm-server --test limits --test outbox --test account` with synthetic clock/mailer.
- [ ] **Step 3 — Implement:** Auth5/min/IP burst5, writes60/min/user, mail3/hour/address, active devices10; configured policy exact. Limit KDF queue and route body sizes before hash/JSON buffer costs. SMTP no attachments/data dump. Account deletion live cascade; documented30day backup expiry, logs limited metadata.
- [ ] **Step 4 — Verify green:** Load below limit passes; 429 Retry-After present; independent users’ ordinary writes not globally blocked. Mail unavailable persists outbox and health reports degraded capability; closed selfhost no SMTP works. Capture log+metrics sentinel credentials absent.
- [ ] **Step 5 — Commit:** `feat: enforce sync service limits and account lifecycle`.

## Task B5: Client sync, conflict UI va safe instance switching

**Files:** Create `crates/selfterm-core/src/sync/{mod,transport,merge,state}.rs`, `crates/selfterm-core/tests/{sync,merge}.rs`, `apps/client/src/features/sync/{SyncSettings,ConflictDialog,AccountDevices}.tsx`, frontend sync tests; extend core SQLite sync_state, Tauri commands and platform secure store.

**Interfaces:** Consumes A2 `SyncBinding`, A3 encryption, A4 `VaultRepository`, B1 meta and B2/B3 API. `SyncEngine::{bind,unbind,sync_now,status,resolve_conflict}`; `merge(base: &VaultPayload, local: &VaultPayload, remote: &VaultPayload) -> MergeResult`; `MergeResult { merged, conflicts }`; `ConflictResolution { record_id, choice: Local|Remote|KeepBoth }`. `SyncStatus` states exactly spec9. Single refresh mutex; bearer tokens never frontend. URL change clears/re-scopes auth; local vault persists.

- [ ] **Step 1 — Failing tests:** `offline_edits_survive_restart`, `two_devices_disjoint_edits_merge`, `same_record_conflict_requires_choice`, `delete_vs_edit_does_not_resurrect`, `clock_skew_does_not_choose_winner`, `wrong_remote_key_preserves_local`, `url_switch_does_not_leak_token`, `redirect_does_not_forward_auth`, `lost_put_response_retry_same_revision`, `older_revision_or_same_revision_other_digest_blocks`.
- [ ] **Step 2 — Verify red:** `cargo test -p selfterm-core --test sync --test merge`; frontend fake-engine test explicit Conflict UI no automatic overwrite.
- [ ] **Step 3 — Implement:** Persist encrypted local/base/queue in SQLite before saved acknowledgment. Unlock+foreground2s debounce; retry1..60s+jitter; 401->AuthRequired,409->merge, AEAD/wrapper->KeyRequired/Error; no blind repeated auth reset. HTTPS canonical origin + `/v1/meta` instanceId pin; HTTP literal loopback dev-only; custom server destination choice explicit.
- [ ] **Step 4 — Verify green:** Two real clients + server integration, simulated PUT response dropped after committed mutation, deterministic clocks changed +/-24h. Credentials atomic merge unit; keep-both new host UUID and credential reference consistency. Local-only outbound request count0. Cloud and selfhost binding use same engine and endpoints.
- [ ] **Step 5 — Commit:** `feat: synchronize encrypted vaults without losing offline edits`.

## Task B6: Recovery, password change, key rotation va instance migration

**Files:** Create `apps/client/src/features/sync/{RecoveryKey,ChangeVaultPassphrase,RotateVaultKey,MoveServer}.tsx`, `crates/selfterm-core/src/sync/recovery.rs`, `crates/selfterm-core/tests/recovery.rs`, `tests/e2e/recovery/README.md`, `docs/users/recovery.md`.

**Interfaces:** `change_vault_passphrase(old, new)`, `rotate_recovery_key(unlock)`, `rotate_vault_key(unlock)` transactional client operations with B3 CAS; `export_encrypted_vault(destination)` and `import_encrypted_vault(source, unlock)` use existing crypto/storage; `move_instance(destination, destination_account, unlock)` exports/decrypts locally, chooses fresh destination vault ID and reseals AAD, no old token transfer. Recovery unlock via A3, not server password reset.

- [ ] **Step 1 — Failing tests:** `new_device_unlocks_with_recovery`, `account_reset_keeps_vault_ciphertext`, `new_passphrase_old_payload_readable`, `stale_passphrase_wrapper_write_conflicts`, `rotation_reencrypts_local_device_and_sync_records`, `revocation_does_not_claim_old_data_erased`, `instance_move_uses_new_uuid_aad_and_leaves_source_intact`.
- [ ] **Step 2 — Verify red:** `cargo test -p selfterm-core --test recovery`; client redacted UI assertions no recovery key persisted browser storage.
- [ ] **Step 3 — Implement:** Vault passphrase rewrap same DEK, recovery wrapper rotation, DEK rotation increments epoch and re-encrypts payload/device/sync/base in local transaction. Pending remote CAS conflict keeps old usable encrypted snapshot+rotation journal until resolved. On destination existing account vault require import/merge preview, no blind replace. Source account/backend unchanged until user separately deletes.
- [ ] **Step 4 — Verify green:** Recovery key saved offline decrypts fixture after original device removed; wrong/old keys reject intended new wrappers; rotated DEK inaccessible old cached key for future payload. UI accurately explains account recovery vs data recovery and revoked device’s past access.
- [ ] **Step 5 — Commit:** `feat: support vault recovery and explicit server migration`.

## Task B7: Self-hosted distribution va operator documentation

**Files:** Create `deploy/{Dockerfile,compose.yml,Caddyfile,.env.example}`, `deploy/scripts/{backup,restore}.sh`, `.dockerignore`, `.github/workflows/server-image.yml`, `docs/operators/{self-hosting,upgrade,backup-restore}.md`, `tests/e2e/deployment/*`.

**Interfaces:** One versioned image `ghcr.io/asobitov2005/selfterm-server:<version>` multiarch amd64/arm64; registry publication account permissions checked at implementation. Config env/file names spec11. Compose exposes reverse proxy only; Postgres16 named volume; no real secrets in example. Operator password CLI interactive, backup binary/script consumes env/file credentials without echo.

- [ ] **Step 1 — Failing acceptance:** Fresh VM `compose config`, startup, admin user create, client sync, reboot, image upgrade, downgrade documented compatible previous release, backup/restore fail until package works. `.dockerignore` excludes `.git`, node_modules/dist/release/target, runtime DB, real `.env`, private signing keys; includes Cargo lock/source/templates.
- [ ] **Step 2 — Implement:** Multi-stage Rust release build, nonroot minimal runtime, read-only rootfs/tmpfs, healthcheck, resource limits; build dependencies not shipped. DB and Axum port private; Caddy domain HTTPS. ARM64 actual run, not only build tag. Docker Compose entrypoint migrations lock, fail rather than overwrite unexpected schema.
- [ ] **Step 3 — Verify:** `docker compose --env-file <synthetic-env> -f deploy/compose.yml config --quiet`; build/run image; probe health/meta and authenticated encrypted sync; same SQLite local client works when server shut down. Caddy HTTPS external staging with valid certificate.
- [ ] **Step 4 — Verify operator path:** `docker compose up -d`, interactive `user create`, URL/account setup, encrypted backup, restore into isolated instance, revoke restored sessions. DB volume survives recreate/reboot. Bare binary/systemd instructions independently tested.
- [ ] **Step 5 — Commit:** `deploy: package one sync service for self-hosted and cloud use`.

## Task B8: Managed cloud readiness va real recovery drill

**Files:** Create `deploy/cloud/README.md`, `docs/operators/{cloud-launch,load-test,restore-drill,rollback}.md`, `tests/e2e/cloud/{load.js,tenant-flows.ts}`, extend GitHub workflows environment gates.

**Interfaces:** Consumes same B7 image/API; cloud uses open registration+verified email+durable Postgres+SMTP; admin plane separate from user API. Produces measured capacity, operational runbook and production release candidate. Cloud domain/operator/SMTP/backup/signing accounts owner tomonidan beriladi; secrets deploy secret store’da.

- [ ] **Step 1 — Define release tests:** 100 simultaneous foreground clients over10min, 1000 synthetic registered users,10KiB normal vaults and <=10MiB boundary payloads; capture p50/p95/error/resource usage. Proposed gate normal sync p95<500ms, unforced error rate<1%, auth queue bounded, zero cross-tenant leaks. Performance miss capacity tuning/spec revision talab qiladi, security bypass emas.
- [ ] **Step 2 — Provision reviewable staging:** Same pinned image; registration verification and reset via actual delivery sandbox; quota/abuse/DB outages/restarts tested; public invitation use real data emas, synthetic fixtures.
- [ ] **Step 3 — Restore drill:** Daily-backup artifactni fresh DB’ga restore; instance UUID renew va all sessions revoked; old client `InstanceChanged` bilan auto syncni to‘xtatadi, local edits preserved; explicit rebind/import preview’dan keyin users login again, original passphrase va recovery key bilan downloaded fixtures decrypt; server readiness and chosen RPO<=24h/RTO<=4h measured. Mere `pg_restore` success enough emas.
- [ ] **Step 4 — Release review:** Independent tenant/auth/crypto review, image vulnerability/dependency report, privacy+retention copy, incident contact, rollback rehearsal, owner environment settings. Production opening uses tested artifact; paid services/DNS/account actions uchun mavjud authorization/credentials scope tekshiriladi.
- [ ] **Step 5 — Commit:** `docs: record cloud release readiness and restore evidence`; M7 backend gate faqat actual results bilan marked. Browser-only SSH yoki relay endpoint kiritilmaydi.

## Execution order

B1 -> B2 -> B3 -> B4. B5 requires A3/A4/A8 + B1–B3. B6 requires B5. B7 after B1–B4; integration acceptance requires B5. B8 requires B6/B7 va independent review. Core client lokal SQLite bazasida ishlaydi; PostgreSQL faqat tanlangan remote backend host’da. Birinchi self-hosted beta cloud production’dan oldin chiqadi.
