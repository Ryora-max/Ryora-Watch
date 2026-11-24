# Ryora Watch 🌊

PWA couple-only companion — aplikasi berdua untuk kamu & pasangan. Express + Socket.IO + SQLite, installable di HP (Add to Home Screen).

## Fitur

**🏠 Home**
- Kartu pasangan: mood, status, online/jarak, lagu kalian
- Pertanyaan harian berdua, catatan kecil, foto harian (dengan caption), album kenangan + "hari ini N lalu"
- Mood tracker seminggu, streak harian, countdown monthsary/ultah/ketemu

**🗺️ Peta**
- Live location dua arah, trail 1 jam, love-line animasi
- Toggle share lokasi (hemat baterai/privasi)

**📅 Jadwal**
- Jadwal bersama + reminder 2 fase (5 menit sebelum + pas mulai, AI bicara)
- Jadwal berulang (harian/mingguan), kalender, bucket list
- Ajakan quality time 1-tap: ☕ Call · 🎬 Nobar · 🍽️ Date

**💓 Kangen**
- Tap kangen pola, sentuh bareng (touch sync), care pings (makan/minum/peluk/tidur)
- Suit skor persisten, Truth or Dare, nobar countdown sinkron
- Voice note, doodle, surat cinta, kado kejutan terkunci-waktu
- Mood sedih → prompt "peluk dia" otomatis

**✦ Bestie AI (Gemini)**
- Chat teks + voice mode: ngobrol kontinyu hands-free (Edge TTS, cowo/cewe)
- Sapaan pagi kontekstual + check-in proaktif siang hari
- Tahu jadwal, lokasi, mood kalian; memory fakta

**✨ Lainnya**
- Web Push notif OS (kangen/ping/foto masuk walau app ketutup)
- Rekap bulanan/tahunan → PNG siap story, heatmap aktivitas
- Kode cadangan akun, export data, 5 tema, tour guide, iOS-friendly

## Menjalankan

```bash
cp .env.example .env   # isi GEMINI_API_KEY (gratis: aistudio.google.com/apikey)
npm install
npm start              # → http://localhost:3000
```

## Demo instan (laptop + tunnel)

```bash
start-ryora.bat        # server + cloudflared tunnel — copy URL https-nya
# buka di HP berdua → Add to Home Screen → pairing → GPS & push jalan
```

## Deploy permanen

`render.yaml` siap — render.com → Blueprint → pilih repo → isi `GEMINI_API_KEY`. (Free tier Render sekarang minta kartu; alternatif: Koyeb.)

## Catatan teknis

- `server/store.js` — SQLite via `node:sqlite` (DatabaseSync)
- `public/sw.js` — network-first + Web Push handler
- `.devin/` skill config — n/a; repo ini murni Node
- Widget Android homescreen butuh build APK (scaffolding di `android/`, perlu Android Studio)
