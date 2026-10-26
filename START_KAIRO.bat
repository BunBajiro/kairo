@echo off
rem Start from the distribution root; the Node supervisor owns runtime locking,
rem browser launch and shutdown. This launcher neither installs nor builds.
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Kairo needs the current Node.js 24 LTS, version 24.21.0 or newer.
  echo Install the Windows LTS version from https://nodejs.org/ then run this file again.
  pause
  exit /b 1
)
node -e "import('./server/runtime-version.mjs').then(m=>m.assertSupportedRuntime()).catch(e=>{console.error(e.message);process.exitCode=1})"
if errorlevel 1 (
  pause
  exit /b 1
)
node server/start.mjs --open
if errorlevel 1 pause
