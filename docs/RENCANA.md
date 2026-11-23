# Couple Watch — Rencana Produk & Teknis

Jam tangan DIY berbasis IoT (ESP32) untuk **tepat 2 orang**: jadwal harian bersama, live location ala Google Maps, AI companion **realtime voice** dengan tombol on/off khusus, dan tombol "kangen" yang menggetarkan jam pasangan — via BLE ke app HP dan backend Node.js.

> Status: spesifikasi disetujui, belum ada kode. Lihat `docs/BOM.md` untuk daftar komponen.

---

## 1. Konsep

Aplikasi couple **eksklusif berpasangan**: satu space = **tepat 2 orang, tidak lebih tidak kurang**. Couple lain bisa pakai server yang sama, tapi selalu dalam pair masing-masing — pair tidak pernah berinteraksi.

Setiap orang: **1 jam DIY ESP32 + 1 app HP Android**. Jam tidak punya internet/GPS sendiri — HP jadi jembatannya lewat BLE. Di tengah: **1 server Node.js** + database + AI (Gemini Live) yang hanya merelay data dalam bubble pasangan.

Chat & telpon **dihapus** dari scope (terlalu kompleks, nilai tambah kecil).

## 2. Fitur

1. **Jadwal harian bersama** — dibuat di app HP, sinkron ke jam berdua, getar saat waktunya.
2. **Live location ala GMaps** — app HP = peta penuh (pin kamu + pin pasangan + jejak pergerakan). Jam = **mini-map**: HP me-render potongan tile peta sekitar pasangan → kirim gambar via BLE → jam menampilkan. Fallback hemat: radar jarak + panah arah.
3. **AI companion — realtime voice** — percakapan suara dua arah natural (bisa saling nyela, kayak telepon) via **Gemini Live API** di-relay: jam mic → BLE → HP → Live API → audio balik → speaker jam. **Tombol fisik khusus on/off** (OFF = daya mic diputus, session ditutup). Push-to-talk = **mode fallback**. Konteks AI **per-pair**.
4. **Tombol kangen** — pencet di jam/app → jam pasangan **getar + animasi hati + nama pengirim**. Pola tap = kode rahasia (1x = kangen, 2x = "makan?", dst) + statistik ("dia kangen 14x minggu ini").
5. **Status pasangan** — indikator online/offline + baterai jam pasangan di watchface.

## 3. Aturan Eksklusivitas (inti produk)

- **Pairing**: orang pertama generate kode undangan sekali pakai → partner masukkan kode → pair **terkunci 2/2**. Tidak ada cara menambah orang ke-3; tidak ada registrasi publik/discovery.
- **1 user = 1 pair**: ganti pasangan harus "putus" pair dulu (data pair dihapus/diarsip sesuai pilihan kedua pihak).
- **Isolasi total**: setiap query/fitur selalu dibatasi `pair_id` — server bisa host banyak pair yang tidak saling terlihat.
- **AI per-pair**: memori/konteks AI hanya dari bubble pasangan itu.

## 4. Flow Koneksi (2 lapis)

### Lapis 1 — Couple pairing (di app HP, butuh internet)

- Kedua app punya tombol identik: **"Buat kode"** dan **"Masukkan kode"** — tidak ada role permanen; siapa pun boleh mengajak, posisi setelah sealed **setara penuh** (tidak ada admin/owner).
- Kode 6 karakter (atau QR) sekali pakai, expired 24 jam → `POST /pair/create` → `POST /pair/join` → status `sealed`.
- Setelah sealed, kode mati dan tidak bisa dipakai siapa pun lagi.

### Lapis 2 — Jam ↔ HP sendiri (BLE lokal, tanpa server)

- Jam = pengajak: broadcast `CoupleWatch-XXXX`. HP = penerima: app scan → pilih jam → verifikasi angka 6 digit yang tampil di layar jam (cegah salah sambung).
- Saat pertama connect, app menulis `device_token` user ke jam → jam terikat ke user itu, otomatis reconnect tiap dekat HP, dan ikut bubble couple lewat HP-nya.
- Lepas-pair jam = wipe token di jam + hapus device di app.

