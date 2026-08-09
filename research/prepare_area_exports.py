from __future__ import annotations

import csv
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import quote


REGIONS = ("North Chennai", "South Chennai", "West Chennai", "East-Central Chennai")
BASIS = "Operational coordinate grouping; not an official municipal boundary"


def region_for(latitude: float, longitude: float) -> str:
    if latitude >= 13.10:
        return "North Chennai"
    if latitude <= 13.00:
        return "South Chennai"
    if longitude <= 80.20:
        return "West Chennai"
    return "East-Central Chennai"


def map_formula(latitude: str, longitude: str, label: str) -> str:
    url = f"https://www.google.com/maps/search/?api=1&query={quote(latitude + ',' + longitude)}"
    return f'=HYPERLINK("{url}","{label}")'


def safe_excel_text(value: str) -> str:
    if value.startswith(("=", "+", "-", "@")):
        return "'" + value
    return value


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: prepare_area_exports.py INPUT.csv OUTPUT_DIR", file=sys.stderr)
        return 2
    source, output_dir = Path(sys.argv[1]), Path(sys.argv[2])
    output_dir.mkdir(parents=True, exist_ok=True)
    with source.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        source_columns = reader.fieldnames or []
        grouped: dict[str, list[dict[str, str]]] = {region: [] for region in REGIONS}
        for row in reader:
            latitude = float(row["Latitude"])
            longitude = float(row["Longitude"])
            region = region_for(latitude, longitude)
            cleaned = {key: safe_excel_text(value or "") for key, value in row.items()}
            cleaned["Operational Area"] = region
            cleaned["Area Classification Basis"] = BASIS
            cleaned["Apartment Map"] = map_formula(row["Latitude"], row["Longitude"], "Open apartment map")
            cleaned["School Map"] = map_formula(row["School Latitude"], row["School Longitude"], "Open school map")
            grouped[region].append(cleaned)

    columns = ["Operational Area", "Area Classification Basis", "Apartment Map", "School Map"] + source_columns
    summary_rows = []
    for region in REGIONS:
        rows = sorted(grouped[region], key=lambda row: (
            row.get("Locality", ""), row.get("Apartment Name", ""),
            float(row.get("School Distance KM", "999")), row.get("Nearby School", ""),
        ))
        path = output_dir / f"{region.lower().replace(' ', '-').replace('/', '-')}.csv"
        with path.open("w", newline="", encoding="utf-8-sig") as handle:
            writer = csv.DictWriter(handle, fieldnames=columns)
            writer.writeheader()
            writer.writerows(rows)
        apartments = {row["Apartment Name"] for row in rows}
        schools = {row["Nearby School"] for row in rows}
        phone_count = Counter(
            row["Apartment Name"] for row in rows
            if row.get("Apartment Official Public Phone") not in {"", "Not publicly available"}
        )
        summary_rows.append({
            "Operational Area": region,
            "Relationships": len(rows),
            "Unique Apartments": len(apartments),
            "Unique Schools": len(schools),
            "Apartments With Public Phone": len(phone_count),
            "Classification Basis": BASIS,
        })
        print(f"{region}: {len(rows)} relationships")
    summary_path = output_dir / "area-summary.csv"
    with summary_path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(summary_rows[0]))
        writer.writeheader()
        writer.writerows(summary_rows)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
