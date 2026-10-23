@echo off
chcp 936 >nul
setlocal
title  È“≥ - Õ£÷π

set "ROOT=%~dp0"
if exist "%~dp0..\server.py" set "ROOT=%~dp0..\"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\stop.ps1"
pause
