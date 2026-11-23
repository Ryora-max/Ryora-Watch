# Ryora Watch → APK Android (Capacitor)

Struktur project Android sudah ke-generate di folder `android/` via Capacitor.

## Cara build APK

Butuh **Android Studio** + JDK 17+.

```bash
# 1. Sync web assets terbaru ke project android
npx cap sync android

# 2. Buka di Android Studio
npx cap open android

# 3. Di Android Studio: Build > Build APK(s)
#    Output: android/app/build/outputs/apk/debug/app-debug.apk
```

## PENTING: arahkan ke server

App butuh backend (Express + Socket.IO). Ada 2 mode:

### Mode remote (disarankan)
Set `server.url` di `capacitor.config.json` ke URL deploy permanen:

```json
"server": { "url": "https://ryora-kamu.onrender.com", "androidScheme": "https" }
```

Lalu `npx cap sync`. Webview langsung load server — selalu versi terbaru,
tidak perlu rebuild saat update app.js. Data & socket jalan normal.

### Mode bundled (offline assets — TIDAK akan konek)
Tanpa `server.url`, APK mem-bundle `public/` tapi fetch/socket relatif
tidak punya host → app akan gagal load data. Hanya berguna kalau backend
juga dibungkus (tidak disarankan).

## Widget home-screen

`RyoraWidget` (native, Java) sudah terdaftar:
- File: `android/app/src/main/java/com/ryora/watch/RyoraWidget.java`
- Tampil "💓 Ryora", tap → buka app
- Teks widget dibaca dari `SharedPreferences("ryora_widget")` key `line1`/`line2`
  → untuk menampilkan streak/hari ke-N real, perlu plugin Capacitor kecil
  yang menulis prefs itu dari JS (follow-up, ~50 baris Java+JS).

## Catatan

- Geolocation di APK butuh permission `ACCESS_FINE_LOCATION` di manifest
  (tambahkan bila build final: `<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>`)
- Push notif native butuh FCM — saat ini notifikasi jalan via Web Notification
  saat webview hidup.
