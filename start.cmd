@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto missing
if exist node_modules\vite\bin\vite.js goto launch
where npm >nul 2>nul
if not errorlevel 1 (
    call npm install
    goto installed
)
where pnpm >nul 2>nul
if not errorlevel 1 (
    call pnpm install
    goto installed
)
:missing
echo Please install Node.js LTS from https://nodejs.org/ and run again.
pause
exit /b 1
:installed
if errorlevel 1 (
    pause
    exit /b 1
)
:launch
if "%~1"=="--no-open" (
    node node_modules\vite\bin\vite.js --host 127.0.0.1
) else (
    node node_modules\vite\bin\vite.js --host 127.0.0.1 --open
)
pause