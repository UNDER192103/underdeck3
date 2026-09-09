@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
title Under Deck - GitHub Helper

rem Git nao diferencia workspace PNPM de repositorio comum. Submodules sao
rem detectados somente pelo .gitmodules, por isso funciona apos separar remote.
set "SCRIPT_ROOT=%~dp0.."
for %%I in ("%SCRIPT_ROOT%") do set "SCRIPT_ROOT=%%~fI"
set "MAIN_REPO="
set "DEFAULT_BRANCH=main"
set "DEFAULT_FOLDER="
for /f "delims=" %%R in ('git -C "%SCRIPT_ROOT%" remote get-url origin 2^>nul') do set "MAIN_REPO=%%R"
for /f "delims=" %%B in ('git -C "%SCRIPT_ROOT%" branch --show-current 2^>nul') do set "DEFAULT_BRANCH=%%B"
for %%I in ("%SCRIPT_ROOT%") do set "DEFAULT_FOLDER=%%~nxI"

if "%MAIN_REPO%"=="" (
    echo [ERRO] Nao encontrei o remote origin em "%SCRIPT_ROOT%".
    pause
    exit /b 1
)

:MENU
cls
echo =======================================
echo       Under Deck - GitHub Helper
echo =======================================
echo.
echo Repositorio: %MAIN_REPO%
echo Branch padrao: %DEFAULT_BRANCH%
if exist "%SCRIPT_ROOT%\.gitmodules" (echo Modo: repositorio com submodules) else (echo Modo: repositorio unico / workspace PNPM)
echo.
echo [1] Push do repositorio atual
echo [2] Clonar tudo ^(inclui submodules quando existirem^)
echo [3] Pull seguro do repositorio atual
echo [4] Ver status
echo [5] Sair
echo.
set /p "ACTION=Escolha uma opcao: "
if "%ACTION%"=="1" goto PUSH
if "%ACTION%"=="2" goto CLONE
if "%ACTION%"=="3" goto PULL
if "%ACTION%"=="4" goto STATUS
if "%ACTION%"=="5" exit /b 0
goto MENU

:PUSH
call :ENSURE_CURRENT_REPO
if errorlevel 1 (pause & goto MENU)
cd /d "%CURRENT_ROOT%"
call :ENSURE_INDEX_UNLOCKED
if errorlevel 1 (pause & goto MENU)
set "COMMIT_MESSAGE="
set /p "COMMIT_MESSAGE=Mensagem do commit (Enter para usar a versao): "
if not defined COMMIT_MESSAGE (
    set "VERSION="
    for /f "tokens=2 delims=:, " %%V in ('findstr /i "version" package.json 2^>nul') do set "VERSION=%%~V"
    if defined VERSION (set "COMMIT_MESSAGE=release %VERSION%") else set "COMMIT_MESSAGE=update"
)
echo.
echo Salvando: %COMMIT_MESSAGE%
git add -A
if errorlevel 1 goto GIT_ERROR
git diff --cached --quiet
set "GIT_DIFF_STATUS=!ERRORLEVEL!"
if "!GIT_DIFF_STATUS!"=="1" (
    git commit -m "%COMMIT_MESSAGE%"
    if errorlevel 1 goto GIT_ERROR
) else if "!GIT_DIFF_STATUS!"=="0" (
    echo Nenhuma alteracao para commitar.
) else (
    goto GIT_ERROR
)
set "CURRENT_BRANCH="
for /f "delims=" %%B in ('git branch --show-current') do set "CURRENT_BRANCH=%%B"
if not defined CURRENT_BRANCH set "CURRENT_BRANCH=%DEFAULT_BRANCH%"
git push -u origin "%CURRENT_BRANCH%"
if errorlevel 1 goto GIT_ERROR
echo.
echo [OK] Push concluido.
pause
goto MENU

:CLONE
set "TARGET_FOLDER="
set /p "TARGET_FOLDER=Pasta de destino (Enter para %DEFAULT_FOLDER%): "
if not defined TARGET_FOLDER set "TARGET_FOLDER=%DEFAULT_FOLDER%"
if exist "%TARGET_FOLDER%" (
    echo [ERRO] A pasta "%TARGET_FOLDER%" ja existe.
    pause
    goto MENU
)
echo.
git clone --recurse-submodules "%MAIN_REPO%" "%TARGET_FOLDER%"
if errorlevel 1 goto GIT_ERROR
echo.
echo [OK] Clone concluido.
pause
goto MENU

:PULL
call :ENSURE_CURRENT_REPO
if errorlevel 1 (pause & goto MENU)
cd /d "%CURRENT_ROOT%"
echo Atualizando sem descartar alteracoes locais...
git pull --ff-only
if errorlevel 1 (
    echo [ERRO] Pull nao aplicado. Faca commit, stash ou resolva divergencias.
    pause
    goto MENU
)
if exist ".gitmodules" (
    git submodule sync --recursive
    git submodule update --init --recursive
    if errorlevel 1 goto GIT_ERROR
)
echo.
echo [OK] Pull concluido.
pause
goto MENU

:STATUS
call :ENSURE_CURRENT_REPO
if errorlevel 1 (pause & goto MENU)
cd /d "%CURRENT_ROOT%"
git status --short --branch
if exist ".gitmodules" git submodule status --recursive
echo.
pause
goto MENU

:GIT_ERROR
echo.
echo [ERRO] O Git retornou erro. Nenhuma limpeza ou reset forcado foi executado.
pause
goto MENU

:ENSURE_CURRENT_REPO
set "CURRENT_ROOT="
for /f "delims=" %%G in ('git rev-parse --show-toplevel 2^>nul') do set "CURRENT_ROOT=%%G"
if not defined CURRENT_ROOT (
    echo [ERRO] A pasta atual nao pertence a um repositorio Git.
    exit /b 1
)
exit /b 0

:ENSURE_INDEX_UNLOCKED
set "INDEX_LOCK=%CURRENT_ROOT%\.git\index.lock"
if not exist "%INDEX_LOCK%" exit /b 0

set "BLOCKING_GIT="
for /f "delims=" %%P in ('powershell -NoProfile -Command "$busy=$false; foreach($p in Get-CimInstance Win32_Process){ if(($p.Name -in @('git.exe','git-lfs.exe')) -and $p.CommandLine -notmatch 'fsmonitor--daemon'){ $busy=$true; break } }; if($busy){ 'busy' }"') do set "BLOCKING_GIT=%%P"
if defined BLOCKING_GIT (
    echo [ERRO] Existe um processo Git ativo. O index.lock nao foi removido.
    exit /b 1
)

del /f /q "%INDEX_LOCK%" >nul 2>&1
if exist "%INDEX_LOCK%" (
    echo [ERRO] Nao foi possivel remover o index.lock obsoleto.
    exit /b 1
)
echo [AVISO] index.lock obsoleto removido com seguranca.
exit /b 0
