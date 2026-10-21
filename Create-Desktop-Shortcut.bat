@echo off
title D2R Command Center - Desktop Shortcut
cd /d "%~dp0"

echo.
echo   ============================================
echo    D2R COMMAND CENTER - Desktop Shortcut
echo   ============================================
echo.

where powershell >nul 2>nul
if %errorlevel% neq 0 (
  echo   [!] PowerShell was not found. Cannot create the shortcut.
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\make-shortcut.ps1" -Force

echo.
echo   Look for "D2R Command Center" on your Desktop.
echo.
pause
