from datetime import date, datetime, timezone

import pytest
from fastapi import HTTPException

from server.app.main import normalize_event_type, resolve_feature_snapshot, validate_event_dates, validate_event_payload
from server.app.models import Feature, FeatureEvent


def test_normalize_event_type_accepts_known_values():
    assert normalize_event_type(" Name_Change ") == "name_change"


def test_normalize_event_type_rejects_unknown_values():
    with pytest.raises(HTTPException):
        normalize_event_type("coronation")


def test_validate_event_dates_rejects_reversed_ranges():
    with pytest.raises(HTTPException):
        validate_event_dates(date(1204, 4, 13), date(867, 1, 1))


def test_validate_event_payload_allows_type_specific_source_fields():
    payload = validate_event_payload(
        "name_change",
        {"old_name": "Byzantion", "new_name": "Constantinople", "source_title": "Chronicle"},
    )
    assert payload["new_name"] == "Constantinople"


def test_validate_event_payload_rejects_unknown_keys():
    with pytest.raises(HTTPException):
        validate_event_payload("population", {"unsupported": "value"})


def make_feature() -> Feature:
    return Feature(id="feature-constantinople", category_id=1, name="Byzantion", description_html="", geometry_type="Point")


def make_event(event_id: str, event_type: str, start: date, payload: dict, end: date | None = None, updated: int = 1) -> FeatureEvent:
    event = FeatureEvent(
        id=event_id,
        feature_id="feature-constantinople",
        event_type=event_type,
        start_date=start,
        end_date=end,
        payload_json=payload,
    )
    event.updated_at = datetime(2026, 1, updated, tzinfo=timezone.utc)
    return event


def test_resolve_feature_snapshot_uses_latest_applicable_name_change():
    snapshot = resolve_feature_snapshot(
        make_feature(),
        [
            make_event("event-1", "name_change", date(330, 5, 11), {"new_name": "Constantinople"}),
            make_event("event-2", "name_change", date(1204, 4, 13), {"new_name": "Latin Constantinople"}),
        ],
        date(867, 1, 1),
    )

    assert snapshot.name == "Constantinople"
    assert [event.id for event in snapshot.appliedEvents] == ["event-1"]


def test_resolve_feature_snapshot_prefers_latest_update_for_tied_events():
    snapshot = resolve_feature_snapshot(
        make_feature(),
        [
            make_event("event-1", "population", date(900, 1, 1), {"value": 100000}, updated=1),
            make_event("event-2", "population", date(900, 1, 1), {"value": 125000}, updated=2),
        ],
        date(900, 1, 1),
    )

    assert snapshot.population == {"value": 125000}
    assert snapshot.appliedEvents[0].id == "event-2"


def test_resolve_feature_snapshot_respects_ranged_event_end_dates():
    snapshot = resolve_feature_snapshot(
        make_feature(),
        [
            make_event(
                "event-1",
                "theo_political_status",
                date(1000, 1, 1),
                {"status": "Metropolis"},
                end=date(1025, 12, 31),
            ),
        ],
        date(1030, 1, 1),
    )

    assert snapshot.theoPoliticalStatus is None
    assert snapshot.appliedEvents == []


def test_resolve_feature_snapshot_resolves_admin_and_political_state():
    snapshot = resolve_feature_snapshot(
        make_feature(),
        [
            make_event("event-1", "thematic_admin", date(867, 1, 1), {"theme": "Thracesian", "administrative_unit": "theme"}),
            make_event("event-2", "conquest", date(1204, 4, 13), {"from_polity": "Byzantine Empire", "to_polity": "Latin Empire", "actor": "Fourth Crusade"}),
            make_event("event-3", "loss", date(1261, 7, 25), {"from_polity": "Latin Empire", "to_polity": "Byzantine Empire", "actor": "Nicaea"}),
        ],
        date(1262, 1, 1),
    )

    assert snapshot.thematicAdmin == {"theme": "Thracesian", "administrative_unit": "theme"}
    assert snapshot.politicalState == {
        "eventType": "loss",
        "fromPolity": "Latin Empire",
        "toPolity": "Byzantine Empire",
        "actor": "Nicaea",
    }
