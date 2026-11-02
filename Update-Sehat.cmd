@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\Update.ps1"
set "SEHAT_EXIT=%errorlevel%"
if not "%SEHAT_EXIT%"=="0" echo Update failed. Your database volume has not been removed. Read the message above.
pause
exit /b %SEHAT_EXIT%
