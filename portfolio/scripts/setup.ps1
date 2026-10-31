# One-time setup: Python venv (outside OneDrive), backend deps, frontend deps, .env
# Usage:  powershell -ExecutionPolicy Bypass -File ".\scripts\setup.ps1"
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Venv = if ($env:PA_VENV) { $env:PA_VENV } else { Join-Path $env:USERPROFILE ".portfel-analizi\venv" }

Write-Host "Layihə: $Root"
Write-Host "Python mühiti: $Venv"

if (-not (Test-Path (Join-Path $Venv "Scripts\python.exe"))) {
    & py -3.11 -m venv "$Venv"
    if ($LASTEXITCODE -ne 0) { throw "Python 3.11 tapılmadı. python.org-dan Python 3.11+ quraşdırın." }
}
& "$Venv\Scripts\python.exe" -m pip install --upgrade pip -q
& "$Venv\Scripts\python.exe" -m pip install -q -r (Join-Path $Root "backend\requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "pip install uğursuz oldu" }

$EnvFile = Join-Path $Root ".env"
if (-not (Test-Path $EnvFile)) {
    $secret = -join ((48..57) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
    (Get-Content (Join-Path $Root ".env.example") -Encoding utf8) -replace "change-me-to-a-long-random-string", $secret |
        Set-Content $EnvFile -Encoding utf8
    Write-Host ".env yaradıldı"
}

Push-Location (Join-Path $Root "frontend")
try {
    npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm install uğursuz oldu" }
    npm run build
} finally { Pop-Location }

git -C "$Root" config core.longpaths true
Write-Host "Hazırdır. İşə salmaq üçün: .\scripts\run_dev.ps1 (inkişaf) və ya .\scripts\run.ps1 (tək port)"
