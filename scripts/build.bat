@echo off
setlocal

cd /d "%~dp0.."

echo ==========================================
echo Under Deck - Velopack
echo ==========================================
echo [1] Criar e publicar release no GitHub
echo [2] Criar e publicar release de producao no GitHub
echo [3] Criar pacote local (sem GitHub)
echo [4] Criar pacote local e abrir instalador para teste
echo.
set /p choice=Escolha uma opcao: 

if "%choice%"=="1" goto build_dist
if "%choice%"=="2" goto build_prod
if "%choice%"=="3" goto build_local
if "%choice%"=="4" goto build_local_test

echo Opcao invalida. Use 1, 2, 3 ou 4.
exit /b 1

:build_dist
echo.
echo Running: pnpm run velopack
call pnpm run velopack
goto end

:build_prod
echo.
echo Running: pnpm run velopack:prod
call pnpm run velopack:prod
goto end

:build_local
echo.
echo Executando: pnpm run velopack:local
call pnpm run velopack:local
goto end

:build_local_test
echo.
echo Executando: pnpm run velopack:local:test
call pnpm run velopack:local:test
goto end

:end
if errorlevel 1 (
  echo.
  echo O processo falhou.
  exit /b %errorlevel%
)

echo.
echo Processo concluido com sucesso.
exit /b 0
