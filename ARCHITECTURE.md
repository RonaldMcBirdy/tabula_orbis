# Tabula Orbis - Architectural Memo & Roadmap

_Last updated: 2026-04-24 - Phase 3.5 in progress_

## 1. Purpose of this document

This memo captures (a) what Tabula Orbis is today, (b) where the product team wants to take it, and (c) a phased plan with explicit call-outs for the manual, non-engineering lift that will be required as the dataset grows temporally.

It should be read alongside:
- `Product Spec.docx` - product team wish list: placemarks, functions, features, timeline
- `STARTUP.md` - local dev setup
- `server/app/models.py` - current schema
- `server/alembic/versions/` - schema migration history

## 2. Product vision: two sides of one app

Tabula Orbis is a **temporal atlas of antiquity** - initially scoped to the Byzantine world, but the architecture should not hard-code that. There are two first-class surfaces:

1. **Map-viewing experience** - rich, interactive, immersive. A reader opens the app, scrubs through time, toggles layers, clicks placemarks, reads about sites, follows sources. Optimised for exploration and discovery. This is the public-facing product.
2. **Research workspace** - the same data, but with CRUD: adding/editing sites, drawing polygons, attaching sources, uploading icons, performing bulk edits, eventually running research queries. Gated behind auth. This is the scholar-facing product.

The two surfaces share a single backend, a single data model, and mostly the same map component. They diverge in chrome, permissions, and secondary panels.

## 3. Current state

### What works today

- **Frontend:** React 18 + Vite + Leaflet, routed with `react-router-dom`. `/map` is the public map surface and `/research` is the settlement research browser.
- **Map UI:** Marker clustering, layer toggles, custom-polygon province drawing with localStorage fallback, HTML-sanitised popups, search highlighting, base-map switching, and a bottom-left timeline slider.
- **Research UI:** Settlement browser for towns, cities, and metropoleis with inline editing for name, summary, description HTML, coordinates, `validFrom`, `validTo`, and site-history events.
- **Backend:** FastAPI + SQLAlchemy 2 + PostGIS 3.4 on Postgres 16 in Docker. Soft-delete on mutable tables. Alembic now has forward schema evolution: `0001_initial` and `0002_feature_validity_dates`.
- **Temporal core:** `features.valid_from` and `features.valid_to` are first-class nullable date columns. `feature_events` stores ranged historical events for feature histories. `GET /api/features` accepts `at_date` and `date_range`; GeoJSON responses include `validFrom` and `validTo`. Phase 3.5 adds event-resolved snapshots for date-specific display state.
- **Taxonomy:** Categories now support a two-level hierarchy. The imported layers are grouped into Settlements, Ecclesiastical, Fortifications, Infrastructure, and Rural Sites, with `episcopal` presented as `Episcopal Sees` under Ecclesiastical.
- **Ingestion:** Robust, idempotent KMZ importer (`server/app/importer.py`) plus a pre-build preprocessor (`scripts/preprocess-kmz.mjs`) that emits per-category GeoJSON to `public/atlas/` as a static fallback when the API is unavailable.
- **Data loaded:** 6,992 features across 10 flat categories: episcopal, churches, metropoleis, cities, towns, farmsteads, fortresses, castles, bridges, roads-landmarks. There are 15 extracted icons and bounds covering the Mediterranean, Asia Minor, and Eastern Europe.
- **Tests and CI:** Vitest utility tests, pytest backend/importer tests, and GitHub Actions CI.
- **Dev ergonomics:** `npm run start:dev` provisions venv, Docker DB, migrations, KMZ import, and both dev servers in one command.

### What is load-bearing but fragile

- `src/pages/MapPage.jsx` is much smaller than the original monolith, but it still owns a lot of cross-cutting map state: category loading, base layer selection, search, province drawing, and timeline state.
- The research workspace currently edits only settlements (`towns`, `cities`, `metropoleis`). Broader feature CRUD still needs a generalized editor.
- Static GeoJSON fallback files are timeless snapshots. They can show the no-date baseline, but they cannot answer `at_date` or `date_range` queries.
- The KMZ importer still treats the KMZ as reloadable source data. Once scholars start editing dates/events in the app, DB-as-source-of-truth needs to become explicit.
- There is no auth. Today every endpoint is writable by anyone who can reach it.

### What is not there yet

- Event-resolved current-state snapshots are being added in Phase 3.5.
- No versioned borders / territories.
- No polygon editing beyond draw/delete.
- No KML/KMZ or GeoJSON export endpoint.
- No icon upload UI.
- No faceted filtering beyond category on/off plus keyword search.
- No structured sources/bibliography model; citations still live as HTML inside `description_html`.
- No authentication, users, roles, or audit trail.

