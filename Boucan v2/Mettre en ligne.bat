@echo off
rem BOUCAN - met en ligne la version de ce dossier dans Docker (voir docs\DEPLOYMENT.md).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\deploy.ps1" %*
echo.
pause
