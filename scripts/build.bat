@echo off
setlocal EnableExtensions DisableDelayedExpansion

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
call :ask_release_notes
echo.
echo Running: pnpm run velopack
call pnpm run velopack
goto end

:build_prod
call :ask_release_notes
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

:ask_release_notes
echo.
echo O texto abaixo sera usado como notas da release no GitHub.
echo Deixe vazio para manter as notas automaticas do GitHub.
set /p "UNDERDECK_RELEASE_NOTES=Notas da release (uma linha): "
exit /b 0

:end
if errorlevel 1 (
  echo.
  echo O processo falhou.
  exit /b %errorlevel%
)

echo.
echo Processo concluido com sucesso.
exit /b 0
