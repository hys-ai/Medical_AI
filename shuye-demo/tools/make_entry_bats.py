# -*- coding: utf-8 -*-
"""生成启动相关的批处理入口（GBK 编码，中文 Windows 控制台可正常显示）。

生成：
  启动书页.bat            程序文件夹内的一键启动（窗口版）
scripts/启动.bat          同上的快捷入口（批处理放到 scripts 里）
scripts/停止.bat          停止服务
用法：python tools/make_entry_bats.py
"""

HEAD = r"""@echo off
chcp 936 >nul
setlocal
"""

WINDOW_BODY = r"""
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
"""

SILENT_BODY = r"""
set "ROOT=%~dp0"
if exist "%~dp0..\server.py" set "ROOT=%~dp0..\"

if not exist "%ROOT%server.py" (
  echo [错误] 找不到 server.py，请把本文件放在书页项目文件夹内。
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%ROOT%scripts\launch_silent.ps1"
if errorlevel 1 pause
"""

STOP_BODY = r"""
set "ROOT=%~dp0"
if exist "%~dp0..\server.py" set "ROOT=%~dp0..\"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\stop.ps1"
pause
"""


def write(path, body, title):
    text = HEAD + 'title ' + title + "\r\n" + body
    with open(path, "wb") as f:
        f.write(text.replace("\n", "\r\n").encode("gbk", errors="replace"))
    print("written:", path)


if __name__ == "__main__":
    write("启动书页.bat", WINDOW_BODY, "书页")
    write("scripts\\启动.bat", SILENT_BODY, "书页")
    write("scripts\\停止.bat", STOP_BODY, "书页 - 停止")
