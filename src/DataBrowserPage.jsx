import { useState, useEffect, useMemo } from "react";

const SETTLEMENT_CATEGORIES = [
  { id: "towns", label: "Towns" },
  { id: "cities", label: "Cities" },
  { id: "metropoleis", label: "Metropoleis" },
];

const PAGE_SIZE = 25;
const STORAGE_KEY = "tabula_orbis_edits";

function loadEditsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistEdits(edits) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(edits));
  } catch (e) {
    console.error("Failed to persist edits:", e);
  }
}

export default function DataBrowserPage({ onBack }) {
  const [allFeatures, setAllFeatures] = useState([]);
  const [loadingState, setLoadingState] = useState("loading");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [savedEdits, setSavedEdits] = useState(loadEditsFromStorage);

  useEffect(() => {
    let cancelled = false;

    async function loadSettlements() {
      setLoadingState("loading");
      try {
        const features = [];
        for (const cat of SETTLEMENT_CATEGORIES) {
          const res = await fetch(`/atlas/${cat.id}.geojson`);
          if (!res.ok) continue;
          const fc = await res.json();
          for (const f of fc.features) {
            features.push({ ...f, _categoryId: cat.id, _categoryLabel: cat.label });
          }
        }
        if (!cancelled) {
          setAllFeatures(features);
          setLoadingState("ready");
        }
      } catch {
        if (!cancelled) setLoadingState("error");
      }
    }

    loadSettlements();
    return () => {
      cancelled = true;
    };
  }, []);

  const displayFeatures = useMemo(() => {
    return allFeatures.map((f) => {
      const edit = savedEdits[f.id];
      if (!edit) return f;
      return {
        ...f,
        properties: {
          ...f.properties,
          name: edit.name ?? f.properties.name,
          descriptionHtml: edit.descriptionHtml ?? f.properties.descriptionHtml,
          startDate: edit.startDate ?? f.properties.startDate ?? null,
          endDate: edit.endDate ?? f.properties.endDate ?? null,
          metadata: {
            ...f.properties.metadata,
            Summary: edit.summary ?? f.properties.metadata?.Summary,
          },
        },
        geometry: edit.coordinates
          ? { ...f.geometry, coordinates: [edit.coordinates.lng, edit.coordinates.lat] }
          : f.geometry,
      };
    });
  }, [allFeatures, savedEdits]);

  const filtered = useMemo(() => {
    let result = displayFeatures;
    if (categoryFilter !== "all") {
      result = result.filter((f) => f._categoryId === categoryFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (f) =>
          (f.properties.name || "").toLowerCase().includes(q) ||
          (f.properties.metadata?.Summary || "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [displayFeatures, categoryFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(currentPage, totalPages);

  const paginated = useMemo(() => {
    const start = (clampedPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, clampedPage]);

  useEffect(() => {
    setCurrentPage(1);
    setEditingId(null);
  }, [categoryFilter, searchQuery]);

  function startEdit(feature) {
    setEditingId(feature.id);
    const edit = savedEdits[feature.id];
    setEditValues({
      name: edit?.name ?? feature.properties.name ?? "",
      summary: edit?.summary ?? feature.properties.metadata?.Summary ?? "",
      descriptionHtml: edit?.descriptionHtml ?? feature.properties.descriptionHtml ?? "",
      lat: String(edit?.coordinates?.lat ?? feature.geometry?.coordinates?.[1] ?? ""),
      lng: String(edit?.coordinates?.lng ?? feature.geometry?.coordinates?.[0] ?? ""),
      startDate: edit?.startDate ?? feature.properties.startDate ?? "",
      endDate: edit?.endDate ?? feature.properties.endDate ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValues({});
  }

  function commitEdit(featureId) {
    const lat = parseFloat(editValues.lat);
    const lng = parseFloat(editValues.lng);
    const nextEdits = {
      ...savedEdits,
      [featureId]: {
        name: editValues.name,
        summary: editValues.summary,
        descriptionHtml: editValues.descriptionHtml,
        coordinates: {
          lat: Number.isFinite(lat) ? lat : 0,
          lng: Number.isFinite(lng) ? lng : 0,
        },
        startDate: editValues.startDate || null,
        endDate: editValues.endDate || null,
      },
    };
    setSavedEdits(nextEdits);
    persistEdits(nextEdits);
    setEditingId(null);
    setEditValues({});
  }

  function resetFeatureEdit(featureId) {
    const nextEdits = { ...savedEdits };
    delete nextEdits[featureId];
    setSavedEdits(nextEdits);
    persistEdits(nextEdits);
    if (editingId === featureId) {
      setEditingId(null);
      setEditValues({});
    }
  }

  const editedCount = Object.keys(savedEdits).length;

  return (
    <div className="db-page">
      <div className="db-header">
        <div className="db-header-left">
          <button className="db-back-btn" onClick={onBack} type="button">
            ← Map
          </button>
          <div>
            <h1 className="db-title">Settlement Browser</h1>
            <p className="db-subtitle">
              Towns, cities &amp; metropoleis
              {loadingState === "ready" && ` · ${allFeatures.length} total`}
              {editedCount > 0 && <span className="db-edit-badge">{editedCount} edited</span>}
            </p>
          </div>
        </div>
        <div className="db-filters">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="db-select"
          >
            <option value="all">All types</option>
            {SETTLEMENT_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            type="search"
            placeholder="Search by name or summary…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="db-search"
          />
        </div>
      </div>

      {loadingState === "loading" && (
        <div className="db-state">Loading settlement data…</div>
      )}
      {loadingState === "error" && (
        <div className="db-state db-state--error">Failed to load settlement data.</div>
      )}
      {loadingState === "ready" && (
        <>
          <div className="db-results-bar">
            <span>
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </span>
            <span>
              Page {clampedPage} of {totalPages}
            </span>
          </div>

          <div className="db-table-wrap">
            <table className="db-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Summary</th>
                  <th>Lat</th>
                  <th>Lng</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {paginated.map((feature) => {
                  const isEditing = editingId === feature.id;
                  const isEdited = Boolean(savedEdits[feature.id]);
                  const coords = feature.geometry?.coordinates;

                  if (isEditing) {
                    return (
                      <tr key={feature.id} className="db-row db-row--editing">
                        <td colSpan={6}>
                          <div className="db-edit-form">
                            <div className="db-edit-grid">
                              <div className="db-field">
                                <label>Name</label>
                                <input
                                  type="text"
                                  value={editValues.name}
                                  onChange={(e) =>
                                    setEditValues((v) => ({ ...v, name: e.target.value }))
                                  }
                                  className="db-input"
                                />
                              </div>
                              <div className="db-field">
                                <label>Latitude</label>
                                <input
                                  type="number"
                                  step="0.0001"
                                  value={editValues.lat}
                                  onChange={(e) =>
                                    setEditValues((v) => ({ ...v, lat: e.target.value }))
                                  }
                                  className="db-input"
                                />
                              </div>
                              <div className="db-field">
                                <label>Longitude</label>
                                <input
                                  type="number"
                                  step="0.0001"
                                  value={editValues.lng}
                                  onChange={(e) =>
                                    setEditValues((v) => ({ ...v, lng: e.target.value }))
                                  }
                                  className="db-input"
                                />
                              </div>
                              <div className="db-field">
                                <label>Start Date</label>
                                <input
                                  type="date"
                                  value={editValues.startDate ?? ""}
                                  onChange={(e) =>
                                    setEditValues((v) => ({ ...v, startDate: e.target.value }))
                                  }
                                  className="db-input"
                                />
                              </div>
                              <div className="db-field">
                                <label>End Date</label>
                                <input
                                  type="date"
                                  value={editValues.endDate ?? ""}
                                  onChange={(e) =>
                                    setEditValues((v) => ({ ...v, endDate: e.target.value }))
                                  }
                                  className="db-input"
                                />
                              </div>
                              <div className="db-field db-field--full">
                                <label>Summary</label>
                                <textarea
                                  rows={3}
                                  value={editValues.summary}
                                  onChange={(e) =>
                                    setEditValues((v) => ({ ...v, summary: e.target.value }))
                                  }
                                  className="db-input"
                                />
                              </div>
                              <div className="db-field db-field--full">
                                <label>Description HTML</label>
                                <textarea
                                  rows={7}
                                  value={editValues.descriptionHtml}
                                  onChange={(e) =>
                                    setEditValues((v) => ({
                                      ...v,
                                      descriptionHtml: e.target.value,
                                    }))
                                  }
                                  className="db-input db-input--mono"
                                />
                              </div>
                            </div>
                            <div className="db-edit-actions">
                              <button
                                type="button"
                                className="db-btn db-btn--save"
                                onClick={() => commitEdit(feature.id)}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className="db-btn db-btn--cancel"
                                onClick={cancelEdit}
                              >
                                Cancel
                              </button>
                              {isEdited && (
                                <button
                                  type="button"
                                  className="db-btn db-btn--reset"
                                  onClick={() => resetFeatureEdit(feature.id)}
                                >
                                  Reset to original
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr
                      key={feature.id}
                      className={`db-row${isEdited ? " db-row--edited" : ""}`}
                    >
                      <td>
                        {isEdited && <span className="db-dot" title="Edited" />}
                        {feature.properties.name || (
                          <em className="db-empty">Unnamed</em>
                        )}
                      </td>
                      <td>{feature._categoryLabel}</td>
                      <td className="db-cell--summary">
                        {feature.properties.metadata?.Summary ? (
                          feature.properties.metadata.Summary.length > 120 ? (
                            feature.properties.metadata.Summary.slice(0, 120) + "…"
                          ) : (
                            feature.properties.metadata.Summary
                          )
                        ) : (
                          <em className="db-empty">—</em>
                        )}
                      </td>
                      <td className="db-cell--coord">
                        {coords?.[1] != null ? coords[1].toFixed(4) : "—"}
                      </td>
                      <td className="db-cell--coord">
                        {coords?.[0] != null ? coords[0].toFixed(4) : "—"}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="db-btn db-btn--edit"
                          onClick={() => startEdit(feature)}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="db-pagination">
            <button
              type="button"
              className="db-btn"
              disabled={clampedPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              ← Prev
            </button>
            <span className="db-page-info">
              {clampedPage} / {totalPages}
            </span>
            <button
              type="button"
              className="db-btn"
              disabled={clampedPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
