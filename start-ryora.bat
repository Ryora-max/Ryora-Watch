@echo off
title Ryora Watch
echo ==========================================
echo   RYORA WATCH - daily couple app
echo ==========================================
cd /d C:\Invest
start "ryora-server" /min cmd /c "npm start"
timeout /t 4 /nobreak >nul
echo.
echo Server jalan di http://localhost:3000
echo.
echo Bikin tunnel HTTPS (URL muncul di bawah)...
cloudflared.exe tunnel --url http://localhost:3000
pause
