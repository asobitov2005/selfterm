# SelfTerm RDP va VNC spetsifikatsiyasi

Sana: 2026-09-27. Status: reja; engine, probe va platforma testlari hali bajarilmagan.
Asos: [Rust architecture](2026-09-27-rust-migration-design.md), [existing UI va SFTP](2026-09-27-ui-workspace-sftp-design.md).

## 1. Product va UI contract

RDP/VNC foydalanuvchi talabi bilan release scope’iga qo‘shildi. Hozirgi Termiusga o‘xshash sidebar, hosts, terminal tablar va appearance saqlanadi. RDP/VNC mavjud workspace’da yangi protocol tablar sifatida ochiladi; boshqa dashboard yaratilmaydi. Host kartasidagi SSH/SFTP/RDP/VNC actions faqat configured endpoints uchun enabled. Remote desktop tabning toolbar’i: connection status, Fit/Actual size, zoom, keyboard, Send Ctrl+Alt+Del, clipboard permission, View only, Disconnect. Platforma/protocol qo‘llamaydigan action disabled va sababi ko‘rsatiladi.

SSH tab, SFTP panel va remote desktop tab parallel ishlaydi. `Open SSH` configured sibling SSH profilni ochadi, RDP credentialni SSH uchun taxminan qayta ishlatmaydi. Connect/disconnect sessiyaga scoped. Disconnect remote OS’dan sign-out yoki shutdown qilmaydi; remote dasturlarni yopish alohida OS amali.

## 2. Connection schema va compatibility

`ConnectionProfile { id, label, group, color, notes, kind, endpoint, credentialRef, linkedSshProfileId? }`; `kind = Ssh | Rdp | Vnc`. SSH profile uchun SFTP capability/action; standalone Files ham SSH transport orqali, PTY ochmasdan ulanadi. Default ports SSH22/RDP3389/VNC5900, user override1..65535. VNC display number va TCP port bitta qiymat deb qabul qilinmaydi: editor aniq TCP port ko‘rsatadi. RDP fields hostname, port, username, optional domain, resolution policy; VNC fields hostname, port, security mode, optional authentication identity. Password/key secrets Rust vault’da; public DTO’da faqat saved-secret presence.

E2 `Host`dan `ConnectionProfile`ga encrypted payload schema migration egasi. Eski hostlar SSH profilega ID/history/group/credential/tombstone saqlanib o‘tadi; migration transactional, backup va rollback fixture bilan. Encryption envelope suite o‘zgarmaydi, plaintext payload schema version oshadi. Eski client yangi schema’ni destructive downgrade qilmaydi: `UnsupportedSchema`. B5 merge birligi profile ID; endpoint/kind/security o‘zgarishlari conflict; turli protocol secrets avtomatik birlashtirilmaydi. Local-only va optional sync barcha profillarga amal qiladi; framebuffer/remote clipboard/file contents sync payloadga kirmaydi.

## 3. Rust engines va feasibility gate

