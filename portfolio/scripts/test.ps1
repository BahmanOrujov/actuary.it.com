# Run backend tests (no live API calls). Usage: .\scripts\test.ps1
$Root = Split-Path -Parent $PSScriptRoot
$Venv = if ($env:PA_VENV) { $env:PA_VENV } else { Join-Path $env:USERPROFILE ".portfel-analizi\venv" }
Push-Location (Join-Path $Root "backend")
try { & (Join-Path $Venv "Scripts\python.exe") -m pytest -q -p no:warnings @args } finally { Pop-Location }
