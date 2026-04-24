import { useEffect, useState } from "react";
import { Popup } from "react-leaflet";
import { fetchFeatureEvents, fetchFeatureSnapshot } from "../../api.js";
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

function snapshotEntries(snapshot) {
  if (!snapshot) {
    return [];
  }

  return [
    snapshot.population?.value
      ? ["Population", `${snapshot.population.value}${snapshot.population.unit ? ` ${snapshot.population.unit}` : ""}`]
      : null,
    snapshot.theoPoliticalStatus ? ["Status", snapshot.theoPoliticalStatus] : null,
    snapshot.thematicAdmin?.theme ? ["Theme", snapshot.thematicAdmin.theme] : null,
    snapshot.politicalState?.toPolity ? ["Polity", snapshot.politicalState.toPolity] : null,
  ].filter(Boolean);
}

export function buildPopupContent(properties, searchQuery = "", events = [], eventsState = "idle", snapshot = null, snapshotState = "idle") {
  const html = highlightHtml(properties.descriptionHtml, searchQuery);
  const temporalEntries = [
    properties.validFrom ? ["Valid from", properties.validFrom] : null,
    properties.validTo ? ["Valid to", properties.validTo] : null,
  ].filter(Boolean);
  const metadataEntries = Object.entries(properties.metadata ?? {}).filter(
    ([key, value]) => value && key.toLowerCase() !== "summary",
  );
  const detailEntries = [...snapshotEntries(snapshot), ...temporalEntries, ...metadataEntries];
  const displayName = snapshot?.name || properties.name || "Untitled feature";

  return (
    <div className="popup-card">
      <h3>{displayName}</h3>
      {snapshotState === "error" ? <p className="popup-state-note">Date-resolved state could not be loaded.</p> : null}
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

export default function FeaturePopup({ feature, searchQuery, atDate }) {
  const [events, setEvents] = useState([]);
  const [eventsState, setEventsState] = useState("loading");
  const [snapshot, setSnapshot] = useState(feature.properties.snapshot ?? null);
  const [snapshotState, setSnapshotState] = useState(feature.properties.snapshot ? "ready" : "idle");

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

  useEffect(() => {
    let cancelled = false;
    if (!atDate) {
      setSnapshot(feature.properties.snapshot ?? null);
      setSnapshotState(feature.properties.snapshot ? "ready" : "idle");
      return () => {
        cancelled = true;
      };
    }

    if (feature.properties.snapshot?.atDate === atDate) {
      setSnapshot(feature.properties.snapshot);
      setSnapshotState("ready");
      return () => {
        cancelled = true;
      };
    }

    setSnapshotState("loading");
    fetchFeatureSnapshot(feature.id, atDate)
      .then((item) => {
        if (!cancelled) {
          setSnapshot(item);
          setSnapshotState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSnapshot(feature.properties.snapshot ?? null);
          setSnapshotState("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [atDate, feature.id, feature.properties.snapshot]);

  return (
    <Popup maxWidth={380}>
      {buildPopupContent(feature.properties, searchQuery, events, eventsState, snapshot, snapshotState)}
    </Popup>
  );
}
