import hashlib
import re
import shutil
import zipfile
from collections import Counter, defaultdict
from html import escape
from pathlib import Path
from typing import TYPE_CHECKING, Any
from xml.etree import ElementTree as ET

try:
    import bleach
except ModuleNotFoundError:
    bleach = None

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

ALLOWED_TAGS = [
    "a",
    "abbr",
    "b",
    "blockquote",
    "br",
    "code",
    "dd",
    "div",
    "dl",
    "dt",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "hr",
    "i",
    "li",
    "ol",
    "p",
    "small",
    "span",
    "strong",
    "sub",
    "sup",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "u",
    "ul",
]
ALLOWED_ATTRIBUTES = {"a": ["href", "target", "rel"], "*": ["class"]}

IMAGE_DIMENSIONS = {
    "images/icon-1.png": {"width": 42, "height": 42},
    "images/icon-2.png": {"width": 34, "height": 34},
    "images/icon-3.png": {"width": 42, "height": 42},
    "images/icon-4.png": {"width": 28, "height": 28},
    "images/icon-5.png": {"width": 26, "height": 26},
    "images/icon-6.png": {"width": 30, "height": 30},
    "images/icon-7.png": {"width": 40, "height": 40},
    "images/icon-8.png": {"width": 32, "height": 32},
    "images/icon-9.png": {"width": 30, "height": 30},
    "images/icon-10.png": {"width": 24, "height": 24},
    "images/icon-11.png": {"width": 24, "height": 24},
    "images/icon-12.png": {"width": 24, "height": 24},
    "images/icon-13.png": {"width": 36, "height": 36},
    "images/icon-14.png": {"width": 36, "height": 36},
    "images/icon-15.png": {"width": 24, "height": 24},
}

CATEGORY_PARENT_MAPPING = {
    "metropoleis": ("settlements", "Settlements", 10),
    "cities": ("settlements", "Settlements", 10),
    "towns": ("settlements", "Settlements", 10),
    "episcopal": ("ecclesiastical", "Ecclesiastical", 20),
    "churches": ("ecclesiastical", "Ecclesiastical", 20),
    "fortresses": ("fortifications", "Fortifications", 30),
    "castles": ("fortifications", "Fortifications", 30),
    "bridges": ("infrastructure", "Infrastructure", 40),
    "roads-landmarks": ("infrastructure", "Infrastructure", 40),
    "farmsteads": ("rural-sites", "Rural Sites", 50),
}

CATEGORY_LABEL_OVERRIDES = {
    "bridges": "Bridges",
    "castles": "Castles",
    "churches": "Churches",
    "cities": "Cities",
    "episcopal": "Episcopal Sees",
    "farmsteads": "Farmsteads",
    "fortresses": "Fortresses",
    "metropoleis": "Metropoleis",
    "roads-landmarks": "Roads & Landmarks",
    "towns": "Towns",
}


def clean_html(value: str | None) -> str:
    if bleach is None:
        return escape(value or "")
    return bleach.clean(
        value or "",
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        protocols=["http", "https", "mailto"],
        strip=True,
    )


def slugify(value: str) -> str:
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", value.lower()))


def strip_coordinates(input_value: str | None) -> list[list[float]]:
    if not input_value:
        return []
    output = []
    for coordinate_set in input_value.strip().split():
        parts = coordinate_set.split(",")[:2]
        if len(parts) != 2:
            continue
        try:
            longitude, latitude = float(parts[0]), float(parts[1])
        except ValueError:
            continue
        output.append([longitude, latitude])
    return output


def parse_color(value: str | None) -> str | None:
    if not value or len(value) != 8:
        return None
    return f"#{value[6:8]}{value[4:6]}{value[2:4]}".lower()


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def children(node: ET.Element, name: str | None = None) -> list[ET.Element]:
    items = list(node)
    if name is None:
        return items
    return [item for item in items if local_name(item.tag) == name]


def first_child(node: ET.Element, name: str) -> ET.Element | None:
    return next(iter(children(node, name)), None)


def child_text(node: ET.Element, name: str) -> str | None:
    child = first_child(node, name)
    return child.text.strip() if child is not None and child.text else None


def descendants(node: ET.Element, name: str) -> list[ET.Element]:
    return [item for item in node.iter() if local_name(item.tag) == name]


