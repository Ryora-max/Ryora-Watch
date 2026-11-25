# Deploy Permanen — Koyeb + Turso (gratis, tanpa kartu)

Arsitektur: app jalan di **Koyeb** (always-on, WebSocket OK) dan database SQLite
auto-sync ke **Turso** lewat libsql embedded replica — data selamat walau server
restart atau redeploy.

## 1. Turso (database persisten) — 5 menit

1. Buka https://turso.tech → **Sign up** → login dengan GitHub (gratis, tanpa kartu)
2. Install CLI: `npm i -g @turso/cli` → `turso auth login` (buka browser)
3. Buat DB + ambil kredensial:
   ```
   turso db create ryora
   turso db show ryora --url        # → libsql://ryora-xxx.turso.io
   turso db tokens create ryora     # → eyJhbGciOi... (token panjang)
   ```

## 2. Koyeb (hosting) — 5 menit

1. Buka https://www.koyeb.com → **Sign up** → **Continue with GitHub** (gratis, tanpa kartu)
2. **Create Service** → **GitHub** → pilih repo `Ryora-Watch`
3. Builder: **Buildpack** (bukan Docker) — dia otomatis `npm install` + `npm start`
4. Tambah **Environment Variables**:

   | Key | Value |
   |---|---|
   | `GEMINI_API_KEY` | (key dari .env lokal / aistudio.google.com/apikey) |
   | `TURSO_URL` | `libsql://ryora-xxx.turso.io` |
   | `TURSO_TOKEN` | `eyJhbGciOi...` |

5. Instance: pilih **Free** (1 nano, always-on) → **Deploy**

## 3. Selesai

- Koyeb kasih URL `https://ryora-xxx.koyeb.app` — buka di HP, pair ulang sekali
  (akun lama ada di laptop, nggak ikut pindah — atau copy `data/couple.db` ke Turso via `turso db shell`)
- Install PWA dari URL baru — selesai, app on 24/7
- Push notif tetap jalan (VAPID tersimpan di DB, ikut ke-sync)

## Migrasi data lokal → Turso (opsional)

Kalau mau data yang sudah ada (kenangan, surat, pair) ikut:

```
turso db shell ryora ".dump" < kosong   # cek koneksi dulu
# paling gampang: start server lokal dengan TURSO_URL/TOKEN di .env —
# libsql otomatis push isi couple.db lokal ke Turso saat sync pertama
```

Caranya: isi `TURSO_URL` + `TURSO_TOKEN` di `.env` lokal → `npm start` → tunggu
log `[db] sync awal Turso OK` → semua data lokal ikut ke cloud.
