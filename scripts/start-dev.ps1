param(
  [switch]$SkipInstall,
  [switch]$Reseed,
  [switch]$SkipImport
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

Write-Host "Starting Tabula Orbis local stack..." -ForegroundColor Cyan

function Resolve-DockerCommand {
  $dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
  if ($dockerCommand) {
    return $dockerCommand.Source
  }

  $dockerDesktopPath = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
  if (Test-Path $dockerDesktopPath) {
    return $dockerDesktopPath
  }

  return $null
}

$docker = Resolve-DockerCommand
if (-not $docker) {
  throw "Docker is required, but docker.exe was not found on PATH or in the standard Docker Desktop install path. Start Docker Desktop or add Docker to PATH, then run this script again."
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
& $docker compose up -d db

Write-Host "Running database migrations..." -ForegroundColor Cyan
& $python -m alembic -c server\alembic.ini upgrade head

if ($SkipImport) {
  Write-Host "-SkipImport is no longer needed; KMZ import is skipped by default." -ForegroundColor Yellow
}

if ($Reseed) {
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
