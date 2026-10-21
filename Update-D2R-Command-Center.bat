@echo off
setlocal enableextensions
title D2R Command Center - Update
cd /d "%~dp0"

echo.
echo   ============================================
echo    D2R COMMAND CENTER - UPDATE
echo   ============================================
echo.
echo   This updates your EXISTING D2R Command Center
echo   to THIS version. It will:
echo.
echo     - find your current D2R Command Center folder
echo     - stop the running app
echo     - REMOVE the old files
echo     - copy the new files in
echo     - keep your settings and accounts
echo     - restart the app
echo.
echo   It does NOT touch Shupershuff's D2Loader.ps1.
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update.ps1"

echo.
echo   ------------------------------------------------------------------
echo    Want a totally fresh install instead? Extract this zip into a
echo    brand-new empty folder and run
echo    Install-D2R-Command-Center.bat there.
echo   ------------------------------------------------------------------
echo.
pause
goto :eof
