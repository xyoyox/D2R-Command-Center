@echo off
setlocal enableextensions
title D2R Command Center - Stop
cd /d "%~dp0"

echo.
echo   Stopping the D2R Command Center bridge...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\bridge-ctl.ps1" stop

echo.
echo   Done. (You can close this window.)
echo.
pause
goto :eof
