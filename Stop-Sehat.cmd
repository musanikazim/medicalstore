@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\Stop.ps1"
set "SEHAT_EXIT=%errorlevel%"
if not "%SEHAT_EXIT%"=="0" echo Operation failed. Read the message above before closing this window.
pause
exit /b %SEHAT_EXIT%
