from datetime import date

import pytest
from fastapi import HTTPException

from server.app.main import parse_date_range_param, parse_iso_date, validate_feature_dates


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
