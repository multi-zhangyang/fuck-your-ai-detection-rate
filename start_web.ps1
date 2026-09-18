param(
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppRoot = Join-Path $RepoRoot "app"
$LogRoot = Join-Path $RepoRoot "logs"
$BackendUrl = "http://127.0.0.1:8765/api/ping"
$FrontendUrl = "http://127.0.0.1:1420"

$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

function Get-RequiredCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$InstallHint
    )

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) {
        throw "$Name is not installed. $InstallHint"
    }
    return $command.Source
}

function Stop-PortListener {
    param([Parameter(Mandatory = $true)][int]$Port)

    $processIds = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($processId in $processIds) {
        if ($processId -and $processId -ne $PID) {
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
    }

    $deadline = [DateTime]::UtcNow.AddSeconds(5)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (-not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) {
            return
        }
        Start-Sleep -Milliseconds 200
    }
    throw "Port $Port is still in use."
}

function Wait-HttpReady {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][int]$TimeoutSeconds
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return $true
            }
        }
        catch {
        }
        Start-Sleep -Milliseconds 300
    }
    return $false
}

try {
    $python = Get-RequiredCommand -Name "python" -InstallHint "Install Python 3.10 or later and add it to PATH."
    $null = Get-RequiredCommand -Name "node" -InstallHint "Install Node.js 18 or later and add it to PATH."
    $npm = Get-RequiredCommand -Name "npm.cmd" -InstallHint "Install Node.js 18 or later and add it to PATH."

    if (-not (Test-Path -LiteralPath (Join-Path $AppRoot "package.json") -PathType Leaf)) {
        throw "app\package.json was not found."
    }

    if (-not (Test-Path -LiteralPath (Join-Path $AppRoot "node_modules") -PathType Container)) {
        & $npm --prefix $AppRoot ci
        if ($LASTEXITCODE -ne 0) {
            throw "Frontend dependency installation failed."
        }
    }

    & $python -c "import flask, httpx, lxml" 2>$null
    if ($LASTEXITCODE -ne 0) {
        & $python -m pip install -r (Join-Path $RepoRoot "requirements.txt")
        if ($LASTEXITCODE -ne 0) {
            throw "Python dependency installation failed."
        }
    }

    New-Item -ItemType Directory -Path $LogRoot -Force | Out-Null
    Stop-PortListener -Port 8765
    Stop-PortListener -Port 1420

    $backendProcess = Start-Process `
        -FilePath $python `
        -ArgumentList @("scripts\web_app.py") `
        -WorkingDirectory $RepoRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $LogRoot "backend.stdout.log") `
        -RedirectStandardError (Join-Path $LogRoot "backend.stderr.log") `
        -PassThru

    if (-not (Wait-HttpReady -Url $BackendUrl -TimeoutSeconds 30)) {
        throw "Backend startup failed. See logs\backend.stderr.log."
    }

    $frontendProcess = Start-Process `
        -FilePath $npm `
        -ArgumentList @("run", "dev:web", "--", "--host", "127.0.0.1", "--port", "1420", "--strictPort") `
        -WorkingDirectory $AppRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $LogRoot "frontend.stdout.log") `
        -RedirectStandardError (Join-Path $LogRoot "frontend.stderr.log") `
        -PassThru

    if (-not (Wait-HttpReady -Url $FrontendUrl -TimeoutSeconds 45)) {
        throw "Frontend startup failed. See logs\frontend.stderr.log."
    }

    Write-Host "FYADR is ready at $FrontendUrl"
    if (-not $NoBrowser) {
        Start-Process $FrontendUrl
    }
}
catch {
    Stop-PortListener -Port 1420
    Stop-PortListener -Port 8765
    Write-Error $_
    exit 1
}
