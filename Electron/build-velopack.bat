@echo off
setlocal enabledelayedexpansion

:: Navega para a pasta onde o script está
cd /d "%~dp0"

:: --- CONFIGURAÇÕES ---
set "MAIN_EXE=Under Deck.exe"
set "GH_OWNER=UNDER192103"
set "GH_REPO=underdeck3"

:: --- CARREGAR TOKEN DO .ENV (AO LADO DO .BAT) ---
if not exist ".env" (
    echo [ERRO] Arquivo .env nao encontrado na pasta atual.
    exit /b 1
)

:: Procura pela linha que começa com GH_TOKEN no .env
for /f "tokens=1,2 delims==" %%A in (.env) do (
    if "%%A"=="GH_TOKEN" set "GH_TOKEN=%%B"
)

:: Remove espaços em branco extras, se houver
set "GH_TOKEN=%GH_TOKEN: =%"

if "%GH_TOKEN%"=="" (
    echo [ERRO] GH_TOKEN nao definido dentro do arquivo .env
    exit /b 1
)

echo [OK] Token carregado com sucesso.
:: Resto do seu script...

:: --- PEGAR VERSÃO DO PACKAGE.JSON ---
:: Extrai a versão do package.json para a variável APP_VERSION
for /f "tokens=2 delims=:, " %%a in ('findstr /i "version" package.json') do (
    set "APP_VERSION=%%~a"
)
echo [INFO] Iniciando Build da versao: %APP_VERSION%

:: --- 1. PREPARAR ARQUIVOS (ELECTRON-BUILDER) ---
echo [STEP 1] Preparando arquivos com electron-builder...
call npx electron-builder --dir
if %errorlevel% neq 0 (
    echo [ERRO] Falha no electron-builder.
    exit /b %errorlevel%
)

:: --- 2. DOWNLOAD DE RELEASES ANTIGOS (PARA DELTAS) ---
echo [STEP 2] Verificando versoes anteriores no GitHub...
call vpk download github --repoUrl "https://github.com/%GH_OWNER%/%GH_REPO%" --token "%GH_TOKEN%" --outputDir "build\velopack"
if %errorlevel% neq 0 (
    echo [AVISO] Nao foram encontradas releases anteriores. Criando pacote completo.
)

:: --- 3. CRIAR PACOTE VELOPACK (PACK) ---
echo [STEP 3] Criando instalador Velopack (Splash Screen)...
:: Usamos aspas duplas em volta das variaveis com caminhos ou espacos
call vpk pack --packId "underdeck" --packVersion "%APP_VERSION%" --packDir "build\win-unpacked" --mainExe "%MAIN_EXE%" --packTitle "Under Deck" --outputDir "build\velopack" --icon "assets\img\icon.ico" --splashImage "assets\startup-setup.gif"
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao empacotar com Velopack.
    exit /b %errorlevel%
)

:: --- 4. UPLOAD PARA GITHUB ---
echo [STEP 4] Fazendo upload para o GitHub Releases...
call vpk upload github --repoUrl "https://github.com/%GH_OWNER%/%GH_REPO%" --token "%GH_TOKEN%" --outputDir "build\velopack" --tag "v%APP_VERSION%" --releaseName "Under Deck %APP_VERSION%" --publish
if %errorlevel% neq 0 (
    echo [ERRO] Falha no upload para o GitHub.
    exit /b %errorlevel%
)

echo [SUCESSO] Processo concluido! O instalador esta em build\velopack
pause
exit /b 0
