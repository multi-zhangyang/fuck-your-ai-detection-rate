@echo off
setlocal

cd /d "%~dp0"

set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

where python >nul 2>nul
if errorlevel 1 (
  echo [Fuck your AI detection rate] python was not found. Please install Python and add it to PATH.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [Fuck your AI detection rate] node was not found. Please install Node.js and add it to PATH.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [Fuck your AI detection rate] npm was not found. Please install Node.js and add it to PATH.
  pause
  exit /b 1
)

if not exist "app\package.json" (
  echo [Fuck your AI detection rate] app\package.json was not found. Please run this script from the project root.
  pause
  exit /b 1
)

if not exist "app\node_modules" (
  echo [Fuck your AI detection rate] app\node_modules was not found.
  echo Run these commands first:
  echo   npm --prefix app install
  pause
  exit /b 1
)

if not exist "logs" mkdir logs

python -c "import flask, docx, pypdf" >nul 2>nul
if errorlevel 1 (
  echo [Fuck your AI detection rate] Installing or repairing Python dependencies...
  python -m pip install -r requirements.txt
  if errorlevel 1 (
    echo [Fuck your AI detection rate] Python dependency installation failed.
    pause
    exit /b 1
  )
)

echo [Fuck your AI detection rate] Restarting backend on port 8765...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$connections = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue; if($connections){ $connections | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { try { Stop-Process -Id $_ -Force -ErrorAction Stop } catch {} } }; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'scripts\\web_app.py|scripts/web_app.py' } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }"
start "Fuck your AI detection rate Backend" cmd /k "cd /d %~dp0 && python scripts\web_app.py"

python scripts\web_health_check.py --backend-only --timeout 30 --default-report
if errorlevel 1 (
  echo [Fuck your AI detection rate] Backend did not become ready in time. Check the Backend window.
  pause
  exit /b 1
)

echo [Fuck your AI detection rate] Restarting frontend on port 1420...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$connections = Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue; if($connections){ $connections | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { try { Stop-Process -Id $_ -Force -ErrorAction Stop } catch {} } }"
start "Fuck your AI detection rate Frontend" cmd /k "cd /d %~dp0app && npm run dev:web"

python scripts\web_health_check.py --frontend-only --timeout 45 --default-report
if errorlevel 1 (
  echo [Fuck your AI detection rate] Frontend did not become ready in time. Check the Frontend window.
  pause
  exit /b 1
)

echo [Fuck your AI detection rate] Web UI is ready at http://127.0.0.1:1420

if not "%FYADR_NO_BROWSER%"=="1" (
  start "" "http://127.0.0.1:1420"
)

exit /b 0
