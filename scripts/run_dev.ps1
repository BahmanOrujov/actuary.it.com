# Start backend (8000), worker and Vite dev server (5173) together. Ctrl+C stops all.
# Usage:  powershell -ExecutionPolicy Bypass -File ".\scripts\run_dev.ps1"
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Venv = if ($env:PA_VENV) { $env:PA_VENV } else { Join-Path $env:USERPROFILE ".portfel-analizi\venv" }
$Py = Join-Path $Venv "Scripts\python.exe"
if (-not (Test-Path $Py)) { throw "Python mühiti yoxdur. Əvvəlcə .\scripts\setup.ps1 işə salın." }
$Backend = Join-Path $Root "backend"

$procs = @()
$procs += Start-Process -FilePath $Py -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000" `
    -WorkingDirectory $Backend -PassThru -NoNewWindow
$procs += Start-Process -FilePath $Py -ArgumentList "-m", "jobs.worker" -WorkingDirectory $Backend -PassThru -NoNewWindow
$procs += Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev" -WorkingDirectory (Join-Path $Root "frontend") -PassThru -NoNewWindow

Write-Host ""
Write-Host "Portfel Analizi işləyir:  http://localhost:5173   (API: http://127.0.0.1:8000)"
Write-Host "Dayandırmaq üçün Ctrl+C"
try {
    while ($true) {
        Start-Sleep -Seconds 2
        foreach ($p in $procs) { if ($p.HasExited) { throw "Proses dayandı (PID $($p.Id))" } }
    }
} finally {
    foreach ($p in $procs) { if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } }
    Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*vite*" -and $_.CommandLine -like "*Portfoilo*" } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}