RDP candidate: [IronRDP](https://github.com/Devolutions/IronRDP), modular Rust protocol/session implementation; [architecture](https://github.com/Devolutions/IronRDP/blob/master/ARCHITECTURE.md). E1 aniq pinned version/features/licensing, Windows NLA target, Linux xrdp, native Windows/Linux/macOS va Android/iOS builds hamda real-device renderer/inputni tekshiradi. Crate repository’da feature borligi mobile app ishlashining dalili emas.

VNC candidate: [Rust vnc client API](https://docs.rs/vnc/latest/vnc/), [RFB protocol](https://www.rfc-editor.org/rfc/rfc6143.html). E1 client handshake, supported security types, pixel formats, Raw/CopyRect va negotiated compression encodings, cancellation, TLS adapter va bounded decodingni tekshiradi. Keraksiz encoding advertise qilinmaydi. Server-only VNC crate client o‘rniga qo‘yilmaydi.

`selfterm-rdp` va `selfterm-vnc` alohida Rust client crates; `selfterm-remote-desktop` shared compositor/input/session contracts. Protocol parsing Rustda, React canvas presentation va toolbar’ni bajaradi. [FreeRDP](https://github.com/FreeRDP/FreeRDP) fallback candidate C library; zarur bo‘lsa bu Rust-only engine qaroriga explicit ADR va scope revision talab qiladi, yashirincha tanlanmaydi. Native rendering alternative ham E1 measurementdan keyin ADR bilan.

## 4. Transport va trust

Client targetga bevosita ulanadi. Sync backend RDP/VNC proxy/relay emas, sockets/credentials/screenshots olmaydi. Local HTTP/TCP listening server talab qilinmaydi.

RDP default TLS + NLA/CredSSP; server identity trust authentication credentials yuborilishidan oldin. Valid CA chain va hostname validation; private/self-signed targetda explicit fingerprint pin flow, changed certificate blocks connection, re-trust separate action. Trust prompt verify source va certificate details ko‘rsatadi, automatic Accept yo‘q. NLA-disabled/legacy downgrade default rejected; supported compatibility mode bo‘lsa uning aniq security consequences explicit opt-in va tests orqali, silent fallback emas. CredSSP implementation/cert binding E1/E3 review gate; library unsupported bo‘lsa UI `UnsupportedAuth`.

VNC password authentication o‘zi ekran/input trafficni encrypt qilmaydi. Release flow: verified TLS security type engine’da haqiqatan qo‘llansa TLS, aks holda configured trusted SSH profile orqali encrypted tunnel. Tunnel Rust `russh` direct-tcpip channel’ini in-process stream adapter bilan VNC targetga bog‘laydi, localhost port ochmaydi. SSH host trust va target endpoint explicit; arbitrary general-purpose port-forwarding UI scope’da yo‘q. Plain unencrypted VNC release defaultida blocked; secure mode unavailable -> actionable error. Legacy VNC password length/encoding limit negotiated auth bo‘yicha validated; >8-byte secretni silently truncate qilish yo‘q. No-auth faqat secure transport ichida explicit configured target policy bilan; public unencrypted automatic connect yo‘q.

## 5. Rendering, resource bounds va session state

Rust decoder barcha accepted rectangles’ni ordered compositor’ga apply qiladi; CopyRect old framebufferga bog‘liq. Queue to‘lganda arbitrary protocol deltas drop qilinmaydi. Renderer latest fully composed frame’ni ko‘rsatishi mumkin; old complete presentation frames skip qilish protocol state yo‘qotmasligi shart. Binary IPC typed session/frame sequence/dirty tiles, acknowledgements va bounded queues; base64 JSON framebuffer yo‘q. Initial compositor+presentation budget desktop128MiB/mobile64MiB per active graphical session, total dimensions desktop<=16MP/mobile<=4MP, either edge<=4096; bounds allocationdan oldin checked. Budgetga buffers ham kiradi, tile/full-frame copies measurement bilan tasdiqlanadi. Unsupported resolution negotiated lower yoki clear reject; attacker dimensions/rectangles/lengths panic/OOM bermaydi.

Initial graphical concurrency desktop2/mobile1; SSH16/4 limiti alohida, combined RSS E1’da tekshiriladi. Local test network maqsadi desktop1920x1080 >=15fps, mobile1280x720 >=10fps, input-to-frame p95<=150ms; internet tezligiga umumiy va’da emas. Failing Tauri canvas/channel measurement renderer ADR’ini talab qiladi.

States: `Connecting -> AwaitingTrust -> Authenticating -> Negotiating -> Connected`, optional `ViewOnly`; exits `Interrupted | Closed | Failed | Unsupported`. Stale framebuffer ustida disconnected badge va input disabled; reconnect user action, held keys released, input replay yo‘q. Lock/background closes sockets, clears credentials/framebuffers/clipboard buffers and disables input; reconnect fresh trust/auth lifecycle. Mobile interruptions tests background kill/network switch/rotation.

## 6. Desktop va mobile input

Desktop: focused canvas coordinates CSS-to-remote pixel conversion, letterboxing/zoom/DPI accounted; pointer buttons/wheel, keydown/up, modifier state va focus-loss all-keys-up. ViewOnly Rust-side rejects input; UI toggle alone security boundary emas. OS-reserved shortcuts toolbar’dagi protocol sequence bilan; Ctrl+Alt+Del capability negotiated/implemented bo‘lmasa disabled, local OS action inject qilinmaydi.

Mobile ikki explicit mode: Trackpad (relative pointer) va Direct touch (absolute). Tap left-click, two-finger tap right-click; pinch zoom/pan viewport control. Long-press menu va remote input bir gesture’da ikki marta fire qilmaydi. Keyboard toggle, persistent Ctrl/Alt/Esc/Tab/arrows bar, IME/Unicode input supported capability bilan; unsupported characters clear error, destructive guessed keycodes yo‘q. Rotation/keyboard safe areas remote size policy’ga mos; resize handshake unsupported bo‘lsa scale only va toolbar explanation. Accessibility toolbar focus order/labels; canvas remote contentning full screen-reader supporti deb da’vo qilinmaydi.

## 7. Clipboard, redirection va privacy

Clipboard default Off; user per-session explicit send/receive text permission beradi; max1MiB UTF-8, origin/source preview va failure reason. Local clipboard app avtomatik o‘qimaydi; remote clipboardga terminal secrets automatic paste qilinmaydi. RDP drive/printer/file redirection, microphone/audio streaming va remote recording birinchi stable scope’da yo‘q; kerak bo‘lsa alohida capability/security plan. Screenshot persistence default yo‘q; protocol diagnostics screen bytes, clipboard, password yoki secret key yozmaydi. Bundled decoder dependencies pinned va notices tracked.

## 8. Release acceptance

E8 Windows NLA RDP target, xrdp va VNC fixture (TigerVNC yoki x11vnc versiyasi probe’da tanlanadi), SSH tunnel fixture bilan interoperabilityni tekshiradi. Actual besh client platformasida install/connect/trust/input/render/clipboard/lock/reconnect dalili kerak. RDP serverni Windows Home’da bor deb taxmin qilinmaydi; Windows target edition/licensed fixture implementationda tayyorlanadi. Engine qo‘llamaydigan auth/encoding/capabilitylar release support table’da ochiq yoziladi. Compile-only mobile dalili stable gate o‘rnini bosmaydi.
