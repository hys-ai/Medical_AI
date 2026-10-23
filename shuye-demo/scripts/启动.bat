@echo off
chcp 936 >nul
setlocal
title 书页

set "ROOT=%~dp0"
if exist "%~dp0..\server.py" set "ROOT=%~dp0..\"

if not exist "%ROOT%server.py" (
  echo [错误] 找不到 server.py，请把本文件放在书页项目文件夹内。
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%ROOT%scripts\launch_silent.ps1"
if errorlevel 1 pause
