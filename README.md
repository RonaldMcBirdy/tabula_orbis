# Tabula Orbis KMZ Viewer

Single-page React/Vite application for displaying the bundled `Digital Atlas of the Byzantine Empire.kmz` file on an interactive Leaflet map.

The app preprocesses the KMZ into browser-friendly assets, then renders the resulting GeoJSON layers with category toggles, clustered point markers, custom icons, and sanitized popups.

## Requirements

- Node.js 20 or newer
- npm

The workspace has been verified with Node `v24.14.0` and npm `11.9.0`.

## Startup

Install dependencies:

```powershell
npm install
```

Start the local development server:

```powershell
npm run dev
```

Vite will print the local URL, usually:

```text
http://localhost:5173/
```

The `dev` script runs the KMZ preprocessing step before starting Vite, so changes to the bundled KMZ are reflected when the server starts.

## Backend Data Store

The app now includes a local-first FastAPI backend backed by Postgres/PostGIS. Start the backend-backed workflow with:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r server\requirements.txt
docker compose up -d db
npm run backend:migrate
npm run backend:import-kmz
npm run backend:dev
```

Then start the frontend in a second terminal:

```powershell
npm run dev
```

Vite proxies `/api` to `http://localhost:8000`. During the migration, the frontend falls back to generated static `/atlas` files if the API is unavailable.

## Build And Preview

Create a production build:

```powershell
npm run build
```

Preview the production build locally:

```powershell
npm run preview
```

Regenerate only the map assets:

```powershell
npm run preprocess:kmz
```

## KMZ Source

The preprocessing script looks for the source KMZ in this order:

1. `data/byzantine-atlas.kmz`
2. `Digital Atlas of the Byzantine Empire.kmz` at the repo root

On the first successful run, if only the root KMZ exists, the script copies it into `data/byzantine-atlas.kmz`. Future runs use the `data/` copy.

To replace the atlas, put the new KMZ at `data/byzantine-atlas.kmz` and run:

```powershell
npm run preprocess:kmz
```

## Architecture

### Preprocessing Pipeline

`scripts/preprocess-kmz.mjs` converts the fixed KMZ into static frontend assets.

It performs these steps:

- Opens the KMZ archive with `jszip`.
- Reads `doc.kml` and parses it with `fast-xml-parser`.
- Extracts KML styles, folders, placemarks, descriptions, and supported geometries.
- Converts point, line, and polygon placemarks into GeoJSON.
- Splits GeoJSON by top-level KML folder/category.
- Copies bundled marker icons into `public/atlas/icons/`.
- Writes `public/atlas/manifest.json` with category metadata, bounds, source information, and icon mappings.
- Sanitizes description HTML with `sanitize-html` before it reaches the browser assets.

Generated files are intentionally ignored by git:

```text
public/atlas/
dist/
node_modules/
```

### Runtime Frontend

`src/App.jsx` is the main application.

At runtime the browser:

- Fetches `/atlas/manifest.json`.
- Initializes category visibility from the manifest.
- Lazy-loads each category GeoJSON file when its layer is visible.
- Renders OpenStreetMap tiles with `react-leaflet`.
- Clusters point features with `react-leaflet-cluster` and `leaflet.markercluster`.
- Renders line and polygon features as regular Leaflet GeoJSON vectors.
- Uses extracted KMZ icons for point markers when style data is available.
- Fits the initial map bounds to the full atlas bounds from the manifest.
- Displays sanitized placemark title, metadata, and description content in popups.

`src/styles.css` contains the full layout and visual treatment for the sidebar, layer controls, map canvas, legend, loading state, and popups.

### Static Asset Contract

The frontend expects these generated files:

```text
public/atlas/manifest.json
public/atlas/*.geojson
public/atlas/icons/*.png
```

The manifest is the entrypoint. It points to each category GeoJSON file and maps KML style IDs to browser-accessible icon paths.

## Current Dataset

The current KMZ preprocesses into:

- 10 top-level categories
- 6992 rendered features
- Point markers, line strings, and polygons
- 15 bundled icon images

One placemark from the source KML is skipped because it does not expose a supported geometry shape for this viewer.

## Troubleshooting

If the app loads but no atlas layers appear, run:

```powershell
npm run preprocess:kmz
```

If `public/atlas/manifest.json` is missing, the preprocessing step has not completed successfully.

If map tiles do not appear, check network access to OpenStreetMap tile servers. The atlas data itself is served locally, but the base map uses remote OpenStreetMap tiles.

If a replacement KMZ does not appear to take effect, confirm it is located at:

```text
data/byzantine-atlas.kmz
```

Then restart the dev server or rerun the preprocessing script.
