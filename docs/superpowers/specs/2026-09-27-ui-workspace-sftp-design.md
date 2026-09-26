# SelfTerm UI workspace va SFTP spetsifikatsiyasi

Sana: 2026-09-27. Status: reja, implementation va visual mockup hali yaratilmagan.
Asos: [Rust arxitekturasi](2026-09-27-rust-migration-design.md). Bu extension eski SFTP out-of-scope qarorini almashtiradi.

**Majburiy UI preservation:** Foydalanuvchining so‘nggi talabi bo‘yicha hozirgi Termiusga o‘xshash SelfTerm interfeysi saqlanadi. `src/App.jsx` va `src/styles.css` — visual baseline: mavjud sidebar/navigation, hosts kartalari/ro‘yxati, tablar, terminal, dialoglar, themes, fonts va spacing sababsiz almashtirilmaydi. Quyidagi wireframe mavjud UI’ga yangi panel qo‘shish joylarini ifodalaydi; yangi bosh sahifa yoki umumiy redesign topshirig‘i emas. Yangi token qiymatlari faqat existing theme’da yetishmaydigan yangi controls uchun fallback; mavjud tanlangan rang/fontlarni override qilmaydi. Desktop baseline screenshot comparison gate majburiy; mobil layout shu visual identity’ni kichik ekranga moslaydi.

## 1. Foydalanuvchi talabi va scope

Aniq talab: UI rejasi bo‘lsin; SSH ko‘rinib tursin; SFTP fayllarni ustidan bosish/bosib turish, sudrash, almashtirish va boshqarish imkoniyatlari bo‘lsin. Qo‘shimcha talab: RDP va VNC ham bo‘lsin. Brend SelfTerm, besh target platforma, persistent SQLite va optional sync saqlanadi.

