@echo off
setlocal enableextensions
title D2R Command Center (background)
cd /d "%~dp0"

echo.
echo   ============================================
echo    D2R COMMAND CENTER - background mode
echo   ============================================
echo.
echo   Starting the bridge with NO window and NO browser.
echo   Open the app any time with the "D2R Command Center"
echo   desktop icon (it will reuse this same bridge).
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bridge-ctl.ps1" ensure -NoUi
if errorlevel 1 goto :problem

echo.
echo   Done. The bridge is running quietly in the background.
echo.
timeout /t 4 >nul
goto :eof

:problem
echo.
echo   [!] The bridge could not start. See bridge.log for details.
echo.
pause
goto :eof
