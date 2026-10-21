@echo off
setlocal enableextensions
title D2R Command Center
cd /d "%~dp0"

echo.
echo   ============================================
echo    D2R COMMAND CENTER
echo   ============================================
echo.
echo   Starting in the background - no extra windows.
echo   Only ONE Command Center window will open.
echo.

REM Make sure exactly ONE bridge is running (started hidden, no console
REM window) and open the UI unless it is already open.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\bridge-ctl.ps1" ensure
if errorlevel 1 goto :problem

echo.
echo   All set. You can close THIS window - the app keeps running.
echo.
timeout /t 4 >nul
goto :eof

:problem
echo.
echo   [!] The Command Center could not start.
echo       Open bridge.log in this folder for details.
echo.
pause
goto :eof
