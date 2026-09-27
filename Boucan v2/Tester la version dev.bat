@echo off
rem BOUCAN - lance la branche dev dans Docker pour la tester (http://localhost:3002 + lien public),
rem a cote du jeu en ligne, sans y toucher. Voir docs\DEPLOYMENT.md.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\test-dev.ps1" %*
echo.
pause
