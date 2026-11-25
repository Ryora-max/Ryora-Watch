# Deploy — Tailscale Funnel + Turso (aktual, live)

App live di: **https://ryora.lyrebird-butterfly.ts.net** ✅

Arsitektur yang dipakai sekarang:
- **Server**: laptop lokal — Express + Socket.IO (`npm start` / `start-ryora.bat`)
- **Tunnel**: Tailscale Funnel — URL HTTPS tetap selamanya, auto-on tiap boot
- **Database**: libsql embedded replica → `data/replica.db` lokal, auto-sync ke
  **Turso** tiap 60 detik. Data selamat walau laptop mati/restart.
- **Push notif**: VAPID keys disimpan di DB (kv table), ikut ke-sync.

## Auto-start (Windows)

`ryora.vbs` di `shell:startup` menjalankan `start-ryora.bat` hidden tiap login:
1. `npm start` — server di port 3000
2. `tailscale funnel --bg --https=443 localhost:3000` — tunnel publik

## Env wajib (`.env`)

```
GEMINI_API_KEY=...
GEMINI_MODEL=...
TURSO_URL=libsql://ryora-ryora-max.aws-ap-southeast-1.turso.io
TURSO_TOKEN=...
```

Tanpa `TURSO_URL` → fallback ke `data/couple.db` (SQLite file biasa, no sync).

## Migrasi data lama

`server/store.js` auto-migrasi dari `data/couple.db` (node:sqlite) ke
`data/replica.db` (libsql) saat pertama jalan dengan `TURSO_URL` terisi —
copy semua tabel non-sistem yang kosong di replica. Log: `[db] migrasi N baris`.

## Pindah ke hosting lain nanti (opsional)

Data sudah di Turso → deploy ke Koyeb/Render/Fly tinggal:
1. Set env `GEMINI_API_KEY`, `TURSO_URL`, `TURSO_TOKEN`
2. Deploy repo (Buildpack, start command `npm start`)
3. App langsung baca data yang sama — tanpa migrasi.

Batasan funnel saat ini: laptop harus nyala & online untuk app bisa diakses.
