@echo off
setlocal
cd /d "%~dp0mednexus"
title MedNexus
where py >nul 2>nul
if not errorlevel 1 (
  py -3 server.py --open
  goto end
)
where python >nul 2>nul
if not errorlevel 1 (
  python server.py --open
  goto end
)
echo Python 3.10 or later is required. Install it from https://www.python.org/downloads/
:end
if errorlevel 1 pause
endlocal
