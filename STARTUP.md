# Startup

This app has two parts:

- React/Vite frontend at `http://localhost:5173`
- FastAPI backend at `http://localhost:8000`
- Postgres/PostGIS database in Docker

## One-Command Startup

From the repo root:

```powershell
npm run start:dev
```

The script will:

1. Create `.venv` if it does not exist.
2. Install backend Python dependencies.
3. Start PostGIS with Docker Compose.
4. Run database migrations.
5. Import `data/byzantine-atlas.kmz` into PostGIS.
6. Start the FastAPI backend in a new terminal.
7. Start the Vite frontend in the current terminal.

Open:

```text
http://localhost:5173
```

## Faster Restart

After the first successful startup, you can skip dependency install:

```powershell
.\scripts\start-dev.ps1 -SkipInstall
```

If you do not need to reload the KMZ into the database:

```powershell
.\scripts\start-dev.ps1 -SkipInstall -SkipImport
```

## Manual Startup

Use this if you want separate control over each service.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r server\requirements.txt
docker compose up -d db
npm run backend:migrate
npm run backend:import-kmz
npm run backend:dev
```

In a second terminal:

```powershell
npm run dev
```

## Useful Commands

```powershell
npm run build
npm run backend:test
docker compose down
```

Use `docker compose down -v` only if you intentionally want to delete the local database volume and re-import from scratch.
