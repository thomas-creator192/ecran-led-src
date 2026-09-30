@echo off
chcp 65001 >nul
title Écran LED - SRC La Clayette
cd /d "%~dp0"
if not exist node_modules (
  echo Première installation...
  call npm install --omit=dev
)
node server.js
pause