def parse_geometry(placemark: ET.Element) -> dict[str, Any] | None:
    point = first_child(placemark, "Point")
    if point is not None:
        coords = strip_coordinates(child_text(point, "coordinates"))
        return {"type": "Point", "coordinates": coords[0]} if coords else None

    line = first_child(placemark, "LineString")
    if line is not None:
        coords = strip_coordinates(child_text(line, "coordinates"))
        return {"type": "LineString", "coordinates": coords} if coords else None

    polygon = first_child(placemark, "Polygon")
    if polygon is not None:
        outer = first_child(first_child(polygon, "outerBoundaryIs") or polygon, "LinearRing")
        if outer is None:
            return None
        rings = [strip_coordinates(child_text(outer, "coordinates"))]
        for inner in children(polygon, "innerBoundaryIs"):
            ring = first_child(inner, "LinearRing")
            if ring is not None:
                rings.append(strip_coordinates(child_text(ring, "coordinates")))
        return {"type": "Polygon", "coordinates": rings}

    return None


def collect_description_metadata(description_html: str) -> dict[str, str]:
    if bleach is None:
        stripped = re.sub(r"<[^>]+>", "", description_html or "")
    else:
        stripped = bleach.clean(description_html or "", tags=[], attributes={}, strip=True)
    lines = [line.strip() for line in stripped.splitlines() if line.strip()]
    return {"Summary": " | ".join(lines[:3])} if lines else {}


def collect_styles(document: ET.Element) -> dict[str, dict[str, Any]]:
    styles: dict[str, dict[str, Any]] = {}
    for style in children(document, "Style"):
        style_id = style.attrib.get("id")
        if not style_id:
            continue
        icon_style = first_child(style, "IconStyle")
        line_style = first_child(style, "LineStyle")
        poly_style = first_child(style, "PolyStyle")
        icon = first_child(icon_style, "Icon") if icon_style is not None else None
        styles[style_id] = {
            "style_key": style_id,
            "icon_href": child_text(icon, "href") if icon is not None else None,
            "scale": float(child_text(icon_style, "scale") or 1) if icon_style is not None else 1,
            "stroke_color": parse_color(child_text(line_style, "color") if line_style is not None else None),
            "fill_color": parse_color(child_text(poly_style, "color") if poly_style is not None else None),
        }

    for style_map in children(document, "StyleMap"):
        map_id = style_map.attrib.get("id")
        if not map_id:
            continue
        pairs = children(style_map, "Pair")
        normal_pair = next((pair for pair in pairs if child_text(pair, "key") == "normal"), pairs[0] if pairs else None)
        style_url = child_text(normal_pair, "styleUrl") if normal_pair is not None else None
        referenced = styles.get((style_url or "").lstrip("#"), {})
        styles[map_id] = {**referenced, "style_key": map_id}
    return styles


def walk_folder(
    folder: ET.Element,
    top_level_name: str | None,
    output: dict[str, list[dict[str, Any]]],
    styles: dict[str, dict[str, Any]],
) -> None:
    category_name = top_level_name or child_text(folder, "name") or "Uncategorized"
    for placemark in children(folder, "Placemark"):
        geometry = parse_geometry(placemark)
        if geometry is None:
            continue
        style_key = (child_text(placemark, "styleUrl") or "").lstrip("#")
        style = styles.get(style_key, {})
        description_html = clean_html(child_text(placemark, "description"))
        output[category_name].append(
            {
                "id": placemark.attrib.get("id") or f"{slugify(category_name)}-{len(output[category_name]) + 1}",
                "geometry": geometry,
                "name": child_text(placemark, "name") or "Untitled feature",
                "style_key": style_key,
                "description_html": description_html,
                "metadata": collect_description_metadata(description_html),
                "stroke_color": style.get("stroke_color"),
                "fill_color": style.get("fill_color"),
            }
        )

    for child_folder in children(folder, "Folder"):
        walk_folder(child_folder, category_name, output, styles)


def parse_kmz(kmz_path: str | Path) -> dict[str, Any]:
    kmz_path = Path(kmz_path)
    with zipfile.ZipFile(kmz_path) as archive:
        with archive.open("doc.kml") as doc_file:
            root = ET.fromstring(doc_file.read())

    document = next((item for item in root.iter() if local_name(item.tag) == "Document"), None)
    if document is None:
        raise ValueError("Could not locate the KML Document node.")

    styles = collect_styles(document)
    features_by_category: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for folder in children(document, "Folder"):
        walk_folder(folder, child_text(folder, "name") or "Uncategorized", features_by_category, styles)

    return {
        "title": child_text(document, "name") or "KMZ Atlas",
        "description_html": clean_html(child_text(document, "description")),
        "styles": styles,
        "features_by_category": dict(features_by_category),
    }


