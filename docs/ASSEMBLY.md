# Cara Merakit — Couple Watch

Panduan perakitan untuk tiap opsi hardware. Prinsip umum: **test di luar casing dulu (bench test), baru masukkan casing setelah semua jalan.**

---

## Jalur T — T-Watch S3 (direkomendasikan, tanpa solder)

Semua komponen sudah terpasang dari pabrik. "Merakit" = flash firmware:

1. Install VSCode + ekstensi PlatformIO di PC.
2. Hubungkan T-Watch via USB-C → port terdeteksi (driver CH340/CP210x kalau diminta).
3. Clone/copy project firmware → sesuaikan `platformio.ini` (board `esp32-s3`) → **Build & Upload**.
4. Tes: layar hidup (watchface), getar motor, mic/speaker via menu test firmware.
5. Pair ke app HP via BLE (angka 6 digit muncul di layar).
6. Selesai — tinggal charge & pakai.

Perkakas: cuma PC + kabel USB-C data.

---

## Jalur A — Waveshare ESP32-S3-Touch-LCD-1.28 + modul audio

### Komponen & wiring

Modul audio disolder ke pin breakout board (cek datasheet pin kosong; INMP441 & MAX98357A **share clock** BCK/WS, pin data beda):

| Modul | Pin modul | → Pin ESP32-S3 (contoh*) |
|---|---|---|
| INMP441 (mic) | VDD, GND, SD, WS, SCK, L/R→GND | 3V3, GND, GPIO_SD, GPIO_WS, GPIO_SCK |
| MAX98357A (amp) | VIN, GND, DIN, BCLK, LRC | 3V3/5V, GND, GPIO_DIN, GPIO_WS†, GPIO_SCK† |
| Speaker | +/− | out +/− MAX98357A |
| Tombol AI | 2 kaki | GPIO_AI ↔ GND (INPUT_PULLUP) |
| Vibration (jika board tak punya) | +/− | GPIO_VIB via transistor / driver pin |

\* Pin exact mengikuti pinout board — verifikasi di wiki Waveshare. † share dengan WS/SCK mic.

### Langkah

1. **Flash & test board dulu**: PlatformIO → upload firmware → layar/touch/IMU jalan.
2. **Bench test audio**: solder modul dengan kabel dupont → test rekam (mic) & play (speaker) → test stream BLE.
3. **Test baterai**: colok LiPo → charge → cek monitoring baterai di firmware.
4. **Masuk casing**: board → baterai di belakang → mic dekat lubang casing → speaker di grill → tombol AI di sisi → strap pin.
5. QC: getar, tombol, charge, BLE reconnect.

Perkakas: solder, timah, kabel kecil, lem/double tape, pinset.

---

## Jalur B — Rakit penuh (komponen terpisah)

### Wiring utama (contoh pin ESP32-S3*)

| Modul | Koneksi |
|---|---|
| GC9A01 layar | SCL→SCK, SDA→MOSI, DC/CS/RST/BL→GPIO, VCC→3V3 |
| INMP441 | seperti tabel Jalur A |
| MAX98357A + speaker | seperti tabel Jalur A |
| TP4056 | B+/B− → LiPo; OUT+ → switch → VIN/5V MCU; OUT− → GND |
| Tombol (3–4x) | GPIO ↔ GND (navigasi atas/bawah/OK + AI) |
| MPU6050 (opsional) | SDA/SCL I2C + VCC/GND |
| Vibration | GPIO via transistor + diode |

\* Sesuaikan pinout board pilihan (XIAO S3 / SuperMini) — dokumentasikan di `firmware/pins.h`.

### Langkah

1. Rangkai di **breadboard** dulu: MCU + layar → flash → tampil watchface.
2. Tambah audio → test mic/speaker/BLE stream.
3. Tambah power (TP4056 + LiPo + switch) → test charge & jalan dari baterai.
4. Pindah ke perfboard/solder langsung → kecilkan footprint.
5. Desain/print casing sesuai ukuran rakitan → rakit masuk casing + strap.

Perkakas: solder, timah, breadboard, kabel dupont, multimeter, 3D printer/jasa.

---

## Checklist bench test (semua jalur)

- [ ] Flash firmware via USB → layar hidup
- [ ] BLE advertise `CoupleWatch-XXXX` terlihat di scan HP
- [ ] Pairing angka 6 digit → connect → reconnect
- [ ] Mic rekam → sample terkirim; speaker bunyi
- [ ] Vibration motor pola getar
- [ ] Jalan dari baterai + indikator charge benar
- [ ] Idle sleep → wake on raise (IMU)

## Urutan pengerjaan firmware (saat coding)

1. Display + watchface
2. BLE GATT (semua characteristic dummy dulu)
3. **Audio pipeline** (mic→Opus→BLE→HP→balik→speaker) — risiko #1, dikerjakan paling awal
4. Screen lain (jadwal/peta/AI/kangen/status)
5. Power management & polish
