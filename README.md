# Ryora Watch

Jam tangan DIY berbasis IoT (ESP32) untuk **tepat 2 orang** — pasangan eksklusif.

**Fitur:**
- 📅 Jadwal harian bersama (sinkron + getar reminder)
- 🗺️ Live location ala Google Maps (peta penuh di HP, mini-map di jam)
- 🤖 AI companion — ngobrol suara realtime langsung dari jam, tombol on/off khusus
- 💓 Tombol kangen — jam pasangan getar + animasi hati
- 🔋 Status pasangan di watchface

**Arsitektur singkat:** `Jam ESP32 ──BLE──> App HP (Flutter) ──> Server Node.js ──> App pasangan`

## Dokumentasi

- 📋 [docs/RENCANA.md](docs/RENCANA.md) — spesifikasi lengkap: fitur, arsitektur, flow koneksi, skema data, protokol, tahapan
- 🔩 [docs/BOM.md](docs/BOM.md) — daftar komponen & estimasi biaya (~Rp0,8–1,8jt untuk 2 jam; rekomendasi: **LilyGO T-Watch S3**, tanpa solder)
- 🔧 [docs/ASSEMBLY.md](docs/ASSEMBLY.md) — panduan merakit untuk tiap opsi hardware

## Status

Fase: **web app v1 jalan** — pairing, peta live, jadwal+reminder, kangen, AI (Gemini), PWA installable. Jam fisik = tahap berikutnya.

## Demo online instan (tanpa deploy)

```bash
npm start                 # server jalan di :3000
./cloudflared.exe tunnel --url http://localhost:3000
# → dapat https://xxx.trycloudflare.com — buka di HP berdua, pairing, GPS jalan (HTTPS)
```

## Menjalankan lokal

```bash
cp .env.example .env   # isi GEMINI_API_KEY (gratis: aistudio.google.com/apikey)
npm install
npm start              # → http://localhost:3000
```

## Deploy (HTTPS — wajib untuk GPS di HP)

**Render** (file `render.yaml` sudah disiapkan):
1. Push repo ke GitHub → render.com → New → Blueprint → pilih repo
2. Isi `GEMINI_API_KEY` di env vars → Deploy → dapat `https://xxx.onrender.com`

**Railway**: New Project → Deploy from GitHub → set `GEMINI_API_KEY` → generate domain.

Setelah deploy, buka URL HTTPS-nya di HP masing-masing → Add to Home Screen → pairing → GPS & getar jalan.