## 4. The central architectural shift: temporal modelling

Every significant feature in the product spec - the time slider, conquest/loss, creation/abandonment, name changes, population changes, theo-political status, thematic administration, thematic/imperial/neighbour borders, battles - follows from making time a first-class dimension of the schema.

The chosen shape remains a **hybrid temporal model**:

1. **`Feature.valid_from` / `Feature.valid_to`: implemented in Phase 1.** These nullable date columns represent site existence: creation/foundation/first attestation and abandonment/loss/end of attestation. Nullable means unbounded. They are indexed and used by the map timeline.
2. **`FeatureEvent`: implemented in Phase 2, resolved in Phase 3.5.** The `feature_events` table is keyed by `feature_id`, `event_type`, `start_date`, optional `end_date`, and `payload_json`. Event types cover `name_change`, `conquest`, `loss`, `population`, `theo_political_status`, `thematic_admin`, and `notable_event`. Phase 3.5 folds applicable events into a current-state snapshot for display names, population, status, thematic administration, and political state.
3. **`TerritoryVersion`: planned for Phase 4.** Time-versioned polygons: `territory_id`, `kind`, `valid_from`, `valid_to`, `geometry`. `kind` should cover `imperial`, `thematic`, `neighbour_state`, and `diocese`.
4. **Battles remain point-in-time.** A battle should become either a feature subtype with a single `event_date`, or a feature plus a corresponding event record. Decide this before Phase 3/4 taxonomy work.

This keeps the `features` table small and the hot marker-rendering path cheap. Events are joined only when the user opens a popup, inspects history, or pins a specific date. Territories stay separate because their geometry and rendering concerns differ from placemarks.

## 5. Phase history and roadmap

Phases are ordered by dependency, not calendar. Each phase is scoped to be independently shippable.

### Phase 0 - Foundations - DONE

Completed 2026-04-24. Verified with 16 Vitest tests and 4 pytest tests at the time.

What changed:
- `src/App.jsx` became a small `BrowserRouter` + `Routes` shell. Map is at `/map`, research browser at `/research`.
- `src/pages/MapPage.jsx` owns map state and render logic.
- `src/pages/ResearchPage.jsx` owns the settlement browser.
- `src/components/LayerPanel.jsx` and `src/components/map/*` extracted Leaflet and sidebar sub-components.
- `src/utils/html.js`, `src/utils/geo.js`, `src/utils/icons.js`, and `src/constants.js` hold shared helpers/constants.
- `src/store.js` added a small Zustand store with `selectedFeatureId` / `setSelectedFeatureId`, still dormant until map-browser sync is needed.
- `.github/workflows/ci.yml` added CI for Vitest and pytest.
- `package.json` and `vite.config.js` gained test tooling.

### Phase 1 - Temporal core - DONE

Completed 2026-04-24. Verified with:
- `.venv\Scripts\python -m pytest server/tests` - 8 passed
- `npm run test` - 16 passed
- `npm run build` - passed
- `alembic upgrade head` - passed
- KMZ import - 6,992 features across 10 categories

What changed:
- `server/app/models.py` - added indexed nullable `Feature.valid_from` and `Feature.valid_to` date columns.
- `server/alembic/versions/0002_feature_validity_dates.py` - migration adds the columns, backfills from `feature_metadata.startDate` / `feature_metadata.endDate` when values are valid `YYYY-MM-DD`, removes those metadata rows, and restores them on downgrade.
- `server/app/main.py` - added ISO date parsing/validation, temporal filtering, `at_date`, and `date_range` support on `GET /api/features`.
- `server/app/schemas.py` - added `validFrom` / `validTo` to create and update payloads.
- GeoJSON responses now include `properties.validFrom` and `properties.validTo`.
- `src/components/TimelineSlider.jsx` - new bottom-left timeline control. Default state is "All dates", meaning no temporal filter.
- `src/pages/MapPage.jsx` - tracks the selected timeline date and refetches visible categories with `at_date` when the date changes.
- `src/pages/ResearchPage.jsx` - writes date edits to real columns instead of opaque metadata.
- `src/components/map/FeaturePopup.jsx` - shows validity dates in popup metadata when present.
- `server/tests/test_temporal_filters.py` - added focused backend tests for temporal parsing and date validation.

