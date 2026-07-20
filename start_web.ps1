param(
    [switch]$NoBrowser,
    [switch]$Install,
    [switch]$Help
)

# Native Windows launcher for FYADR. Keep the source ASCII-compatible so it
# also renders correctly in Windows PowerShell 5.1 without a UTF-8 BOM.

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendUrl = "http://127.0.0.1:8765/api/ping"
$FrontendUrl = "http://127.0.0.1:1420"
$LogsDir = Join-Path $RepoRoot "logs"
$BackendStdoutLog = Join-Path $LogsDir "web-backend.stdout.log"
$BackendStderrLog = Join-Path $LogsDir "web-backend.stderr.log"
$FrontendStdoutLog = Join-Path $LogsDir "web-frontend.stdout.log"
$FrontendStderrLog = Join-Path $LogsDir "web-frontend.stderr.log"
$script:BackendProcess = $null
$script:FrontendProcess = $null
$script:StartedBackend = $false
$script:StartedFrontend = $false

function Show-Usage {
    @"
FYADR - Windows launcher

Usage:
  .\start_web.ps1 [-NoBrowser] [-Install]
  .\start_web.ps1 -Help

Options:
  -NoBrowser  Do not open a browser after the services become healthy.
  -Install    Create .venv and install locked Python/npm dependencies first.
  -Help       Show this help and exit.

Safety:
  - Backend and frontend bind only to 127.0.0.1:8765 and 127.0.0.1:1420.
  - A healthy existing FYADR service is reused.
  - An unknown process occupying either port is never stopped.
  - On exit, only processes started by this launcher are stopped.
"@ | Write-Output
}

function Fail([string]$Message) {
    throw [System.InvalidOperationException]::new($Message)
}

function Get-ApplicationPath([string[]]$Names) {
    foreach ($name in $Names) {
        $command = Get-Command $name -CommandType Application -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($null -ne $command) {
            return $command.Source
        }
    }
    return $null
}

function Invoke-External([string]$FilePath, [string[]]$Arguments, [string]$FailureMessage) {
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        Fail "$FailureMessage (exit code $LASTEXITCODE)."
    }
}

function Invoke-LocalRequest([string]$Url, [int]$TimeoutMs = 1500) {
    $request = [System.Net.HttpWebRequest]::Create($Url)
    $request.Method = "GET"
    $request.Proxy = $null
    $request.Timeout = $TimeoutMs
    $request.ReadWriteTimeout = $TimeoutMs
    $request.UserAgent = "FYADR-launcher/1.0"
    $response = $null
    $reader = $null
    try {
        $response = [System.Net.HttpWebResponse]$request.GetResponse()
        $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
        return [pscustomobject]@{
            Status = [int]$response.StatusCode
            Body = $reader.ReadToEnd()
        }
    }
    finally {
        if ($null -ne $reader) {
            $reader.Dispose()
        }
        if ($null -ne $response) {
            $response.Dispose()
        }
    }
}

function Test-Backend {
    try {
        $response = Invoke-LocalRequest $BackendUrl
        $payload = $response.Body | ConvertFrom-Json
        return $response.Status -eq 200 -and
            $payload.ok -eq $true -and
            $payload.service -eq "fyadr-web"
    }
    catch {
        return $false
    }
}

