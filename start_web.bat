@echo off
setlocal

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_web.ps1" %*
set "FYADR_EXIT_CODE=%ERRORLEVEL%"
if not "%FYADR_EXIT_CODE%"=="0" (
  echo.
  echo FYADR startup failed. Review the error above and the files in the logs directory.
  pause
)
exit /b %FYADR_EXIT_CODE%
