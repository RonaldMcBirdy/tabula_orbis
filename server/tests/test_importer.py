from server.app.importer import CATEGORY_LABEL_OVERRIDES, CATEGORY_PARENT_MAPPING, collect_description_metadata, parse_color, slugify, strip_coordinates


def test_slugify_matches_frontend_asset_ids():
    assert slugify("- TOWNS") == "towns"
    assert slugify("ROADS & LANDMARKS") == "roads-landmarks"


def test_strip_coordinates_ignores_altitude():
    assert strip_coordinates("30.1,40.2,0 31.5,41.6,0") == [[30.1, 40.2], [31.5, 41.6]]


def test_parse_kml_color_to_css_hex():
    assert parse_color("77120000") == "#000012"


def test_collect_description_metadata_uses_first_three_lines():
    metadata = collect_description_metadata("<p>One</p>\n<p>Two</p>\n<p>Three</p>\n<p>Four</p>")
    assert metadata == {"Summary": "One | Two | Three"}


def test_taxonomy_maps_episcopal_to_ecclesiastical_layer():
    assert CATEGORY_PARENT_MAPPING["episcopal"][:2] == ("ecclesiastical", "Ecclesiastical")
    assert CATEGORY_LABEL_OVERRIDES["episcopal"] == "Episcopal Sees"
