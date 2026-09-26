# SelfTerm: Rust migratsiyasi yo‘l xaritasi

Sana: 2026-09-27. Holat: ko‘rib chiqish uchun tayyor reja; Rust implementatsiyasi hali boshlanmagan.

## Maqsad

Windows, Linux, macOS, Android va iOS uchun bitta umumiy Rust yadrosiga ega SSH ilovasi yaratish. Qurilmada alohida server ishlamaydi: ma’lumotlar doimiy SQLite bazasida saqlanadi, maxfiy records shifrlanadi. Foydalanuvchi local-only, bizning cloud xizmatimiz yoki o‘zining self-hosted serverini tanlay oladi. Cloud va self-hosted bir xil Rust backend va API’dan foydalanadi.

Nom hozircha **SelfTerm**. `Roamsh` yoki boshqa brend hali tanlanmagan; migratsiya davomida nom, package ID va domain’ni o‘zboshimchalik bilan almashtirmaymiz.

## GitHub va mavjud versiya

- Repo: https://github.com/asobitov2005/selfterm
- `electronjs`: mavjud Electron/Node.js ilovasining saqlangan nusxasi.
- Boshlang‘ich commit: `58e7c135343bde35c7385c4e0448498fcaa8b61f`.
- `main`: boshlang‘ich kod va ushbu hujjatlar. Rust funksiyalari alohida `feat/rust-*` branchlarda, tekshirilgan PR’lar orqali qo‘shiladi.
- `electronjs`ga kelajakdagi Rust o‘zgarishlari merge qilinmaydi. Favqulodda Electron tuzatishlari alohida commit va release bo‘ladi.
- `node_modules`, `dist`, `release`, lokal vault, `.env` va shaxsiy kalitlar Gitga yuklanmaydi. Manba kod, lock fayllar va konfiguratsiya namunalari yuklanadi.
- Hozirgi tekshiruvlar: Vite production build, Node syntax checks, vaqtinchalik ma’lumotlar bilan server health/auth/invalid-format/push/pull smoke check. Haqiqiy SSH, Windows/macOS va mobil ishlashi hali tekshirilmagan.

## Qaysi yo‘l tanlanmoqda?

| Variant | Natija | Baho |
| --- | --- | --- |
| Tauri 2 + Rust + React/xterm.js | Electron/Node runtime almashtiriladi, ishlayotgan terminal UI saqlanadi | Asosiy tavsiya va ushbu rejaning yo‘li |
| Dioxus + Rust UI + Rust terminal renderer | UI va terminal rendering qayta yaratiladi | Alohida arxitektura loyihasi; bu migratsiyaga qo‘shilmaydi |
| Rust core + har platformaga alohida native UI | Katta platforma nazorati, bir necha UI implementatsiyasi | Hozirgi scope uchun juda katta |

**Ushbu reja 100% Rust UI va’da qilmaydi.** SSH, storage, kriptografiya, sync va server Rustda bo‘ladi. React/TypeScript, CSS va xterm.js interfeys vazifasini bajaradi; ayrim mobil integratsiyalar Kotlin/Swift orqali yozilishi mumkin. Yakuniy desktop ilovada Electron yoki Node.js runtime bo‘lmaydi. Build vaqtida frontend uchun Node.js kerak bo‘ladi.

## Kutiladigan foydalanuvchi tajribasi

1. Ilovani o‘rnatadi, lokal vault yaratadi va recovery key’ni saqlaydi.
2. Akkaunt ochmasdan host qo‘shib SSH ishlatishi mumkin.
3. Sync istasa `Cloud` yoki `Self-hosted`ni tanlaydi.
4. Cloud’da bizning xizmatga kiradi; self-hosted’da o‘z URL’ini kiritib shu serverdagi akkauntiga kiradi.
5. Yangi qurilmada akkauntga kirish bilan birga vault passphrase yoki recovery key talab qilinadi.
6. Backend hostlarni, SSH parollarini va kalit materialini ochiq holda olmaydi. SSH bevosita qurilmadan target serverga ulanadi.
7. Network uzilsa lokal ish davom etadi. Sync qayta urinadi; ikki qurilma qarama-qarshi o‘zgartirgan bo‘lsa foydalanuvchiga conflict ko‘rsatiladi.
8. Mobil ilova fonga o‘tganda SSH abadiy ishlashi kafolatlanmaydi. Qaytishda holat tekshiriladi, zarur bo‘lsa reconnect taklif etiladi; eski buyruq avtomatik takrorlanmaydi.

## Hujjatlarni o‘qish tartibi

