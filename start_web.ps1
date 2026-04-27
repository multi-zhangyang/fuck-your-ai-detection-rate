param(
    [switch]$NoBrowser
)

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BatchPath = Join-Path $RepoRoot "start_web.bat"

$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

if ($NoBrowser) {
    $env:FYADR_NO_BROWSER = "1"
} else {
    Remove-Item Env:FYADR_NO_BROWSER -ErrorAction SilentlyContinue
}

& $BatchPath
exit $LASTEXITCODE
