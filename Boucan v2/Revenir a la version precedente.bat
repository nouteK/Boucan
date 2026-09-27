@echo off
rem BOUCAN - remet en ligne la version d avant (celle gardee lors de la derniere mise en ligne).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\deploy.ps1" -Rollback %*
echo.
pause
