@echo off
rem Двоен клик: пуска играта на http://localhost:8940/ и я отваря в браузъра
chcp 65001 >nul
cd /d "%~dp0"
start "" http://localhost:8940/
node tools\serve.mjs