## 5. Arsitektur Sistem

```
PAIR 1:  ⌚ Jam ──BLE── 📱 App ──┐
                                ├──HTTPS+WSS── ☁️ Node.js Server ──→ scope: pair_id
PAIR 2:  ⌚ Jam ──BLE── 📱 App ──┘    ├─ Express REST: pairing, jadwal
                                      ├─ Socket.IO: lokasi, kangen, status
                                      ├─ /ai/token → ephemeral token Gemini Live
                                      ├─ DB: SQLite (Prisma)
                                      └─ AI relay: ephemeral token (bukan proxy audio)
```

- Jam **tidak punya internet/GPS sendiri** — HP jadi jembatan (GPS HP lebih akurat, jam lebih hemat baterai).
- Peta di jam = tile yang **di-render HP** (crop OSM sekitar lokasi pasangan), dikirim gambar terkompresi via BLE.
- Audio AI **tidak lewat server** — HP connect langsung ke Gemini Live dengan ephemeral token (latency lebih rendah, API key tetap aman di server).

## 6. Tech Stack

| Komponen | Stack | Catatan |
|---|---|---|
| Firmware jam | Arduino + PlatformIO, **LVGL**, **NimBLE-Arduino**, I2S (mic INMP441 + amp MAX98357A), **Opus** codec | ESP32-S3 wajib (CPU untuk Opus + stream) |
| App HP | **Flutter** (Android dulu) | `flutter_blue_plus`, `geolocator` + foreground service, `socket_io_client`, **`flutter_map`+OpenStreetMap**, audio codec Opus |
| Backend | Node.js + Express + Socket.IO + Prisma + SQLite | 1 instance kecil; multi-pair tapi terisolasi |
| AI | **Gemini Live API** (bidirectional audio streaming; free tier, limit ketat) — server minta **ephemeral token** agar API key tidak tersimpan di HP | Persona asisten couple, Indonesia santai |
| Maps | OpenStreetMap via `flutter_map` | Gratis tanpa billing; Google Maps SDK = alternatif |
| Hosting | Lokal dev → Railway/Render free tier | — |

## 7. Skema Data

- `User(id, name, pair_id NULLABLE, device_token)` — `pair_id` unik per user (1 pair saja)
- `Pair(id, code, status: waiting|sealed, user_a, user_b)` — sealed permanen saat 2/2; `break_up` menghapus/arsip
- `Schedule(id, pair_id, title, note, start_time, end_time, repeat_rule, notify)`
- `LatestLocation(user_id, lat, lng, ts, battery)` + `LocationPing` (append, retensi 24 jam → jejak di peta)
- `MissYouEvent(id, pair_id, from_user, pattern, ts)` — statistik kangen
- `AISetting(user_id, enabled, persona)` + `AIMemory` opsional per-pair

## 8. Protokol Komunikasi

### BLE GATT (Jam ↔ HP)

| Characteristic | Arah | Isi |
|---|---|---|
| `SCHED` | notify | jadwal hari ini (JSON, chunked) |
| `LOCA` | notify | koordinat pasangan + jarak/bearing |
| `MAP` | notify | tile gambar mini-map (chunked, JPEG kecil ~≤20KB) |
| `MISS` | write/notify | kirim/terima event kangen + pola tap |
| `AI` | write/notify | tombol state + **audio stream dua arah** (Opus ~24kbps, chunked, jitter buffer di jam) + status listening/thinking/speaking/interrupted |
| `BATT`/`SYNC` | notify/write | status baterai & re-sync |

### Socket.IO

`location:update`, `miss:send`, `partner:status` — semua event wajib bawa `pair_id` dan divalidasi membership-nya.

### REST

- `POST /pair/create` — buat kode undangan
- `POST /pair/join` — join pakai kode → sealed
- `POST /pair/break` — putus pair
- `GET/POST/PUT/DELETE /schedules`
- `GET /partner/location`
- `POST /ai/token` — mint ephemeral token Gemini Live
- `POST /ai/chat` — fallback text/push-to-talk

