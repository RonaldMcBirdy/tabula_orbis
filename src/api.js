const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export async function fetchManifest() {
  return requestJson("/api/manifest");
}

export async function fetchFeatures(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, value);
    }
  }
  return requestJson(`/api/features${query.toString() ? `?${query}` : ""}`);
}

export async function updateFeature(featureId, payload) {
  return requestJson(`/api/features/${encodeURIComponent(featureId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function fetchProvinces() {
  return requestJson("/api/provinces");
}

export async function createProvince(payload) {
  return requestJson("/api/provinces", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteProvince(provinceId) {
  return requestJson(`/api/provinces/${encodeURIComponent(provinceId)}`, {
    method: "DELETE",
  });
}
