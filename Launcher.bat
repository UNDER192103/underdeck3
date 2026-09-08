@echo off
chcp 65001 >nul
title Under Deck Launcher

cd /d "%~dp0"

REM ============================================================
REM Verificar Node.js
REM ============================================================

where node >nul 2>&1

if errorlevel 1 (
    echo.
    echo [ERRO] O Node.js nao foi encontrado no PATH.
    echo.
    pause
    exit /b 1
)

REM ============================================================
REM Executar launcher
REM ============================================================

node "launcher.config.cjs"

set "LAUNCHER_EXIT_CODE=%ERRORLEVEL%"

REM ============================================================
REM Devolver o controle ao terminal atual
REM Código 10 retornado pelo launcher Node.js
REM ============================================================

if "%LAUNCHER_EXIT_CODE%"=="10" (
    cls

    echo ============================================
    echo      Terminal do Guild Builders Project
    echo ============================================
    echo.
    echo Projeto:
    echo %CD%
    echo.
    echo Digite "exit" para fechar o terminal.
    echo.

    cmd /k
    exit /b 0
)

REM ============================================================
REM Fechar completamente o terminal
REM Código 11 retornado pelo launcher Node.js
REM ============================================================

if "%LAUNCHER_EXIT_CODE%"=="11" (
    exit
)

exit /b %LAUNCHER_EXIT_CODE%
