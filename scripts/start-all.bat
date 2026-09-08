@echo off
setlocal

cd /d "%~dp0.."

call pnpm run start:all

exit /b 0
