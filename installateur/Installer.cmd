@echo off
title Installation - Ecran LED SRC
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0app\installateur\installer.ps1" -Source "%~dp0."
if errorlevel 1 (
  echo.
  echo L'installation a echoue. Envoie une capture de cette fenetre.
)
echo.
pause
