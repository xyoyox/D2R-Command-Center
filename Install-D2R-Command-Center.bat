@echo off
setlocal enableextensions
title D2R Command Center - Setup
cd /d "%~dp0"

set "LOGFILE=%~dp0install.log"
echo ============================================ > "%LOGFILE%"
echo  D2R Command Center - Setup >> "%LOGFILE%"
echo  %DATE% %TIME% >> "%LOGFILE%"
echo ============================================ >> "%LOGFILE%"

echo.
echo   ============================================
echo    D2R COMMAND CENTER - one-click setup
echo   ============================================
echo.
echo   This will set everything up for you:
echo     - make sure Node.js is installed
echo     - install the small helper it needs
echo     - find your D2Loader.ps1
echo     - put an icon on your Desktop
echo     - open the app
echo.
echo   Nothing is sent anywhere - it all stays on this PC.
echo.
pause

REM ---------------------------------------------------------------
REM  1) Node.js
REM ---------------------------------------------------------------
echo.
echo   [1/5] Checking for Node.js...
where node >nul 2>nul
if not errorlevel 1 goto :have_node

echo         Node.js isn't installed yet - installing it for you now.
echo         (This is the only thing it downloads, and only once.)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ensure-node.ps1" >> "%LOGFILE%" 2>&1

REM make freshly-installed node visible in THIS window
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"
if exist "%LocalAppData%\Programs\nodejs\node.exe" set "PATH=%LocalAppData%\Programs\nodejs;%PATH%"

where node >nul 2>nul
if errorlevel 1 goto :no_node

:have_node
echo         Node.js is ready.
echo.

REM ---------------------------------------------------------------
REM  2) helper dependencies
REM ---------------------------------------------------------------
echo   [2/5] Installing helper dependencies (one time)...
if exist "app\node_modules\playwright-core" goto :deps_done
pushd "%~dp0app"
call npm install --no-audit --no-fund >> "%LOGFILE%" 2>&1
if errorlevel 1 (popd & goto :deps_failed)
popd
echo         Done.
echo.
goto :deps_done

:deps_failed
echo         [!] Couldn't install dependencies (offline?).
echo             The app still works; only "Get Token" needs this.
echo             You can retry later by running install-deps.bat.
echo.

:deps_done

REM ---------------------------------------------------------------
REM  3) find the loader automatically
REM ---------------------------------------------------------------
echo   [3/5] Looking for your D2Loader.ps1...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\auto-detect-loader.ps1" > "%~dp0detect.tmp" 2>&1
type "%~dp0detect.tmp"
type "%~dp0detect.tmp" >> "%LOGFILE%"
del "%~dp0detect.tmp" >nul 2>nul
echo.

REM ---------------------------------------------------------------
REM  4) Desktop shortcut
REM ---------------------------------------------------------------
echo   [4/5] Creating your Desktop shortcut...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\make-shortcut.ps1" -Force >> "%LOGFILE%" 2>&1
echo         Done - look for "D2R Command Center" on your Desktop.
echo.

REM ---------------------------------------------------------------
REM  5) Launch
REM ---------------------------------------------------------------
echo   [5/5] All set! Starting the app in a new window...
echo.
echo   ------------------------------------------------------------------
echo    Setup is complete. You can close THIS window whenever you like.
echo    From now on, just double-click the "D2R Command Center" icon
echo    on your Desktop.
echo   ------------------------------------------------------------------
echo.
timeout /t 3 >nul
start "" "%~dp0Start-D2R-Command-Center.bat"
echo.
echo   (If the app didn't open, double-click Start-D2R-Command-Center.bat
echo    or scripts\Run-Bridge.bat. Details are in install.log.)
echo.
pause
goto :eof

REM ---------------------------------------------------------------
REM  Node.js could not be installed
REM ---------------------------------------------------------------
:no_node
echo.
echo   [!] Could not install Node.js automatically.
echo.
echo   Please install it once from:
echo        https://nodejs.org    (click the big "LTS" button)
echo   ...then run this setup again.
echo.
echo   (You can still open index.html directly in your browser to
echo    browse your accounts - the Launch buttons will just copy the
echo    command instead of running it.)
echo.
pause
goto :eof
