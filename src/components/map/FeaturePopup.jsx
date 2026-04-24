import { Popup } from "react-leaflet";
import { highlightHtml } from "../../utils/html.js";

export function buildPopupContent(properties, searchQuery = "") {
  const html = highlightHtml(properties.descriptionHtml, searchQuery);
  const temporalEntries = [
    properties.validFrom ? ["Valid from", properties.validFrom] : null,
    properties.validTo ? ["Valid to", properties.validTo] : null,
  ].filter(Boolean);
  const metadataEntries = Object.entries(properties.metadata ?? {}).filter(
    ([key, value]) => value && key.toLowerCase() !== "summary",
  );
  const detailEntries = [...temporalEntries, ...metadataEntries];

  return (
    <div className="popup-card">
      <h3>{properties.name || "Untitled feature"}</h3>
      {detailEntries.length > 0 ? (
        <dl className="popup-meta">
          {detailEntries.map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {html ? <div className="popup-body" dangerouslySetInnerHTML={{ __html: html }} /> : null}
    </div>
  );
}

export default function FeaturePopup({ feature, searchQuery }) {
  return <Popup maxWidth={380}>{buildPopupContent(feature.properties, searchQuery)}</Popup>;
}
