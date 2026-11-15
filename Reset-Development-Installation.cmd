@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\Reset-Development.ps1"
set "SEHAT_EXIT=%errorlevel%"
if not "%SEHAT_EXIT%"=="0" echo Reset stopped. Read the message above.
pause
exit /b %SEHAT_EXIT%
