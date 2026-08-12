from __future__ import annotations

import csv
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

from .models import Relationship, UNKNOWN

DATASET_COLUMNS = [
    "Apartment Name", "Address", "Locality", "PIN Code", "Latitude", "Longitude",
    "Nearby School", "School Distance KM", "School Type", "School Address",
    "Nearby School Count", "Apartment Size/Units", "Priority Score", "Public Website",
    "Google Maps URL", "Source URL", "Source Type", "Research Date",
    "Estimated Travel Distance KM", "Distance Method", "Gated/Community Status",
    "School Latitude", "School Longitude", "School Source URL", "School Source Type",
    "Apartment Official Public Phone", "Apartment Phone Source URL", "Apartment Contact Type",
    "Apartment Contact Verification", "School Official Public Phone", "School Phone Source URL",
    "School Contact Type", "School Contact Verification",
]

SUMMARY_COLUMNS = ["Locality", "Number of Schools", "Number of Apartments", "High Priority Apartments"]


def relationship_row(item: Relationship) -> dict[str, object]:
    apartment = item.apartment
    school = item.school
    return {
        "Apartment Name": apartment.name,
        "Address": apartment.address,
        "Locality": apartment.locality,
        "PIN Code": apartment.pin_code,
        "Latitude": apartment.latitude if apartment.latitude is not None else UNKNOWN,
        "Longitude": apartment.longitude if apartment.longitude is not None else UNKNOWN,
        "Nearby School": school.name,
        "School Distance KM": item.distance_km,
        "School Type": school.school_type,
        "School Address": school.address,
        "Nearby School Count": item.nearby_school_count,
        "Apartment Size/Units": apartment.units if apartment.units is not None else UNKNOWN,
        "Priority Score": item.priority_score,
        "Public Website": apartment.public_website,
        "Google Maps URL": apartment.google_maps_url,
        "Source URL": apartment.source_url,
        "Source Type": apartment.source_type,
        "Research Date": item.research_date,
        "Estimated Travel Distance KM": item.estimated_travel_km,
        "Distance Method": item.distance_method,
        "Gated/Community Status": apartment.gated_status,
        "School Latitude": school.latitude if school.latitude is not None else UNKNOWN,
        "School Longitude": school.longitude if school.longitude is not None else UNKNOWN,
        "School Source URL": school.source_url,
        "School Source Type": school.source_type,
        "Apartment Official Public Phone": apartment.public_phone,
        "Apartment Phone Source URL": apartment.phone_source_url,
        "Apartment Contact Type": apartment.contact_type,
        "Apartment Contact Verification": apartment.contact_verification,
        "School Official Public Phone": school.public_phone,
        "School Phone Source URL": school.phone_source_url,
        "School Contact Type": school.contact_type,
        "School Contact Verification": school.contact_verification,
    }


def write_csv(path: Path, rows: list[dict[str, object]], columns: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def write_xlsx(path: Path, sheets: list[tuple[str, list[str], list[dict[str, object]]]]) -> None:
    """Write a dependency-free OOXML workbook with inline strings."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", _content_types(len(sheets)))
        archive.writestr("_rels/.rels", _root_relationships())
        archive.writestr("docProps/app.xml", _app_properties(len(sheets), [name for name, _, _ in sheets]))
        archive.writestr("docProps/core.xml", _core_properties())
        archive.writestr("xl/workbook.xml", _workbook([name for name, _, _ in sheets]))
        archive.writestr("xl/_rels/workbook.xml.rels", _workbook_relationships(len(sheets)))
        for index, (_, columns, rows) in enumerate(sheets, start=1):
            values = [columns] + [[row.get(column, "") for column in columns] for row in rows]
            archive.writestr(f"xl/worksheets/sheet{index}.xml", _worksheet(values))


def _cell_reference(column: int, row: int) -> str:
    letters = ""
    while column:
        column, remainder = divmod(column - 1, 26)
        letters = chr(65 + remainder) + letters
    return f"{letters}{row}"


def _worksheet(rows: list[list[object]]) -> str:
    xml_rows: list[str] = []
    for row_index, row in enumerate(rows, start=1):
        cells: list[str] = []
        for column_index, value in enumerate(row, start=1):
            reference = _cell_reference(column_index, row_index)
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                cells.append(f'<c r="{reference}"><v>{value}</v></c>')
            else:
                text = escape(str(value or ""))
                cells.append(f'<c r="{reference}" t="inlineStr"><is><t xml:space="preserve">{text}</t></is></c>')
        xml_rows.append(f'<row r="{row_index}">{"".join(cells)}</row>')
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' \
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' \
        f'<sheetData>{"".join(xml_rows)}</sheetData></worksheet>'


def _content_types(sheet_count: int) -> str:
    sheets = "".join(
        f'<Override PartName="/xl/worksheets/sheet{index}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        for index in range(1, sheet_count + 1)
    )
    return '<?xml version="1.0" encoding="UTF-8"?>' \
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' \
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' \
        '<Default Extension="xml" ContentType="application/xml"/>' \
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' \
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' \
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' \
        f'{sheets}</Types>'


def _root_relationships() -> str:
    return '<?xml version="1.0" encoding="UTF-8"?>' \
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' \
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' \
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' \
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' \
        '</Relationships>'


def _workbook(names: list[str]) -> str:
    sheets = "".join(
        f'<sheet name="{escape(name)}" sheetId="{index}" r:id="rId{index}"/>'
        for index, name in enumerate(names, start=1)
    )
    return '<?xml version="1.0" encoding="UTF-8"?>' \
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' \
        f'<sheets>{sheets}</sheets></workbook>'


def _workbook_relationships(sheet_count: int) -> str:
    relationships = "".join(
        f'<Relationship Id="rId{index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{index}.xml"/>'
        for index in range(1, sheet_count + 1)
    )
    return '<?xml version="1.0" encoding="UTF-8"?>' \
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' \
        f'{relationships}</Relationships>'


def _core_properties() -> str:
    return '<?xml version="1.0" encoding="UTF-8"?>' \
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">' \
        '<dc:creator>LunchBox Research</dc:creator><dc:title>Schools and nearby apartments</dc:title></cp:coreProperties>'


def _app_properties(sheet_count: int, names: list[str]) -> str:
    titles = "".join(f'<vt:lpstr>{escape(name)}</vt:lpstr>' for name in names)
    return '<?xml version="1.0" encoding="UTF-8"?>' \
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' \
        f'<Application>LunchBox Research</Application><TitlesOfParts><vt:vector size="{sheet_count}" baseType="lpstr">{titles}</vt:vector></TitlesOfParts></Properties>'
