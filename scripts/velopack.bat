@echo off
setlocal EnableExtensions EnableDelayedExpansion

:: Recebe, opcionalmente, "local" ou "local-test".
:: Sem argumento, prepara e publica uma release no GitHub.
cd /d "%~dp0..\apps\desktop\electron"

set "MAIN_EXE=Under Deck.exe"
set "GH_OWNER=UNDER192103"
set "GH_REPO=underdeck3"
set "MODE=%~1"
set "OUTPUT_DIR=build\velopack"
set "RUN_INSTALLER=0"

if /I "%MODE%"=="local" (
    set "OUTPUT_DIR=build\velopack-local"
    goto pack
)

if /I "%MODE%"=="local-test" (
    set "OUTPUT_DIR=build\velopack-local"
    set "RUN_INSTALLER=1"
    goto pack
)

if not "%MODE%"=="" (
    echo [ERRO] Modo invalido: %MODE%
    echo Use sem argumento, local ou local-test.
    exit /b 1
)

:: O fluxo de publicacao exige token; o fluxo local nao usa .env nem GitHub.
if not exist ".env" (
    echo [ERRO] Arquivo .env nao encontrado na pasta atual.
    exit /b 1
)

for /f "tokens=1,2 delims==" %%A in (.env) do (
    if "%%A"=="GH_TOKEN" set "GH_TOKEN=%%B"
)

set "GH_TOKEN=%GH_TOKEN: =%"

if "%GH_TOKEN%"=="" (
    echo [ERRO] GH_TOKEN nao definido dentro do arquivo .env
    exit /b 1
)

echo [OK] Token carregado com sucesso.

:: Deltas dependem de pacotes antigos, portanto isto so ocorre ao publicar.
echo [STEP 1/4] Verificando versoes anteriores no GitHub...
call vpk download github --repoUrl "https://github.com/%GH_OWNER%/%GH_REPO%" --token "%GH_TOKEN%" --outputDir "%OUTPUT_DIR%"
if %errorlevel% neq 0 (
    echo [AVISO] Nao foram encontradas releases anteriores. Criando pacote completo.
)

:pack
for /f "tokens=2 delims=:, " %%A in ('findstr /i "version" package.json') do (
    set "APP_VERSION=%%~A"
)

if "%APP_VERSION%"=="" (
    echo [ERRO] Nao foi possivel identificar a versao no package.json.
    exit /b 1
)

if /I "%MODE%"=="" (
    echo [STEP 2/4] Preparando arquivos com electron-builder...
) else (
    echo [STEP 1/2] Preparando arquivos com electron-builder...
)

call npx electron-builder --dir
if %errorlevel% neq 0 (
    echo [ERRO] Falha no electron-builder.
    exit /b %errorlevel%
)

if /I "%MODE%"=="" (
    echo [STEP 3/4] Criando instalador Velopack %APP_VERSION%...
) else (
    echo [STEP 2/2] Criando instalador Velopack local %APP_VERSION%...
)

call vpk pack --packId "underdeck" --packVersion "%APP_VERSION%" --packDir "build\win-unpacked" --mainExe "%MAIN_EXE%" --packTitle "Under Deck" --outputDir "%OUTPUT_DIR%" --icon "assets\img\icon.ico" --splashImage "assets\startup-setup.gif" --framework vcredist140-x86,vcredist140-x64
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao empacotar com Velopack.
    exit /b %errorlevel%
)

if /I not "%MODE%"=="" goto local_success

echo [STEP 4/4] Fazendo upload para o GitHub Releases...
call vpk upload github --repoUrl "https://github.com/%GH_OWNER%/%GH_REPO%" --token "%GH_TOKEN%" --outputDir "%OUTPUT_DIR%" --tag "v%APP_VERSION%" --releaseName "Under Deck %APP_VERSION%" --publish
if %errorlevel% neq 0 (
    echo [ERRO] Falha no upload para o GitHub.
    exit /b %errorlevel%
)

if defined UNDERDECK_RELEASE_NOTES (
    where gh >nul 2>nul
    if errorlevel 1 (
        echo [AVISO] GitHub CLI ^(gh^) nao encontrado; notas da release nao foram aplicadas.
    ) else (
        echo [INFO] Aplicando notas personalizadas na release...
        gh release edit "v%APP_VERSION%" --repo "%GH_OWNER%/%GH_REPO%" --notes "%UNDERDECK_RELEASE_NOTES%"
        if errorlevel 1 echo [AVISO] Nao foi possivel aplicar as notas personalizadas.
    )
)

echo [SUCESSO] Release publicada. Arquivos em %CD%\%OUTPUT_DIR%
exit /b 0

:local_success
echo [SUCESSO] Pacote local criado sem contato com o GitHub.
echo [INFO] Arquivos para teste: %CD%\%OUTPUT_DIR%

if not "%RUN_INSTALLER%"=="1" exit /b 0

call :open_setup "%OUTPUT_DIR%"
exit /b %errorlevel%

:open_setup
set "SETUP_EXE="
for /f "delims=" %%F in ('dir /b /a-d "%~1\*-Setup.exe" 2^>nul') do (
    if not defined SETUP_EXE set "SETUP_EXE=%%F"
)

if not defined SETUP_EXE (
    echo [ERRO] O instalador *-Setup.exe nao foi encontrado em %~1.
    exit /b 1
)

echo [INFO] Abrindo instalador local: !SETUP_EXE!
start "" "%CD%\%~1\!SETUP_EXE!"
exit /b 0
