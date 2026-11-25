# Ryora Watch 🌊

PWA couple-only companion — aplikasi berdua untuk kamu & pasangan. Express + Socket.IO + SQLite (libsql/Turso sync), installable di HP (Add to Home Screen).

**Live: https://ryora.lyrebird-butterfly.ts.net** (Tailscale Funnel + auto-start laptop)

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

## Run lokal (laptop)

```bash
start-ryora.bat        # server + Tailscale Funnel → https://ryora.lyrebird-butterfly.ts.net
# buka di HP berdua → Add to Home Screen → pairing → GPS & push jalan
# `ryora.vbs` di shell:startup bikin ini auto-jalan tiap Windows login
```

## Deploy permanen (aktual)

**Tailscale Funnel + Turso — gratis, tanpa kartu, URL tetap selamanya.** Detail: [`docs/DEPLOY.md`](docs/DEPLOY.md)

- Tunnel: `tailscale funnel --bg --https=443 localhost:3000` (hostname `ryora`, tailnet `lyrebird-butterfly`)
- DB: libsql embedded replica `data/replica.db` → auto-sync Turso tiap 60 detik → data selamat walau laptop restart
- Migrasi dari `data/couple.db` (node:sqlite lama) otomatis saat pertama jalan dengan `TURSO_URL`

Kalau nanti mau pindah ke Koyeb/Render/Fly: tinggal deploy repo + set env `GEMINI_API_KEY`, `TURSO_URL`, `TURSO_TOKEN` — data ikut otomatis karena udah di Turso.

## Catatan teknis

- `server/store.js` — SQLite via `libsql` (embedded replica: lokal + auto-sync Turso; tanpa `TURSO_URL` = file lokal biasa)
- VAPID push keys tersimpan di tabel `kv` — ikut ke-sync, nggak ilang saat redeploy
- `public/sw.js` — network-first + Web Push handler
- `.devin/` skill config — n/a; repo ini murni Node
- Widget Android homescreen butuh build APK (scaffolding di `android/`, perlu Android Studio)
