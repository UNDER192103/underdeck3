@echo off

:: Abre o primeiro comando do React na aba atual
cd /d "./apps/desktop/client"
wt -w 0 nt -d . cmd /k "pnpm dev"

:: Adiciona o servidor remote em uma nova aba
cd /d "../../remote"
wt -w 0 nt -d . cmd /k "pnpm run server"

:: Adiciona o Electron em uma nova aba
cd /d "../desktop/electron"
wt -w 0 nt -d . cmd /k "npm run nodemon"

exit
