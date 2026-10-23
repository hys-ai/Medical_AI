@echo off
chcp 936 >nul
cd /d "%~dp0"
title 开放内网访问（7860）
echo.
echo   放行 7860 端口，让同一网络的电脑可以访问医枢
echo   需要管理员权限，UAC 弹窗请点「是」
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\open_lan_firewall.ps1"
