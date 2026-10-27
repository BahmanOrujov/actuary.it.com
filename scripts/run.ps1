# Single-port mode: serves the built frontend from FastAPI on http://localhost:8000 plus the worker.
# Usage:  powershell -ExecutionPolicy Bypass -File ".\scripts\run.ps1"
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Venv = if ($env:PA_VENV) { $env:PA_VENV } else { Join-Path $env:USERPROFILE ".portfel-analizi\venv" }
$Py = Join-Path $Venv "Scripts\python.exe"
if (-not (Test-Path $Py)) { throw "Python mühiti yoxdur. Əvvəlcə .\scripts\setup.ps1 işə salın." }
if (-not (Test-Path (Join-Path $Root "frontend\dist\index.html"))) {
    Push-Location (Join-Path $Root "frontend"); try { npm run build } finally { Pop-Location }
}
$Backend = Join-Path $Root "backend"
$api = Start-Process -FilePath $Py -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000" `
    -WorkingDirectory $Backend -PassThru -NoNewWindow
$worker = Start-Process -FilePath $Py -ArgumentList "-m", "jobs.worker" -WorkingDirectory $Backend -PassThru -NoNewWindow
Write-Host ""
Write-Host "Portfel Analizi işləyir:  http://localhost:8000"
Write-Host "Dayandırmaq üçün Ctrl+C"
try {
    while (-not $api.HasExited -and -not $worker.HasExited) { Start-Sleep -Seconds 2 }
} finally {
    foreach ($p in @($api, $worker)) { if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } }
}
