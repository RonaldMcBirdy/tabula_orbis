import { hashColor } from "../utils/geo.js";

export default function LayerPanel({
  categories,
  activeCategories,
  loadedCategories,
  onToggleCategory,
  onToggleCategoryGroup,
  onShowAll,
  onHideAll,
  iconsByStyle,
  searchQuery,
  onSearchQueryChange,
  matchCount,
  onOpenDataBrowser,
  customProvinces,
  isAddProvinceMode,
  draftProvincePoints,
  isDrawingProvince,
  provinceForm,
  showProvinceLabels,
  selectedProvinceId,
  onStartAddProvince,
  onCancelAddProvince,
  onProvinceFormChange,
  onSaveProvince,
  onDeleteProvince,
  onToggleProvinceLabels,
  onSelectProvince,
}) {
  const canSaveProvince = provinceForm.name.trim() && draftProvincePoints.length >= 3;
  const selectedProvince = customProvinces.find((province) => province.id === selectedProvinceId);
  const categoryGroups = Array.from(
    categories.reduce((groups, category) => {
      const groupId = category.parentId ?? "__ungrouped";
      const group = groups.get(groupId) ?? {
        id: groupId,
        label: category.parentLabel ?? "Other Layers",
        categories: [],
      };
      group.categories.push(category);
      groups.set(groupId, group);
      return groups;
    }, new Map()).values(),
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-shell">
        <p className="eyebrow">Digital Atlas of the Byzantine Empire</p>
        <h1>Tabula Orbis</h1>
        <p className="lede">
          East Roman and Byzantine settlements, roads, fortifications, and ecclesiastical sites
          rendered from the bundled KMZ source.
        </p>
        <section className="search-panel" aria-label="Search atlas">
          <label htmlFor="atlas-search">Search atlas</label>
          <input
            id="atlas-search"
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search places, dates, sources"
          />
          <small>
            {searchQuery.trim()
              ? `${matchCount} visible matches highlighted`
              : "Highlights visible loaded layers"}
          </small>
        </section>
        <section className="panel-section province-panel">
          <div className="panel-heading-row">
            <h2>Custom Provinces</h2>
            <label className="label-toggle">
              <input
                type="checkbox"
                checked={showProvinceLabels}
                onChange={(event) => onToggleProvinceLabels(event.target.checked)}
              />
              Names
            </label>
          </div>
          {isAddProvinceMode ? (
            <div className="province-editor">
              <p className="draw-hint">
                {isDrawingProvince
                  ? "Release the mouse to finish the outline."
                  : draftProvincePoints.length >= 3
                    ? "Review the outline, then name and save it."
                    : "Drag on the map to freehand the province boundary."}
              </p>
              <label>
                Name
                <input
                  type="text"
                  value={provinceForm.name}
                  onChange={(event) => onProvinceFormChange({ name: event.target.value })}
                  placeholder="Province name"
                />
              </label>
              <label>
                Description
                <textarea
                  value={provinceForm.description}
                  onChange={(event) => onProvinceFormChange({ description: event.target.value })}
                  placeholder="Short historical or administrative note"
                  rows={4}
                />
              </label>
              <div className="panel-actions compact">
                <button type="button" onClick={onSaveProvince} disabled={!canSaveProvince}>
                  Save province
                </button>
                <button type="button" onClick={onCancelAddProvince} className="ghost">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="full-action" onClick={onStartAddProvince}>
              Add new province
            </button>
          )}
          {customProvinces.length > 0 ? (
            <div className="province-list">
              {customProvinces.map((province) => (
                <div
                  key={province.id}
                  className={`province-list-row${selectedProvinceId === province.id ? " selected" : ""}`}
                >
                  <button type="button" className="province-select-btn" onClick={() => onSelectProvince(province.id)}>
                    {province.name}
                  </button>
                  <button
                    type="button"
                    className="province-delete-btn"
                    aria-label={`Delete ${province.name}`}
                    onClick={() => onDeleteProvince(province.id)}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <small className="empty-note">Saved provinces will appear here.</small>
          )}
          {selectedProvince ? (
            <button type="button" className="db-btn db-btn--reset" onClick={() => onDeleteProvince(selectedProvince.id)}>
              Delete selected province
            </button>
          ) : null}
        </section>
        <div className="panel-actions">
          <button type="button" onClick={onShowAll}>
            Show all
          </button>
          <button type="button" onClick={onHideAll} className="ghost">
            Hide all
          </button>
        </div>
        <section className="panel-section">
          <h2>Layers</h2>
          <div className="layer-list">
            {categoryGroups.map((group) => {
              const checkedCount = group.categories.filter((category) => activeCategories[category.id]).length;
              const allChecked = checkedCount === group.categories.length;
              const someChecked = checkedCount > 0 && !allChecked;
              return (
                <div key={group.id} className="layer-group">
                  <label className="layer-group-row">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      data-mixed={someChecked ? "true" : "false"}
                      onChange={() => onToggleCategoryGroup(group.categories, !allChecked)}
                    />
                    <span>
                      <strong>{group.label}</strong>
                      <small>
                        {checkedCount} / {group.categories.length} visible
                      </small>
                    </span>
                  </label>
                  <div className="layer-group-children">
                    {group.categories.map((category) => {
                      const checked = activeCategories[category.id] ?? false;
                      const status = loadedCategories[category.id] ? "Loaded" : "On demand";
                      return (
                        <label key={category.id} className="layer-row">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggleCategory(category.id)}
                          />
                          <span className="layer-label">
                            <strong>{category.label}</strong>
                            <small>
                              {category.featureCount} features &middot; {status}
                            </small>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <section className="panel-section">
          <h2>Legend</h2>
          <div className="legend-list">
            {categories.map((category) => {
              const icon = category.legendIcon ? iconsByStyle[category.legendIcon] : null;
              return (
                <div key={`${category.id}-legend`} className="legend-row">
                  {icon ? (
                    <img src={icon.href} alt="" width="18" height="18" />
                  ) : (
                    <span className="legend-swatch" style={{ background: hashColor(category.id, 0) }} />
                  )}
                  <span>{category.label}</span>
                </div>
              );
            })}
          </div>
        </section>
        <button type="button" className="db-nav-btn" onClick={onOpenDataBrowser}>
          Browse Settlement Data
        </button>
      </div>
    </aside>
  );
}
