@echo off
title Ryora Watch
echo ==========================================
echo   RYORA WATCH - daily couple app
echo ==========================================
cd /d C:\Invest
start "ryora-server" /min cmd /c "npm start"
timeout /t 4 /nobreak >nul
rem pastikan Tailscale funnel aktif (URL tetap, bukan ganti-ganti)
"C:\Program Files\Tailscale\tailscale.exe" funnel --bg 3000 >nul 2>&1
echo.
echo App live 24/7 di:
echo   https://ryora.lyrebird-butterfly.ts.net
echo.
echo (selama laptop nyala — data aman di Turso cloud)
pause
