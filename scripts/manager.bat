@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0.."

:main
cls
echo ==========================================
echo UnderDeck Manager
echo ==========================================
echo [1] Install
echo [2] Compile
echo [3] Start All
echo [4] Package Build
echo [5] Exit
echo.
set /p main_choice=Choose an option: 

if "%main_choice%"=="1" goto install_menu
if "%main_choice%"=="2" goto compile_menu
if "%main_choice%"=="3" goto start_all
if "%main_choice%"=="4" goto package_build
if "%main_choice%"=="5" goto end
goto main

:install_menu
cls
echo ==========================================
echo Install Menu
echo ==========================================
echo [1] Install All
echo [2] Install Desktop All
echo [3] Install Desktop Client
echo [4] Install Electron
echo [5] Install Remote
echo [6] Back
echo.
set /p install_choice=Choose an option: 

if "%install_choice%"=="1" goto install_all
if "%install_choice%"=="2" goto install_desktop_all
if "%install_choice%"=="3" goto install_desktop_client
if "%install_choice%"=="4" goto install_electron
if "%install_choice%"=="5" goto install_remote
if "%install_choice%"=="6" goto main
goto install_menu

:compile_menu
cls
echo ==========================================
echo Compile Menu
echo ==========================================
echo [1] Compile All
echo [2] Compile Desktop All
echo [3] Build Desktop Client
echo [4] Compile Electron
echo [5] Build Remote
echo [6] Back
echo.
set /p compile_choice=Choose an option: 

if "%compile_choice%"=="1" goto compile_all
if "%compile_choice%"=="2" goto compile_desktop_all
if "%compile_choice%"=="3" goto build_desktop_client
if "%compile_choice%"=="4" goto compile_electron
if "%compile_choice%"=="5" goto build_remote
if "%compile_choice%"=="6" goto main
goto compile_menu

:install_all
call :run "pnpm run install:all" "."
goto pause_and_main

:install_desktop_all
call :run "pnpm install --filter underdeck-desktop-client --filter underdeck" "."
goto pause_and_main

:install_desktop_client
call :run "pnpm install --filter underdeck-desktop-client" "."
goto pause_and_main

:install_electron
call :run "pnpm install --filter underdeck" "."
goto pause_and_main

:install_remote
call :run "pnpm install --filter underdeck-remote" "."
goto pause_and_main

:compile_all
call :run "pnpm run build:all" "."
goto pause_and_main

:compile_desktop_all
call :run "pnpm run build:desktop" "."
goto pause_and_main

:build_desktop_client
call :run "pnpm run build:desktop:client" "."
goto pause_and_main

:compile_electron
call :run "pnpm run build:desktop:electron" "."
goto pause_and_main

:build_remote
call :run "pnpm run build:remote" "."
goto pause_and_main

:start_all
call "%~dp0start-all.bat"
goto end

:package_build
call "%~dp0build.bat"
goto pause_and_main

:run
set "cmd=%~1"
set "dir=%~2"
echo.
echo Running in %dir%:
echo   %cmd%
pushd %dir%
call %cmd%
set "result=%errorlevel%"
popd
exit /b %result%

:pause_and_main
echo.
pause
goto main

:end
exit /b 0
