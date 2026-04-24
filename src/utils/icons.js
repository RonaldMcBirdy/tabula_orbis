import L from "leaflet";
import sanitizeHtml from "sanitize-html";

export function createLeafletIcon(icon, isHighlighted = false) {
  if (isHighlighted) {
    const width = Math.max(24, Math.round((icon?.width ?? 32) * (icon?.scale ?? 1)));
    const height = Math.max(24, Math.round((icon?.height ?? 32) * (icon?.scale ?? 1)));
    const iconHtml = icon?.href
      ? `<img src="${icon.href}" alt="" width="${width}" height="${height}" />`
      : '<span class="highlight-pin-core"></span>';

    return L.divIcon({
      className: "highlight-marker",
      html: `<span class="highlight-pin">${iconHtml}</span>`,
      iconSize: [width + 20, height + 20],
      iconAnchor: [Math.round((width + 20) / 2), height + 16],
      popupAnchor: [0, -height],
    });
  }

  if (!icon?.href) {
    return null;
  }

  const width = Math.max(18, Math.round((icon.width ?? 32) * (icon.scale ?? 1)));
  const height = Math.max(18, Math.round((icon.height ?? 32) * (icon.scale ?? 1)));

  return L.icon({
    iconUrl: icon.href,
    iconSize: [width, height],
    iconAnchor: [Math.round(width / 2), height],
    popupAnchor: [0, -height + 10],
    tooltipAnchor: [0, -height / 2],
  });
}

export function leafletLabelIcon(name, isSelected = false) {
  return L.divIcon({
    className: `province-label-icon${isSelected ? " selected" : ""}`,
    html: `<span>${sanitizeHtml(name, { allowedTags: [], allowedAttributes: {} })}</span>`,
    iconSize: null,
    iconAnchor: [0, 0],
  });
}
