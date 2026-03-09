@echo off

:: Abre o primeiro comando do React na aba atual
cd /d "./React"
wt -w 0 nt -d . cmd /k "pnpm dev"

:: Adiciona o servidor do React em uma nova aba
wt -w 0 nt -d . cmd /k "pnpm run server"

:: Adiciona o Electron em uma nova aba
cd /d "../Electron"
wt -w 0 nt -d . cmd /k "npm run nodemon"

exit
