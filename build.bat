@echo off
setlocal

cd /d "%~dp0"

echo ==========================================
echo UnderDeck Velopack Build Menu
echo ==========================================
echo [1] Build and publish Velopack release (dist)
echo [2] Build and publish Velopack release (dist:prod)
echo.
set /p choice=Type 1 or 2 and press Enter: 

if "%choice%"=="1" goto build_dist
if "%choice%"=="2" goto build_prod

echo Invalid option. Use 1 or 2.
exit /b 1

:build_dist
echo.
echo Running: npm --prefix apps\desktop\electron run dist
call npm --prefix apps\desktop\electron run dist
goto end

:build_prod
echo.
echo Running: npm --prefix apps\desktop\electron run dist:prod
call npm --prefix apps\desktop\electron run dist:prod
goto end

:end
if errorlevel 1 (
  echo.
  echo Build failed.
  exit /b %errorlevel%
)

echo.
echo Build finished successfully.
exit /b 0
