@echo off
chcp 936 >nul
setlocal
title 书页

rem 定位到项目根目录（本文件在根目录时即 %~dp0，在 scripts 下时为上一级）
set "ROOT=%~dp0"
if exist "%~dp0..\server.py" set "ROOT=%~dp0..\"

if not exist "%ROOT%server.py" (
  echo [错误] 找不到 server.py，请把本文件放在书页项目文件夹内。
  pause
  exit /b 1
)

echo.
echo   书页 · 教材溯源学习助手
echo   正在启动，稍候浏览器会自动打开...
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\launch_window.ps1"
if errorlevel 1 pause
