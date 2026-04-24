from datetime import date

import pytest
from fastapi import HTTPException

from server.app.main import normalize_territory_kind, parse_date_range_param, parse_iso_date, validate_feature_dates, validate_territory_dates


def test_parse_iso_date_accepts_empty_values():
    assert parse_iso_date(None, "at_date") is None
    assert parse_iso_date("", "at_date") is None


def test_parse_iso_date_rejects_non_iso_values():
    with pytest.raises(HTTPException):
        parse_iso_date("867", "at_date")


def test_parse_date_range_accepts_comma_or_dots():
    assert parse_date_range_param("0330-01-01,1453-05-29") == (
        date(330, 1, 1),
        date(1453, 5, 29),
    )
    assert parse_date_range_param("0867-01-01..1025-01-01") == (
        date(867, 1, 1),
        date(1025, 1, 1),
    )


def test_validate_feature_dates_rejects_reversed_range():
    with pytest.raises(HTTPException):
        validate_feature_dates(date(1453, 5, 29), date(330, 1, 1))


def test_validate_territory_dates_use_half_open_ranges():
    validate_territory_dates(date(867, 1, 1), date(1025, 1, 1))
    with pytest.raises(HTTPException):
        validate_territory_dates(date(867, 1, 1), date(867, 1, 1))


def test_normalize_territory_kind_accepts_phase_four_kinds():
    assert normalize_territory_kind("neighbour-state") == "neighbour_state"
    with pytest.raises(HTTPException):
        normalize_territory_kind("province")