function Test-Frontend {
    try {
        $response = Invoke-LocalRequest $FrontendUrl
        return $response.Status -eq 200 -and
            $response.Body.Contains("id=`"root`"") -and
            $response.Body.Contains("FYADR")
    }
    catch {
        return $false
    }
}

function Test-PortInUse([int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    $async = $null
    try {
        $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne(500, $false)) {
            return $false
        }
        $client.EndConnect($async)
        return $client.Connected
    }
    catch {
        return $false
    }
    finally {
        if ($null -ne $async) {
            $async.AsyncWaitHandle.Close()
        }
        $client.Close()
    }
}

function Wait-ForService(
    [scriptblock]$Probe,
    [System.Diagnostics.Process]$Process,
    [int]$TimeoutSeconds
) {
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (& $Probe) {
            return $true
        }
        if ($null -ne $Process) {
            $Process.Refresh()
            if ($Process.HasExited) {
                return $false
            }
        }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Show-LogTail([string[]]$Paths) {
    foreach ($path in $Paths) {
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            Write-Host "--- $path ---" -ForegroundColor DarkGray
            Get-Content -LiteralPath $path -Tail 30 -ErrorAction SilentlyContinue |
                ForEach-Object { Write-Host $_ }
        }
    }
}

function Stop-OwnedProcess([System.Diagnostics.Process]$Process, [string]$Label) {
    if ($null -eq $Process) {
        return
    }
    try {
        $Process.Refresh()
        if (-not $Process.HasExited) {
            Write-Host "[FYADR] Stopping launcher-owned $Label (PID $($Process.Id))..."
            Stop-Process -Id $Process.Id -ErrorAction SilentlyContinue
            if (-not $Process.WaitForExit(5000)) {
                Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
                [void]$Process.WaitForExit(5000)
            }
        }
    }
    catch {
        Write-Host "[FYADR] Could not fully stop ${Label}: $($_.Exception.Message)" -ForegroundColor Yellow
    }
    finally {
        $Process.Dispose()
    }
}

function Stop-LauncherProcesses {
    if ($script:StartedFrontend) {
        Stop-OwnedProcess $script:FrontendProcess "frontend"
        $script:StartedFrontend = $false
    }
    if ($script:StartedBackend) {
        Stop-OwnedProcess $script:BackendProcess "backend"
        $script:StartedBackend = $false
    }
}

function Start-Backend([string]$PythonBin) {
    $keys = @("WEB_HOST", "WEB_PORT", "WEB_STATIC_DIR")
    $previous = @{}
    foreach ($key in $keys) {
        $previous[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
    }
    try {
        [Environment]::SetEnvironmentVariable("WEB_HOST", "127.0.0.1", "Process")
        [Environment]::SetEnvironmentVariable("WEB_PORT", "8765", "Process")
        [Environment]::SetEnvironmentVariable("WEB_STATIC_DIR", "", "Process")
        return Start-Process `
            -FilePath $PythonBin `
            -ArgumentList @("scripts\web_app.py") `
            -WorkingDirectory $RepoRoot `
            -NoNewWindow `
            -PassThru `
            -RedirectStandardOutput $BackendStdoutLog `
            -RedirectStandardError $BackendStderrLog
    }
    finally {
        foreach ($key in $keys) {
            [Environment]::SetEnvironmentVariable($key, $previous[$key], "Process")
        }
    }
}

function Start-Frontend([string]$NodeBin) {
    return Start-Process `
        -FilePath $NodeBin `
        -ArgumentList @("node_modules\vite\bin\vite.js") `
        -WorkingDirectory (Join-Path $RepoRoot "app") `
        -NoNewWindow `
        -PassThru `
        -RedirectStandardOutput $FrontendStdoutLog `
        -RedirectStandardError $FrontendStderrLog
}

if ($Help) {
    Show-Usage
    exit 0
}

$exitCode = 0
try {
    Set-Location -LiteralPath $RepoRoot
    [Environment]::SetEnvironmentVariable("PYTHONUTF8", "1", "Process")
    [Environment]::SetEnvironmentVariable("PYTHONIOENCODING", "utf-8", "Process")

    $VenvDir = Join-Path $RepoRoot ".venv"
    $VenvPython = Join-Path $VenvDir "Scripts\python.exe"
    $SystemPython = Get-ApplicationPath @("python.exe", "python")
    $NeedsSystemPython = $Install -or -not (Test-Path -LiteralPath $VenvPython -PathType Leaf)
    if ($NeedsSystemPython -and [string]::IsNullOrWhiteSpace($SystemPython)) {
        Fail "Python was not found. Install Python 3.10+ and enable Add Python to PATH."
    }
    $NodeBin = Get-ApplicationPath @("node.exe", "node")
    if ([string]::IsNullOrWhiteSpace($NodeBin)) {
        Fail "Node.js was not found. Install Node.js 20.19+ or 22.12+."
    }
    $NpmBin = Get-ApplicationPath @("npm.cmd", "npm.exe", "npm")
    if ([string]::IsNullOrWhiteSpace($NpmBin)) {
        Fail "npm was not found. Install the npm bundled with Node.js."
    }

    Invoke-External $NodeBin @(
        "-e",
        "const [a,b]=process.versions.node.split('.').map(Number);process.exit((a===20&&b>=19)||(a===22&&b>=12)||a>22?0:1)"
    ) "Node.js 20.19+, 22.12+, or a newer major release is required"

    $RequirementsPath = Join-Path $RepoRoot "requirements.txt"
    $PackagePath = Join-Path $RepoRoot "app\package.json"
    $LockPath = Join-Path $RepoRoot "app\package-lock.json"
    if (-not (Test-Path -LiteralPath $RequirementsPath -PathType Leaf)) {
        Fail "requirements.txt is missing; run the launcher from a complete checkout."
    }
    if (-not (Test-Path -LiteralPath $PackagePath -PathType Leaf)) {
        Fail "app\package.json is missing; run the launcher from a complete checkout."
    }
    if (-not (Test-Path -LiteralPath $LockPath -PathType Leaf)) {
        Fail "app\package-lock.json is missing; locked installation is unavailable."
    }

    if ($Install) {
        Invoke-External $SystemPython @(
            "-c",
            "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)"
        ) "Python 3.10 or newer is required to create the virtual environment"
        Write-Host "[FYADR] Preparing the project virtual environment..."
        Invoke-External $SystemPython @("-m", "venv", $VenvDir) "Could not create .venv"
        if (-not (Test-Path -LiteralPath $VenvPython -PathType Leaf)) {
            Fail "The virtual environment did not create Scripts\python.exe."
        }
        Write-Host "[FYADR] Installing Python dependencies..."
        Invoke-External $VenvPython @("-m", "pip", "install", "--upgrade", "pip") "pip upgrade failed"
        Invoke-External $VenvPython @("-m", "pip", "install", "--require-hashes", "-r", $RequirementsPath) "Python dependency installation failed"
        Write-Host "[FYADR] Installing locked frontend dependencies..."
        Invoke-External $NpmBin @("--prefix", (Join-Path $RepoRoot "app"), "ci") "Frontend dependency installation failed"
    }

    $PythonBin = $SystemPython
    if (Test-Path -LiteralPath $VenvPython -PathType Leaf) {
        $PythonBin = $VenvPython
    }
    Invoke-External $PythonBin @(
        "-c",
        "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)"
    ) "The selected Python environment must use Python 3.10 or newer"
    Invoke-External $PythonBin @(
        "-c",
        "import flask, flask_compress, docx"
    ) "Python dependencies are incomplete; run .\start_web.ps1 -Install"

    $ViteEntry = Join-Path $RepoRoot "app\node_modules\vite\bin\vite.js"
    if (-not (Test-Path -LiteralPath $ViteEntry -PathType Leaf)) {
        Fail "Frontend dependencies are missing; run .\start_web.ps1 -Install."
    }
    New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null

    if (Test-Backend) {
        Write-Host "[FYADR] Reusing healthy backend: $BackendUrl"
    }
    else {
        if (Test-PortInUse 8765) {
            Fail "Port 8765 is occupied by an unknown or unhealthy process; it will not be stopped."
        }
        Write-Host "[FYADR] Starting backend..."
        $script:BackendProcess = Start-Backend $PythonBin
        $script:StartedBackend = $true
        if (-not (Wait-ForService { Test-Backend } $script:BackendProcess 30)) {
            Show-LogTail @($BackendStdoutLog, $BackendStderrLog)
            Fail "Backend did not become healthy."
        }
        Write-Host "[FYADR] Backend is healthy: $BackendUrl"
    }

    if (Test-Frontend) {
        Write-Host "[FYADR] Reusing healthy frontend: $FrontendUrl"
    }
    else {
        if (Test-PortInUse 1420) {
            Fail "Port 1420 is occupied by an unknown or unhealthy process; it will not be stopped."
        }
        Write-Host "[FYADR] Starting frontend..."
        $script:FrontendProcess = Start-Frontend $NodeBin
        $script:StartedFrontend = $true
        if (-not (Wait-ForService { Test-Frontend } $script:FrontendProcess 45)) {
            Show-LogTail @($FrontendStdoutLog, $FrontendStderrLog)
            Fail "Frontend did not become healthy."
        }
        Write-Host "[FYADR] Frontend is healthy: $FrontendUrl"
    }

    Write-Host ""
    Write-Host "[FYADR] Thesis AI reduction platform is ready: $FrontendUrl" -ForegroundColor Green
    if (-not $NoBrowser) {
        & $PythonBin (Join-Path $RepoRoot "scripts\open_web_ui.py") --url $FrontendUrl
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[FYADR] Browser auto-open failed; open $FrontendUrl manually." -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "[FYADR] Browser auto-open is disabled; open $FrontendUrl manually."
    }

    if (-not $script:StartedBackend -and -not $script:StartedFrontend) {
        Write-Host "[FYADR] Both services already existed; their lifecycle remains untouched."
    }
    else {
        Write-Host "[FYADR] Press Ctrl+C to stop only the services started by this launcher."
        while ($true) {
            if ($script:StartedBackend) {
                $script:BackendProcess.Refresh()
                if ($script:BackendProcess.HasExited) {
                    Fail "The launcher-owned backend exited; inspect $BackendStderrLog."
                }
            }
            if ($script:StartedFrontend) {
                $script:FrontendProcess.Refresh()
                if ($script:FrontendProcess.HasExited) {
                    Fail "The launcher-owned frontend exited; inspect $FrontendStderrLog."
                }
            }
            Start-Sleep -Seconds 1
        }
    }
}
catch {
    $exitCode = 1
    Write-Host "[FYADR] $($_.Exception.Message)" -ForegroundColor Red
}
finally {
    Stop-LauncherProcesses
}

exit $exitCode