## 9. UI Jam (LVGL, 240×240)

1. **Watchface** — jam, tanggal, baterai, ikon status pasangan, dot jadwal berikutnya.
2. **Jadwal** — list hari ini, highlight item aktif, getar saat mulai.
3. **Peta** — mini-map tile + pin pasangan; jarak & "x mnt lalu". Fallback radar: panah + jarak.
4. **AI** — animasi listening/thinking/speaking; jawaban juga tampil sebagai text.
5. **Kangen** — animasi hati saat menerima; tap untuk kirim balik; counter mingguan.
6. **Status** — baterai, nama pasangan, last-sync, re-sync.

## 10. Desain Fitur Kunci

- **Tombol kangen:** event `miss:send` via BLE→HP→server→HP pasangan→BLE→getar pola + animasi hati. Rate-limit sopan (mis. 1x/10 dtk).
- **Mini-map di jam:** HP render tile 240×240 (zoom ~16, center lokasi pasangan, pin + lingkaran akurasi) saat layar peta dibuka/lokasi berubah → JPEG low-quality via BLE chunked. Target latency < 3 dtk.
- **AI companion (realtime):** tombol ON → HP minta ephemeral token (`/ai/token`) → buka session Gemini Live → audio mic jam (Opus-encoded di ESP32-S3) distream via BLE→HP→Live API; respons audio distream balik → jitter buffer → speaker jam. **Barge-in**: suara user terdeteksi saat playback → stop speaker + kirim interrupt. Session auto-close setelah 60 dtk idle (baterai). Fallback push-to-talk via `/ai/chat`. Tombol OFF memutus daya mic (GPIO) + tutup session.
- **Live location:** fix tiap 15–30 dtk foreground / 2–5 mnt background (FusedLocationProvider, hemat baterai). Server relay ke partner (scope pair); app update pin + polyline jejak.

## 11. Tahapan Pengerjaan

1. **Backend** — pairing sealed-2, schedule CRUD, location relay, miss relay, `/ai/token`. Testable tanpa hardware.
2. **App HP** — pairing flow, jadwal UI, peta live, tombol kangen, AI voice session, BLE bridge + tile renderer.
3. **Firmware** — mulai dari **audio pipeline** (risiko #1): I2S record/play + Opus + BLE streaming; lalu LVGL 6 screen, GATT client, JPEG tile display, getar pola, tombol AI.
4. **Integrasi** — semua alur end-to-end antar pair.
5. **Enclosure** — casing (lubang mic/grill speaker), strap, uji baterai.

## 12. Estimasi

- Hardware: **Rp0,8–1,8jt / 2 jam** — rekomendasi **LilyGO T-Watch S3** (~Rp1,5–1,8jt, tanpa solder, audio+casing onboard). Detail & alternatif di `docs/BOM.md`, cara merakit di `docs/ASSEMBLY.md`
- Software/API: **Rp0** (Gemini free tier, OSM, hosting free tier)
- Dev tools (Windows): VSCode + PlatformIO, Flutter SDK + Android Studio, Node.js LTS

## 13. Risiko & Catatan

- **AI realtime via BLE = risiko #1** — continuous audio dua arah di BLE + jitter buffer + Opus di ESP32-S3. Latency target ~1–2 dtk/giliran. Mitigasi: Opus encode, MTU 512 + connection interval kecil, fallback push-to-talk, fase firmware mulai dari audio pipeline.
- **Gemini Live free tier** — limit session/concurrent ketat; habis → fallback push-to-talk (API biasa).
- **Tile peta via BLE** — chunked transfer + JPEG decode di ESP32-S3 (sanggup, ada contoh LVGL+JPEG).
- **Baterai** — target 1 hari: layar sleep, wake-on-raise (IMU), mic off saat AI off.
- **Privasi** — lokasi auto-hapus >24 jam; isolasi ketat per pair; mic hardware off saat tombol AI OFF.
- **Android-only v1** — background BLE+location di iOS sangat dibatasi.
- **Verifikasi pin audio** board Waveshare jadi langkah pertama saat beli komponen.