Termius’ning rasmiy sahifasida integrated SFTP, drag-and-drop, tashqi editor bilan edit va serverga changes upload tasvirlangan. Bu funksional reference; quyidagi barcha layout/interaction/limitlar SelfTerm uchun taklifdir. [Termius SFTP reference](https://www.termius.com/free-ssh-client-for-windows)

Asosiy release scope:

- Umumiy Hosts/Connections ro‘yxati, groups, search, protocol badges SSH/SFTP/RDP/VNC.
- SSH tabs, yonma-yon terminal split, connection header va mustaqil session holati.
- SFTP remote browser, optional local browser, upload/download, drag-and-drop, context menu va mobile long-press.
- Fayl nomini o‘zgartirish, yangi folder/file, move, delete, properties/permissions, explicit Replace.
- Embedded text editor, dirty state, save-on-server, concurrent remote change detection.
- Transfer queue, progress, cancellation, retry va interruption recovery.
- RDP/VNC tablari, input/zoom/resize toolbar; ularning engine/security contractlari [remote desktop spec](2026-09-27-rdp-vnc-design.md)da.

SFTP — SSH file transfer subsystem; plain FTP/FTPS client ushbu scope’da yo‘q. Server fayllari sync backendga yuborilmaydi. Cloud account barcha protocol uchun optional.

## 2. Information architecture va ekranlar

| Ekran | Asosiy vazifa | Primary action | Context/state |
| --- | --- | --- | --- |
| Vault unlock/onboarding | Local encrypted vault/recovery | Unlock/Create vault | Wrong key, recovery, no keyring |
| Hosts | Groups/search/protocol filter/list-grid | New connection | Empty/search-empty/locked/offline |
| Connection editor | SSH/SFTP/RDP/VNC endpoints va credentials | Save | Per-protocol fields, validation |
| Workspace | Active sessionlarni boshqarish | Connect yoki active protocol control | Host identity doim ko‘rinadi |
| Files | Local/remote folders va transfer | Upload | Permission denied, SFTP unavailable |
| File editor | Remote textni edit/save | Save | Dirty, saving, external change, error |
| Transfers | Active/completed/failed jobs | Retry selected | Running/cancelled/interrupted |
| History | Recent successful connections | Reconnect | Local-only, removed connection |
| Settings | Appearance/keyboard/storage/security/sync | Contextual Save | Credentials redacted |

Mavjud sidebar/navigation ordering baseline bo‘yicha saqlanadi; Sessions/Transfers kabi yangi entries mavjud controlsni almashtirmasdan qo‘shiladi. Logical destinations: Hosts, Sessions, Transfers, History, Settings. RDP/VNC alohida duplicated host inventory emas; ular connection type. File-browser bookmarks keyingi enhancement, asosiy folder history device-local. Protocol boshqa-boshqa credentials bo‘lishi mumkin; SSH login RDP/VNCga avtomatik sinab ko‘rilmaydi.

Host card single-click select, double-click yoki visible Connect -> default endpoint; dropdown SSH/SFTP/RDP/VNC configured endpointlarni ko‘rsatadi. Mobile single-tap details, visible Connect primary button. SSH endpoint yonidagi Files action shu endpoint SFTP subsystem’ini ochadi, yangi random server/account yo‘q.

## 3. Desktop layout: SSH va Files yonma-yon

```text
┌──────┬─────────────────┬───────────────────────────────────────────────┐
│ Rail │ Hosts / groups  │ Session tabs: api [SSH] | desktop [RDP]        │
│      │ Search          ├───────────────────────────────────────────────┤
│      │ selected host   │ api · admin@host:22 · SSH Connected · Files   │
│      │                 ├─────────────────────────┬─────────────────────┤
│      │                 │ SSH terminal            │ SFTP /srv/app       │
│      │                 │ independent scroll      │ path · Upload · ⋯   │
│      │                 │ active prompt visible   │ name / size / date  │
│      │                 │                         │ right-click actions │
│      │                 ├─────────────────────────┴─────────────────────┤
│      │                 │ Transfers: progress · Cancel · Retry          │
└──────┴─────────────────┴───────────────────────────────────────────────┘
```

Yangi panel uchun sizing proposal (existing baseline control sizes take precedence): >=1280 CSS px: rail56, hosts240 (collapsible), files420 (resizable360..640), terminal remaining minimum320. Connection header44, tab bar40. Files hidden by default for newly opened pure SSH; user Files opens same-session panel and remembers layout device-local. Splitter keyboard accessible and persisted only proportions/device-local, not remote content.

1024..1279: hosts collapsed by default, terminal>=320/files>=360. 768..1023 tablet: terminal+files side-by-side when min sizes fit; otherwise `Terminal | Files | Desktop` segments, fixed host header and active-session status. <768: single content pane with the same segments; SSH session stays alive while Files visible. Phone’da full terminal va full file list bir vaqtda sig‘maydi, shuning uchun persistent header va one-tap Terminal qaytish ishlatiladi.

Expanded desktop Files mode: local/remote dual columns upper area, terminal bottom minimum200px; vertical split resizable. Pure RDP/VNC tab toolbar ostida framebuffer; `Open SSH` faqat configured SSH endpoint bo‘lsa sibling tab ochadi. Arbitrary shell discovery yoki automatic terminal connect yo‘q.

Terminal split birinchi release’da maximum2 panes (horizontal/vertical) per workspace; each pane real independent SessionId. Active pane border/focus visible; no broadcast-input button. Global session limits Rust spec’dagidek, GUI ularni oshirmaydi.

## 4. Visual design system

Hozirgi graphite design davom ettiriladi: information-dense professional tooling, oddiy panels, no marketing hero/gradients. Skill qidiruvi developer-tool typography, flat controls va keyboard accessibility tavsiya berdi; generic landing-page/CTA recommendation bu workspace’ga qo‘llanmaydi.

| Token | Dark default | Light default |
| --- | --- | --- |
| background | #101214 | #F6F8FA |
| surface | #16191B | #FFFFFF |
| raised | #1D2124 | #EEF2F5 |
| text | #EEF2F1 | #17212B |
| muted | #9BA5A8 | #526170 |
| accent | #47C2A8 | #086C56 |
| border | #394247 | #CBD5DF |
| danger text | #FF9B9B | #B42318 |

Actual foreground/background pairs kontrast testidan o‘tadi: text>=4.5:1, controls/focus>=3:1; token jadvali o‘zi PASS emas. Icons Lucide (existing), UI system font/Manrope existing selectable fonts, terminal JetBrains Mono. Desktop body14px, mobile input/body16px, secondary text>=12px. Rows desktop36/mobile48+, mobile tap44x44 minimum, 8px gaps; spacing4/8/12/16/24; radii6/8; focus ring2px. Transfer numbers tabular.

Motion150ms short transition, reduced-motion respected; terminal/canvas updatesga decorative animation yo‘q. Large editor/render modules lazy-loaded. No CDN scripts/remote fonts requirement: bundles offline ishlaydi. Screen readers connection state+transfer completionni announce qiladi, byte progress har update’da announce qilinmaydi.

## 5. File interaction mapping

| User action | Natija |
| --- | --- |
| Desktop single-click | Row selection, destructive action yo‘q |
| Desktop double-click folder / Enter | Folder ichiga kirish |
| Desktop double-click text file | Editor preview (no automatic upload) |
| Other file double-click | Properties/Download choice; native executable auto-run yo‘q |
| Right-click / Shift+F10 / visible ⋯ | Context menu |
| Mobile folder tap | Folder open |
| Mobile file tap | Preview/available actions |
| Mobile long-press500ms, movement<8px | Select+action sheet; rename/delete/replace o‘zi bajarilmaydi |
| F2 while file list focused | Rename dialog |
| Ctrl/Cmd+A in list | Visible folder entries select; terminal shortcuts intercepted emas |
| Drag from OS/local pane onto remote folder | Upload destination preview/queue |
| Drag onto existing remote file | Explicit Replace dialog for that target |
| Drag remote item onto remote folder | Move preview, source/destination path visible |
| Drag remote to local pane | Download queue |
| Mobile Upload | Native document picker; gesture alternativi |

Context menu file: Open/Edit (if supported), Download, Replace with local file, Rename, Move, Copy path, Properties, Delete. Directory: Open, Download folder, Upload here, New file/folder, Rename, Move, Properties, Delete. Unsupported/permission-denied action disabled + reason. File kind may be protocol metadata/encoding/size classification, not named filename exceptions.

Clipboard path copy explicit user action. `Paste path to terminal` keyingi optional control faqat shell-safe escaped text insert, Enter yubormaydi; current scope default path copy, avtomatik command yo‘q. HTML/script files preview as escaped text; browser execution/remote navigation taqiqlangan.

## 6. Upload va Replace flow

1. Local file(s) native capability orqali tanlanadi yoki supported desktop drag-drop’dan olinadi; frontend arbitrary local absolute pathni o‘zi read qilmaydi.
2. Target host/account/path doim ko‘rsatiladi. Existing same-name destination -> `Replace`, `Keep both`, `Skip`, `Cancel`. Multi-file “apply to all” faqat shu batch va collision class, global preference emas.
3. Replace dialog old/new name,size,modified time va target full pathni ko‘rsatadi. Source boshqa nomli bo‘lsa ham explicit target replace mumkin; rename va replace boshqa-boshqa amallar.
4. Remote originalga to‘g‘ridan-to‘g‘ri truncate yozilmaydi. Same directory random temporary filename exclusive-create, bounded streamed upload, flush/fsync capability bo‘lsa, validation, target precondition qayta tekshirish, negotiated safe rename bilan commit.
5. `posix-rename@openssh.com` yoki sinovdan o‘tgan equivalent atomik replacement capability bo‘lsa rename-commit. [OpenSSH extension](https://github.com/openssh/openssh-portable/blob/master/PROTOCOL)
6. Atomic replace yo‘q bo‘lsa default originalga tegmaydi: `Save as…`/Keep both taklif etiladi; delete-original-then-rename fallback yo‘q. Server capabilityga qarab UI tushunarli sabab ko‘rsatadi.
7. Success faqat close/commit+target size validation’dan keyin; network disconnect commit vaqtida -> `Outcome unknown`, reconnect’da source/target digest tekshiruv, automatic duplicate/overwrite retry yo‘q.

Fingerprint baseline file type/size/mtime va overwrite/editor targetlar uchun streamed SHA256. SFTP generic server-side compare-and-swap bermaydi: precheck va rename orasida boshqa writer yozishi mumkin. UI va docs “external changes detected” deydi, “all concurrent writes impossible” demaydi. Shared files uchun server locks/versioned application workflow alohida talab; sensitive file save flow available best-effort conflict checkni yashirmaydi.

Symlink default list metadata bilan ko‘rsatiladi. Replace symlink targetga automatic follow qilmaydi; target resolve+user destination preview yoki reject. New rename basename `/`, NUL, `.` va `..` reject; platforma remote path semantics Rust `RemotePath`da, local OS PathBuf ishlatilmaydi. Unicode remote filenames valid UTF8 qo‘llansa lossless; invalid UTF8 lossy display’dan write path yasalmaydi, capability unsupported aniq ko‘rsatiladi.

## 7. Text editor va changes

Embedded CodeMirror6 candidate; M1/D1 mobile IME/memory probe’dan keyin pin. UTF8 valid text, no NUL, maximum5MiB; binary/oversize -> download/external tool choice, extension-specific semantic exceptions yo‘q. Open preserves bytes/line endings (LF/CRLF), no invisible normalization. Save re-encodes exact selected encoding, read-only/permission errors inline.

Editor tab title has dirty dot; header has full remote path and host identity; Ctrl/Cmd+S only editor focus’da. Save uses exact Replace pipeline+baseline digest. Remote changed -> conflict dialog `Reload remote`, `Save as`, `Review changes`, explicit `Replace latest` after recheck. Close dirty -> Save/Keep encrypted draft/Discard/Cancel. Files tabga kirish terminalni dispose qilmaydi.

Draft optional persistence device-local encrypted SQLite, never remote sync/account backup as plaintext; path/content/history encrypted. Auto-lock editor plaintext clear, dirty draft encryption commit or explicit failure message before discard. Unsaved contents crash’dan qolsa unlock’dan keyin Restore draft ko‘rsatiladi. Local external editor integration desktop enhancement, not core release blocker; mobile built-in editor first.

## 8. Transfers va persistence

State: `Queued -> Running -> Verifying -> Committing -> Completed`; branches `WaitingForConflict`, `Paused`, `Cancelled`, `Interrupted`, `Failed`, `OutcomeUnknown`. UI completed bytes/total if known, rate/ETA only measurable, source/target/error text and actions.

Default parallel file jobs2/host, global4; chunks256KiB, per-job buffers<=1MiB. Directory traversal maxdepth64, symlink recursion disabled; destructive folder delete explicit recursive preview/count, no fake remote trash. Directory contains100k entries uchun list virtualized; remote read_dir streaming capability probe, hard loaded entries cap100k with explicit cap notice, no memory blowup.

Download native selected destination, temporary `.part` file, close+rename after complete. Already existing local file same conflict UI; no overwrite without decision. Source metadata/digest change cancels commit. Mobile Files save/export picker used; arbitrary device filesystem access va’da emas.

Queue metadata/path/transfer checkpoints SQLite device_state encrypted. App restart interrupted jobs explicit Resume/Restart confirmation after source/destination validation; background mobilda transfer avtomatik davom etishi va’da emas. Resume only if engine/server support and prefix validated; otherwise Restart fresh temp file. Cancel at Committing is OutcomeUnknown until reconcile; cancellation does not roll back completed remote mutation. Completed file bytes user's export destinationda bo‘lishi mumkin; app private draft/temp outputs exclude OS backup where possible and cleanup policy documented.

Rename/move have preflight identity checks; operation successful only server ack. Move across remote filesystem can fail EXDEV; error surfaced, no silent copy+delete. Directory download/upload restart handling per-file queue; not one unbounded recursive memory job. Remote-to-remote cross-host copy later feature, initial same-host move and local/remote transfer only.

## 9. Rust module va contractlar

`crates/selfterm-sftp` new client crate, candidate `russh-sftp`; [client API](https://docs.rs/russh-sftp/latest/russh_sftp/client/struct.SftpSession.html). Authenticated Rust SSH transport’da SFTP subsystem channel ochiladi; PTY shell required emas. Shared transport endpoint identity/credentials bo‘yicha scoped; closing Files closes SFTP channels only, terminal remains; transport lifetime refcount until every session/channel closed. SFTP unavailable -> terminal ishlaydi, Files clear error.

Contractlar:

```rust
struct SftpSessionId(uuid::Uuid);
struct TransferId(uuid::Uuid);
struct RemotePath(String); // validated, lossless supported remote path
struct EntryId(uuid::Uuid); // session + canonical path + observed identity scope
struct FileFingerprint { size: u64, modified: Option<i64>, sha256: Option<[u8;32]> }
struct RemoteEntry { id: EntryId, path: RemotePath, kind: EntryKind,
    size: Option<u64>, modified: Option<i64>, permissions: Option<u32> }
enum ConflictChoice { Replace, KeepBoth, Skip, Cancel }
enum TransferState { Queued, Running, Verifying, Committing, Completed,
    WaitingForConflict, Paused, Cancelled, Interrupted, Failed, OutcomeUnknown }
```

`SftpService::{open(host_id),list(session,path,cursor),stat,read_text,rename,mkdir,create_file,set_permissions,remove}`; mutating operations require observed EntryId/fingerprint and explicit request. `TransferService::{enqueue(plan),cancel(id),retry(id),resolve_conflict(id,choice),reconcile(id)}`; `TransferPlan` engine-controlled validated source native file handle + remote destination; frontend path spoofing cannot access extra files. Capabilities `{ atomicReplace, fsync, resume, permissions }` actual negotiated/tested values.

IPC commands narrow and scoped session owner; no shell-built `mv`, `rm`, `chmod`, `cat`, no credentials frontend. Errors `PermissionDenied`, `SftpUnavailable`, `Conflict`, `UnsupportedCapability`, `InvalidPath`, `Cancelled`, `Disconnected`, `OutcomeUnknown`, `LimitExceeded`; public message actionable and no sensitive file contents in logs. Global `VaultPayload` remote file contents yo‘q; optional draft/queue only encrypted local metadata.

## 10. Acceptance va bosqichlar

Desktop must show SSH prompt+same-host SFTP list simultaneously, resizing/files actions do not disconnect SSH. Right-click, long-press and visible ⋯ action equivalence; rename vs replace distinct; safe overwrite interrupted upload cannot truncate original. Mobile native file picker, text editor IME, keyboard-safe layout, persistent host header va one-tap SSH return.

D implementation plan’da keyboard/a11y, transfer interruption/commit uncertainty, remote external edits, permission/symlink/path quirks uchun tests bor. Stable release requires synthetic OpenSSH SFTP fixture + actual Windows/Linux/macOS/Android/iOS evidence. RDP/VNC UI contractlarni E rejasi qo‘shadi. No screenshot/mockup yet; bu document precise text/wireframe plan.
