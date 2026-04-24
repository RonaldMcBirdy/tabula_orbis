from datetime import date

import pytest
from fastapi import HTTPException

from server.app.main import normalize_event_type, validate_event_dates, validate_event_payload


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