Current Phase 1 behavior:
- No date selected: all features are shown.
- Year selected in slider: map requests `GET /api/features?category=...&at_date=YYYY-01-01`.
- A feature is visible at date D when `(valid_from IS NULL OR valid_from <= D)` and `(valid_to IS NULL OR valid_to >= D)`.
- `date_range=START,END` or `date_range=START..END` returns features whose validity interval overlaps the requested range.

### Phase 2 - Event log & site history - DONE

Completed 2026-04-24. Verified with:
- `.venv\Scripts\python -m pytest server\tests` - 13 passed
- `npm run test` - 16 passed
- `npm run build` - passed

What changed:
- `server/app/models.py` - added `FeatureEvent` with `feature_id`, `event_type`, `start_date`, optional `end_date`, `payload_json`, timestamps, and soft-delete.
- `server/alembic/versions/0003_feature_events.py` - migration creates `feature_events` and indexes feature, event type, date range, and soft-delete columns.
- `server/app/main.py` - added feature-scoped event CRUD endpoints under `/api/features/{feature_id}/events`, event type validation, event date range validation, and payload key validation.
- `server/app/schemas.py` - added event create/update/response models.
- `src/api.js` - added feature-event API helpers.
- `src/components/map/FeaturePopup.jsx` - popups now load and render a site-history timeline for the selected feature.
- `src/pages/ResearchPage.jsx` - settlement editor now includes a site-history event list plus add/edit/delete controls.
- `server/tests/test_feature_events.py` - added focused tests for event type, range, and payload validation.

Current Phase 2 behavior:
- Events support date ranges through required `startDate` and optional `endDate`.
- Events are soft-deleted rather than hard-deleted.
- Event payloads remain JSON for flexibility, but are constrained to known fields per event type.
- Source fields are stored inside `payload_json` for now: `source_title`, `source_url`, and `source_note`.
- Feature visibility still uses `features.valid_from` / `features.valid_to`; events do not yet mutate or derive the map-visible feature state.

### Phase 3 - Taxonomy & layer types - DONE

Completed 2026-04-24. Verified with:
- `.venv\Scripts\python -m pytest server/tests` - 14 passed
- `npm run test` - 16 passed
- `npm run build` - passed
- `alembic upgrade head` - passed through `0005_normalize_category_labels`

What changed:
- `server/app/models.py` - added self-referencing `Category.parent_id` plus parent/child relationships.
- `server/alembic/versions/0004_category_hierarchy.py` - adds parent categories and maps the existing 10 source categories under product headings.
- `server/alembic/versions/0005_normalize_category_labels.py` - normalizes imported KMZ labels into product-facing layer labels.
- `server/app/importer.py` - preserves the taxonomy and label normalization on future KMZ imports.
- `server/app/main.py` and `server/app/schemas.py` - category responses now include parent metadata, and `/api/categories` supports first-pass layer-type CRUD.
- `src/components/LayerPanel.jsx` - map layer controls now render parent heading toggles plus per-subtype toggles.
- `src/pages/ResearchPage.jsx` - research workspace includes a layer-type manager for creating, renaming, re-parenting, default visibility changes, and deleting empty layer types.

Current Phase 3 deferrals:
- Icon upload remains a follow-up. Existing KMZ/imported style keys still drive marker icons.
- Placemark/label sizing from status or population is deferred until after the event-resolved snapshot API contract is stable.

### Phase 3.5 - Event-resolved snapshots

Status: IN PROGRESS.

Scope:
- Add `GET /api/features/{id}/snapshot?at_date=YYYY-MM-DD`.
- Allow `GET /api/features?at_date=YYYY-MM-DD&include_snapshot=true` to embed the same snapshot contract for map rendering.
- Use snapshots in popups and marker labels so selected timeline dates produce consistent display names and state.
- Keep `/api/features` structural by default; bulk snapshots are opt-in.

Snapshot response:
- `featureId`
- `atDate`
- `name`
- `population`
- `theoPoliticalStatus`
- `thematicAdmin`
- `politicalState`
- `sources`
- `appliedEvents`

Resolution rules:
- An event applies at date D when `start_date <= D` and (`end_date` is null or `D <= end_date`).
- For multiple applicable events of the same type, choose the event with the latest `start_date`.
- If `start_date` ties, choose the most recently updated row.
- If still tied, use the event id as a stable final tie-breaker.
- `name_change` resolves the display name through `payload_json.new_name`.
- `population`, `theo_political_status`, and `thematic_admin` resolve from their latest applicable same-type event.
- `conquest` and `loss` share one political-state slot; the latest applicable event across those two types wins.

### Phase 4 - Borders & territories

