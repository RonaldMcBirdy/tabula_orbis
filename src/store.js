import { create } from "zustand";

/**
 * Global atlas store for cross-page shared state.
 *
 * selectedFeatureId: the feature currently focused in either the map or
 * the research browser, enabling the two surfaces to sync selection in
 * Phase 1+ (e.g. clicking a row in the browser pans the map to that feature).
 */
export const useAtlasStore = create((set) => ({
  selectedFeatureId: null,
  setSelectedFeatureId: (id) => set({ selectedFeatureId: id }),
}));
