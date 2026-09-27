@echo off
rem BOUCAN - arrete la version de test (branche dev). Le jeu en ligne n est pas touche.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\test-dev.ps1" -Stop %*
echo.
pause
