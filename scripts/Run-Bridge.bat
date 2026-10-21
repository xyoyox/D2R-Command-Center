@echo off
cd /d "%~dp0"
echo Starting D2R Command Center bridge (minimal launcher)...
echo Log: bridge.log   -   stop with Ctrl+C
echo.
node "%~dp0..\app\server.js"
echo.
echo Bridge stopped (exit code %errorlevel%).
pause
