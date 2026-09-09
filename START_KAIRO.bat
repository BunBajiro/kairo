@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Kairo needs Node.js 24 or newer.
  echo Install the Windows LTS version from https://nodejs.org/ then run this file again.
  pause
  exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])<24){console.error('Please install Node.js 24 or newer from https://nodejs.org/');process.exit(1)}"
if errorlevel 1 (
  pause
  exit /b 1
)
node server/index.mjs --open
if errorlevel 1 pause
