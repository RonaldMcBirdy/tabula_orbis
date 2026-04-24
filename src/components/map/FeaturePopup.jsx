import { useEffect, useState } from "react";
import { Popup } from "react-leaflet";
import { fetchFeatureEvents } from "../../api.js";
import { highlightHtml } from "../../utils/html.js";

const EVENT_LABELS = {
  name_change: "Name change",
  conquest: "Conquest",
  loss: "Loss",
  population: "Population",
  theo_political_status: "Theo-political status",
  thematic_admin: "Thematic administration",
  notable_event: "Notable event",
};

function formatEventDate(event) {
  return event.endDate ? `${event.startDate} - ${event.endDate}` : event.startDate;
}

function eventTitle(event) {
  const payload = event.payload ?? {};
  if (event.eventType === "name_change" && payload.new_name) {
    return `${payload.old_name ? `${payload.old_name} -> ` : ""}${payload.new_name}`;
  }
  if (event.eventType === "population" && payload.value) {
    return `${payload.value}${payload.unit ? ` ${payload.unit}` : ""}`;
  }
  return payload.title || payload.status || payload.theme || payload.actor || payload.polity || payload.note || "";
}

export function buildPopupContent(properties, searchQuery = "", events = [], eventsState = "idle") {
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
      {eventsState !== "idle" ? (
        <div className="popup-history">
          <h4>Site history</h4>
          {eventsState === "loading" ? <p>Loading history...</p> : null}
          {eventsState === "error" ? <p>History could not be loaded.</p> : null}
          {eventsState === "ready" && events.length === 0 ? <p>No events recorded.</p> : null}
          {eventsState === "ready" && events.length > 0 ? (
            <ol>
              {events.map((event) => (
                <li key={event.id}>
                  <time>{formatEventDate(event)}</time>
                  <strong>{EVENT_LABELS[event.eventType] ?? event.eventType}</strong>
                  {eventTitle(event) ? <span>{eventTitle(event)}</span> : null}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
      {html ? <div className="popup-body" dangerouslySetInnerHTML={{ __html: html }} /> : null}
    </div>
  );
}

export default function FeaturePopup({ feature, searchQuery }) {
  const [events, setEvents] = useState([]);
  const [eventsState, setEventsState] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    setEventsState("loading");
    fetchFeatureEvents(feature.id)
      .then((items) => {
        if (!cancelled) {
          setEvents(items);
          setEventsState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEvents([]);
          setEventsState("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [feature.id]);

  return <Popup maxWidth={380}>{buildPopupContent(feature.properties, searchQuery, events, eventsState)}</Popup>;
}
