param(
  [switch]$SkipInstall,
  [switch]$SkipImport
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

Write-Host "Starting Tabula Orbis local stack..." -ForegroundColor Cyan

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is required. Start Docker Desktop, then run this script again."
}

if (-not (Test-Path ".venv")) {
  Write-Host "Creating Python virtual environment..." -ForegroundColor Cyan
  python -m venv .venv
}

$python = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
  throw "Could not find .venv Python at $python"
}

if (-not $SkipInstall) {
  Write-Host "Installing backend dependencies..." -ForegroundColor Cyan
  & $python -m pip install -r server\requirements.txt
}

Write-Host "Starting PostGIS..." -ForegroundColor Cyan
docker compose up -d db

Write-Host "Running database migrations..." -ForegroundColor Cyan
& $python -m alembic -c server\alembic.ini upgrade head

if (-not $SkipImport) {
  Write-Host "Importing KMZ atlas into PostGIS..." -ForegroundColor Cyan
  & $python -m server.scripts.import_kmz
}

Write-Host "Starting FastAPI on http://localhost:8000 ..." -ForegroundColor Cyan
$api = Start-Process powershell -PassThru -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$root'; .\.venv\Scripts\python.exe -m uvicorn server.app.main:app --reload --port 8000"
)

Write-Host "Starting Vite on http://localhost:5173 ..." -ForegroundColor Cyan
Write-Host "Close the Vite terminal with Ctrl+C. Close the API terminal when done." -ForegroundColor Yellow
npm run dev

if ($api.HasExited) {
  Write-Host "FastAPI process exited." -ForegroundColor Yellow
}