1. [Arxitektura va protokol spetsifikatsiyasi](../superpowers/specs/2026-09-27-rust-migration-design.md) — qarorlar, ma’lumotlar, API, security, deployment va platforma chegaralari.
2. [A: Rust core va desktop migratsiyasi](../superpowers/plans/2026-09-27-rust-core-desktop.md) — baseline’dan Windows/Linux/macOS beta’gacha.
3. [B: Sync backend, cloud va self-hosted](../superpowers/plans/2026-09-27-rust-sync-service.md) — ko‘p foydalanuvchi, E2EE sync, deployment va restore.
4. [C: Android, iOS va release](../superpowers/plans/2026-09-27-rust-mobile-release.md) — platforma integratsiyasi, mobil terminal va tarqatish.
5. [Tekshiruv va release matritsasi](validation.md) — har bosqichning chiqish shartlari.

## Bosqichlar va bog‘liqliklar

| Bosqich | Deliverable | Oldingi shart | Chiqish sharti |
| --- | --- | --- | --- |
| M0 | Electron snapshot va ko‘rib chiqiladigan reja | Mavjud kod | GitHub branchlar va hujjatlar mavjud |
| M1 | Besh platformada kichik feasibility probe | Reja ko‘rib chiqilgan | SSH + terminal input + secure storage ishlashi dalillangan |
| M2 | Rust domain, encrypted local vault, legacy importer | M1 | Eski ma’lumotlar yo‘qolmasdan import; noto‘g‘ri kalit rad |
| M3 | Rust SSH + Tauri desktop beta | M2 | Desktop parity, host-key verification, terminal testlar |
| M4 | Multi-user Rust sync server | M2 contractlari | Tenant isolation, auth, CAS va E2EE testlari |
| M5 | Client sync + self-hosted beta | M3 va M4 | Offline/conflict/recovery/URL switch + restore sinovlari |
| M6 | Android va iOS beta | M1, M3, M5 | Real device keyboard, key import, lifecycle testlari |
| M7 | Public cloud va stable release | M5 va M6 | Backup restore, security review, signed platform buildlari |

Backend va desktop ishlari domain/protocol contractlari tasdiqlangandan keyin parallel rivojlanishi mumkin. Birinchi kichik platforma probe’i mobil muammolarni oxirigacha yashirmaydi. Ushbu hujjatlar hech qanday avtomatik subagent ishini boshlamaydi.

## Vaqt va resurs

Bu sanaga bog‘langan va’da emas: bitta tajribali full-time engineer uchun dastlabki **12–20 engineer-week** diapazon, mustaqil review va app-store kutishlari bundan tashqari. Rust/Tauri yoki mobil bilan tajriba kam bo‘lsa ko‘proq vaqt kerak bo‘ladi. M1 natijasida qayta baholanadi.

| Ish | Dastlabki taxmin |
| --- | --- |
| Platforma probe’i va contractlar | 1–2 hafta |
| Core, kriptografiya, local storage, import | 2–3 hafta |
| SSH va desktop parity | 2–3 hafta |
| Auth, backend, sync va deployment | 3–5 hafta |
| Mobil adaptatsiya va release tekshiruvlari | 4–7 hafta |

Kerak bo‘ladigan resurslar: Windows runner/device, Linux X11 va Wayland muhitlari, macOS/Xcode, Android device, iPhone/iPad, signing akkauntlari, domain, HTTPS endpoint, staging server, backup storage va email yetkazish xizmati. Cloud hajmi/budjeti haqiqiy load testidan keyin aniqlanadi.

## Reja chegaralari

- Browser-only SSH, relay/bastion, Mosh roaming, SFTP, RDP, VNC, tunneling, team-shared vault va billing birinchi release scope’iga kirmaydi.
- SSH agent desktop’da platformaga mos tekshiriladi; mobilda imported key/password bilan ishlash asosiy yo‘l.
- Windows x64, Linux x64, macOS Intel/Apple Silicon, Android arm64 va iOS arm64 birinchi maqsadlar. Boshqa CPU arxitekturalari keyingi release.
- Local-only har doim ishlaydi; persistent SQLite app qayta ochilganda ham qoladi, cloud account va lokal server majburiy emas. Uninstall/device wipe uchun backup yoki sync zarur.
- Public cloud yangi server/account ma’lumotlari talab qiladi. Haqiqiy production deploy bu reja yozish vazifasida bajarilmaydi.
- License va yakuniy brend owner qarori; bu reja ularni tanlamaydi. Distribution boshlanishidan oldin license va dependency notice’lar kiritiladi.

## Implementatsiyani boshlash tartibi

Ushbu reja ko‘rib chiqilgach A1’dagi feasibility probe’dan boshlanadi. Rust workspace va kontraktlar M1 dalillarisiz “barcha platformada ishlaydi” deb e’lon qilinmaydi. Har task mustaqil commit/PR, tegishli test dalili va rollback tavsifi bilan tugaydi. To‘liq rewrite uchun bir martalik katta merge qilinmaydi.
