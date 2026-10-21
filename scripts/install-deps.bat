@echo off
REM ============================================================
REM  D2R Command Center - install bridge dependencies
REM  Installs playwright-core (small - it reuses your existing
REM  Microsoft Edge / Google Chrome, so no browser download).
REM  Start-D2R-Command-Center.bat now does this automatically on
REM  first run, so this file is only needed to re-install/repair.
REM ============================================================
setlocal
cd /d "%~dp0..\app"
echo.
echo  Installing bridge dependencies (playwright-core)...
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo  [!] Node.js was not found. Install it from https://nodejs.org then re-run this file.
  pause
  exit /b 1
)
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo  [!] npm install failed. Check your internet connection and try again.
  pause
  exit /b 1
)
echo.
echo  Done. You can now run Start-D2R-Command-Center.bat
echo.
pause
