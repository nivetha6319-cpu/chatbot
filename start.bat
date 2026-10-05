@echo off
title Pink AI Chatbot Server
echo ========================================================
echo       🌸 Starting Pink AI Chatbot Server... 🌸
echo ========================================================
echo.
echo Opening http://localhost:5000 in your browser...
start http://localhost:5000
echo.
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0server.ps1" -Port 5000
pause
