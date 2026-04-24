# Tabula Orbis API

FastAPI backend for the local-first Tabula Orbis PostGIS data store.

## Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r server\requirements.txt
docker compose up -d db
python -m alembic -c server\alembic.ini upgrade head
python -m uvicorn server.app.main:app --reload --port 8000
```

The Vite dev server proxies `/api` to `http://localhost:8000`.

To seed or reseed the atlas tables from the KMZ, run:

```powershell
python -m server.scripts.import_kmz
```

## Useful Commands

```powershell
python -m alembic -c server\alembic.ini upgrade head
python -m server.scripts.import_kmz
python -m pytest server\tests
```
