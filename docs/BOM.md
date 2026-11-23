# BOM — Couple Watch (2 Unit Jam)

Daftar komponen untuk merakit **2 jam**. Empat varian: **Opsi T** (T-Watch, disarankan), **Opsi A** (Waveshare all-in-one), **Opsi B** (komponen terpisah, termurah), dan **Varian Lite** (tanpa audio di jam).

Harga = estimasi pasar Indonesia (Tokopedia/Shopee/AliExpress), November 2025. Kata kunci pencarian dicantumkan per item. Panduan perakitan: `docs/ASSEMBLY.md`.

## Perbandingan Cepat

| | **T-Watch S3** ⭐ | Opsi A (Waveshare) | Opsi B (DIY penuh) |
|---|---|---|---|
| Harga 2 jam | ~Rp1,5–1,8jt | ~Rp1,3–1,7jt | ~Rp0,8–1,05jt |
| Solder | **0** | sedikit (audio) | banyak (~15–20 titik/jam) |
| Casing | **sudah jadi jam** | 3D print | 3D print |
| Mic+speaker | **onboard (ES8311)** | tambah modul | tambah modul |
| Vibration/IMU/RTC | onboard | IMU saja | tambah modul |
| Layar | **kotak** 1.54" 240×240 | **bulat** 1.28" 240×240 | bulat 1.28" |
| Tampilan | dev-watch (agak tebal) | jam bulat cantik | tergantung casing |
| Risiko rakit | **paling rendah** | sedang | tinggi |

**Rekomendasi: T-Watch S3** — selisih harga kecil, tapi menghilangkan 2 risiko terbesar (solder audio + casing). Pilih Opsi A kalau layar bulat wajib; Opsi B kalau budget ketat & siap solder.

---

## Opsi T — LilyGO T-Watch S3 (direkomendasikan)

Dev-watch siap pakai: ESP32-S3 + layar sentuh 1.54" + **codec audio ES8311 (mic+speaker onboard)** + PMU AXP2101 + RTC PCF8563 + haptic DRV2605 + IMU BMA423 + casing + strap.

| Item | Kata kunci pencarian | Qty | Estimasi |
|---|---|---|---|
| LilyGO T-Watch S3 | `LilyGO T-Watch S3` / `TTGO T-Watch S3` (AliExpress/Shopee/Tokopedia) | 2 | Rp 1,5–1,8jt |
| Baterai cadangan (opsional) | `lipo T-Watch` — cek include baterai di listing | 2 | Rp 0–100rb |
| **TOTAL** | | | **± Rp 1,5–1,8jt** |

⚠️ Cek di listing: (1) include baterai & strap, (2) versi S3 bukan T-Watch 2020 (versi lama, ESP32 biasa — lebih lemah untuk audio streaming).

---

## Opsi A — Direkomendasikan (solder minimal)

Basis: **Waveshare ESP32-S3-Touch-LCD-1.28** — board bulat all-in-one: ESP32-S3 + layar sentuh GC9A01 240×240 + charger baterai + IMU QMI8658 + konektor baterai. Memang dirancang untuk project jam.

| Item | Kata kunci pencarian | Qty | Estimasi |
|---|---|---|---|
| Board utama | `Waveshare ESP32-S3-Touch-LCD-1.28` | 2 | Rp 900rb–1,1jt |
| Mic I2S | `INMP441 I2S microphone module` | 2 | Rp 60–80rb |
| Amp + speaker | `MAX98357A I2S amplifier` + `speaker mini 8 ohm 1W 2W` | 2 set | Rp 80–120rb |
| Tombol AI | `tactile button 6x6` | 2 | Rp 10rb |
| Baterai | `lipo 3.7v 500mah JST` (cek konektor board: SH1.0/MX1.25) | 2 | Rp 100–140rb |
| Strap | `watch strap 20mm / 22mm` (sesuaikan casing) | 2 | Rp 50–100rb |
| Casing | 3D print sendiri / jasa print (`3d print service`) | 2 | Rp 100–150rb |
| Kabel + lem + sekrup kecil | assorted | 1 set | Rp 30rb |
| **TOTAL** | | | **± Rp 1,3–1,7jt** |