def file_checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def copy_icons(kmz_path: Path, styles: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    from server.app.config import get_settings

    settings = get_settings()
    output_dir = Path(settings.atlas_icon_output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(kmz_path) as archive:
        for entry in archive.namelist():
            if not entry.startswith("images/") or entry.endswith("/"):
                continue
            target = output_dir / Path(entry).name
            with archive.open(entry) as source, target.open("wb") as destination:
                shutil.copyfileobj(source, destination)

    icon_records: dict[str, dict[str, Any]] = {}
    for style_key, style in styles.items():
        icon_href = style.get("icon_href")
        if not icon_href:
            continue
        normalized_href = icon_href.replace("\\", "/")
        dimensions = IMAGE_DIMENSIONS.get(normalized_href, {"width": 32, "height": 32})
        icon_records[style_key] = {
            "icon_path": f"{settings.atlas_icon_public_path}/{Path(normalized_href).name}",
            "width": dimensions["width"],
            "height": dimensions["height"],
        }
    return icon_records


def import_kmz(session: "Session", kmz_path: str | Path | None = None) -> dict[str, int]:
    from sqlalchemy import delete, select

    from server.app.config import get_settings
    from server.app.geojson import geojson_to_wkt_expression
    from server.app.models import AtlasSource, Category, Feature, FeatureMetadata, Style

    settings = get_settings()
    source_path = Path(kmz_path or settings.kmz_path)
    parsed = parse_kmz(source_path)
    checksum = file_checksum(source_path)
    icon_records = copy_icons(source_path, parsed["styles"])

    existing_source = session.scalar(select(AtlasSource).where(AtlasSource.checksum == checksum))
    if existing_source is not None:
        session.execute(delete(FeatureMetadata).where(FeatureMetadata.feature_id.in_(select(Feature.id).where(Feature.source_id == existing_source.id))))
        session.execute(delete(Feature).where(Feature.source_id == existing_source.id))
        session.delete(existing_source)
        session.flush()

    source = AtlasSource(
        filename=str(source_path.as_posix()),
        checksum=checksum,
        title=parsed["title"],
        description_html=parsed["description_html"],
    )
    session.add(source)
    session.flush()

    style_models: dict[str, Style] = {}
    for style_key, style in parsed["styles"].items():
        model = session.scalar(select(Style).where(Style.style_key == style_key)) or Style(style_key=style_key)
        icon_record = icon_records.get(style_key, {})
        model.icon_path = icon_record.get("icon_path")
        model.scale = style.get("scale") or 1
        model.width = icon_record.get("width", 32)
        model.height = icon_record.get("height", 32)
        model.stroke_color = style.get("stroke_color")
        model.fill_color = style.get("fill_color")
        session.add(model)
        style_models[style_key] = model
    session.flush()

    categories: dict[str, Category] = {}
    for order, (category_name, features) in enumerate(parsed["features_by_category"].items()):
        slug = slugify(category_name)
        parent = None
        if slug in CATEGORY_PARENT_MAPPING:
            parent_slug, parent_label, parent_order = CATEGORY_PARENT_MAPPING[slug]
            parent = session.scalar(select(Category).where(Category.slug == parent_slug)) or Category(slug=parent_slug)
            parent.label = parent_label
            parent.default_visible = True
            parent.display_order = parent_order
            parent.legend_style_key = None
            session.add(parent)
            session.flush()
        icon_counts = Counter(feature["style_key"] for feature in features if feature["style_key"])
        category = session.scalar(select(Category).where(Category.slug == slug)) or Category(slug=slug)
        category.parent = parent
        category.label = CATEGORY_LABEL_OVERRIDES.get(slug, category_name)
        category.default_visible = True
        category.display_order = order
        category.legend_style_key = icon_counts.most_common(1)[0][0] if icon_counts else None
        session.add(category)
        categories[category_name] = category
    session.flush()

    feature_count = 0
    for category_name, features in parsed["features_by_category"].items():
        category = categories[category_name]
        for item in features:
            style = style_models.get(item["style_key"])
            feature = Feature(
                id=item["id"],
                source_id=source.id,
                category_id=category.id,
                style_id=style.id if style else None,
                name=item["name"],
                description_html=item["description_html"],
                geometry=geojson_to_wkt_expression(item["geometry"]),
                geometry_type=item["geometry"]["type"],
            )
            session.add(feature)
            for key, value in item["metadata"].items():
                session.add(FeatureMetadata(feature_id=feature.id, key=key, value=value))
            feature_count += 1

    session.commit()
    return {"categories": len(categories), "features": feature_count, "styles": len(style_models)}