- `territory_versions` table.
- Polygon editing tool for existing polygons, extending the current freehand drawer.
- Render imperial borders, thematic/province borders, and neighbour-state borders as date-aware overlays.
- Battles layer with date-scoped point features.

### Phase 5 - Research UX & export

- Faceted filters: type, theo-political status, theme, date range, population, language, religious sect.
- KML/KMZ export endpoint. GeoJSON export should fall out naturally.
- CSV/spreadsheet import for bulk site loading.
- Structured `sources` and `feature_sources` tables plus citation UI.

### Phase 6 - Auth, collaboration, and long-term research tooling

- Real auth: magic-link email, OIDC, or simpler admin-password gate as an interim step.
- Roles: `viewer`, `editor`, `admin`.
- Audit log on all mutations: who, when, what changed.
- Public share links / embed mode for the map-viewing side.
- Research assistant surface: search across descriptions and sources, summarisation, suggested cross-references.

## 6. Manual non-engineering lift

Engineering unlocks the data model. Scholars fill it in. These are the human-effort items to plan explicitly:

1. **Date assignment for the existing 6,992 features.** Each site needs at minimum `valid_from` and, where applicable, `valid_to`. Prioritise metropoleis and cities first, farmsteads last.
2. **Event backfill.** Conquests, losses, name changes, population shifts, theo-political status changes, and thematic administration changes need source-backed historical review.
3. **Category remapping.** The existing 10 categories are mapped into the product taxonomy. `episcopal` is presented as `Episcopal Sees` under Ecclesiastical for now, while its deeper meaning should move toward status/event-backed interpretation.
4. **Natural features dataset.** Mountains, lakes, rivers, seas, and passes are not in the current KMZ.
5. **Battles dataset.** Needs enumeration, dating, location, belligerents, and sources.
6. **Territory polygons at key dates.** Imperial borders at dates such as 565, 717, 867, 1025, 1180, 1204, 1282, and 1453 will require manual or semi-manual digitising.
7. **Icon library expansion.** Each new subtype needs a distinct icon.
8. **Sources / citations.** Existing HTML descriptions should eventually be converted into structured citations. This can be partially automated but needs review.

Engineering should deliver each phase with importer tooling or admin UI that makes the manual lift tractable: bulk CSV, paste-from-spreadsheet, draw-and-save, and review workflows rather than one-click-at-a-time editing.

## 7. Decisions to make soon

- **Auth model for the research side.** A single admin password is still the simplest interim path; per-user accounts are needed before collaboration/audit matters.
- **Scope of time.** Byzantine-only, roughly 330-1453, or a broader antiquity-to-early-modern range. Phase 1 currently uses 330-1453 as the slider range.
- **Slider granularity.** Phase 1 uses year granularity and requests January 1 of the selected year. Some historical workflows may need month/day precision later, but year-level is probably right for the main map.
- **Inclusive vs. exclusive end dates.** DECIDED: Phase 1 treats feature `valid_to` as inclusive. Phase 4 territory versions should use half-open intervals: `valid_from <= date < valid_to`, so adjacent border versions can share a boundary date without both rendering.
- **Event-resolved feature snapshots.** DECIDED: Phase 3.5 adds a separate snapshot endpoint and opt-in `include_snapshot=true` for timeline map rendering.
- **Provinces vs. territories.** DECIDED: remove the scratchpad province concept in Phase 4 and replace it with canonical temporal territories.
- **Static-file fallback.** Decide whether to freeze static GeoJSON as "baseline/no-date view" or remove fallback once the temporal DB is mandatory.
- **KMZ re-import vs. DB-as-source-of-truth.** DECIDED: the DB is the source of truth from Phase 3.5 onward. Normal KMZ import should become append/merge-only; destructive reloads need an explicit reset path.
- **Battle modelling.** DECIDED: battles should be point `Feature` rows under a `Battles` category, with `valid_from = valid_to` for the event date plus optional `FeatureEvent` rows for narrative/source detail.

## 8. Recommended next sprint

The current engineering sprint is the **event-resolved snapshot contract**, followed by Phase 4 borders/territories once that contract is stable.

Suggested scope:
- Add `/api/features/{id}/snapshot?at_date=YYYY-MM-DD` for current name, status, population, and administrative state.
- Keep `/api/features` structural by default, with a later optional `include_snapshot=true` only if map rendering needs bulk event-derived state.
- Document conflict-resolution rules for multiple events of the same type.
- Defer borders, auth, full structured citations, battle modelling, and icon upload until taxonomy and event snapshot semantics are stable.
