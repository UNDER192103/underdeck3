@echo off
setlocal

cd /d "%~dp0"

wt -w 0 nt -d ".\apps\desktop\client" cmd /k "pnpm dev"
wt -w 0 nt -d ".\apps\remote" cmd /k "pnpm dev"
wt -w 0 nt -d ".\apps\remote" cmd /k "pnpm run server"
wt -w 0 nt -d ".\apps\desktop\electron" cmd /k "npm run nodemon"

exit /b 0