⚠️ **Verifikasi sebelum beli**: jumlah GPIO kosong yang di-breakout board Waveshare — butuh ~5–6 pin untuk I2S mic + I2S amp + tombol AI (mic & amp bisa share clock BCK/WS, jadi pin data terpisah).

---

## Opsi B — Termurah (solder penuh)

| Item | Kata kunci pencarian | Qty | Estimasi |
|---|---|---|---|
| MCU | `XIAO ESP32-S3` / `ESP32-S3 SuperMini` — **wajib S3** (CPU cukup untuk Opus) | 2 | Rp 140–200rb |
| Layar | `GC9A01 1.28 round LCD 240x240 SPI` (non-touch) | 2 | Rp 120–160rb |
| Mic + amp + speaker | `INMP441` + `MAX98357A` + `speaker 8ohm` | 2 set | Rp 140–200rb |
| Charger baterai | `TP4056 protection` | 2 | Rp 15–25rb |
| Step-up/regulator | `MT3608 boost` / pakai board dengan LDO | 2 | Rp 20–35rb |
| Tombol | `tactile button` (navigasi + AI) | 6–8 | Rp 15rb |
| Baterai + getar | `lipo 500mah` + `coin vibration motor` | 2 set | Rp 120–160rb |
| IMU (opsional) | `MPU6050` — wake-on-raise | 2 | Rp 50rb |
| Casing + strap | 3D print + `watch strap` | 2 | Rp 150–200rb |
| **TOTAL** | | | **± Rp 780rb–1,05jt** |

Kelebihan: murah, semua komponen umum & gampang dicari. Kekurangan: solder ~15–20 titik per jam (layar SPI + power + audio), casing harus fit rakitan sendiri, layar **non-touch** → navigasi pakai tombol (UI disesuaikan).

---

## Varian Lite (tanpa audio di jam)

Buang dari Opsi A/B: INMP441, MAX98357A+speaker, tombol AI (opsional tetap ada untuk on/off state saja).

- **Hemat ~Rp200–300rb** dan menghilangkan risiko #1 (audio via BLE).
- Konsekuensi: AI dipakai lewat **mic/speaker HP** — jam tetap tampil jawaban text & tombol trigger. "Ngobrol langsung dari jam" hilang.
- Bisa upgrade nanti: beli modul audio belakangan kalau v1 sudah jalan.

---

## Tidak Perlu Dibeli

| Komponen | Kenapa tidak perlu |
|---|---|
| Modul GPS (NEO-6M/M8N) | Live location pakai GPS HP — lebih akurat & hemat baterai |
| Modul GSM (SIM800L) | Jam lewat BLE ke HP, bukan standalone |
| RTC (DS3231) | Jam sync waktu dari HP via BLE |
| Kartu SIM/pulsa | Tidak ada fitur telpon/call standalone |

## Perkakas Diasumsikan Ada

- Solder + timah + flux (Opsi B wajib; Opsi A hanya untuk modul audio)
- Kabel dupont/jumper untuk prototyping
- Multimeter (cek baterai & kontinuitas)
- Akses 3D printer (sendiri/jasa)
- Kabel USB-C data untuk flashing firmware

## Checklist Sebelum Checkout

- [ ] Pilih Opsi A atau B (atau Lite)
- [ ] Untuk Opsi A: cek datasheet pin breakout Waveshare cukup untuk audio
- [ ] Konektor baterai cocok dengan board (JST SH1.0 / MX1.25 / PH2.0)
- [ ] Ukuran strap cocok dengan desain casing yang dipilih
- [ ] Ukuran casing muat modul audio (mic butuh lubang, speaker butuh grill + ruang resonansi)
