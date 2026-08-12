from __future__ import annotations

import csv
import html
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) not in {3, 4}:
        print("usage: render_citywide_pdf.py INPUT.csv OUTPUT.html [ROWS_PER_VOLUME]", file=sys.stderr)
        return 2
    source, destination = map(Path, sys.argv[1:3])
    destination.parent.mkdir(parents=True, exist_ok=True)
    with source.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        columns = reader.fieldnames or []
        rows = list(reader)

    priority = [
        "Apartment Name", "Address", "Locality", "PIN Code", "Nearby School",
        "School Distance KM", "Estimated Travel Distance KM", "School Type",
        "School Address", "Nearby School Count", "Apartment Size/Units", "Priority Score",
        "Apartment Official Public Phone", "School Official Public Phone",
    ]
    ordered = [column for column in priority if column in columns]
    ordered.extend(column for column in columns if column not in ordered)

    rows_per_volume = int(sys.argv[3]) if len(sys.argv) == 4 else len(rows)
    volume_count = (len(rows) + rows_per_volume - 1) // rows_per_volume
    for volume_index in range(volume_count):
        selected = rows[volume_index * rows_per_volume:(volume_index + 1) * rows_per_volume]
        volume_path = destination if volume_count == 1 else destination.with_name(
            f"{destination.stem}-Part-{volume_index + 1:02d}-of-{volume_count:02d}{destination.suffix}"
        )
        with volume_path.open("w", encoding="utf-8", newline="") as output:
            write_document(output, ordered, selected, len(rows), volume_index + 1, volume_count)
        print(f"HTML: {volume_path}")
    print(f"Rows: {len(rows)}")
    return 0


def write_document(output, ordered: list[str], rows: list[dict[str, str]], total_rows: int, volume: int, volume_count: int) -> None:
        output.write("""<!doctype html><html><head><meta charset="utf-8"><title>LunchBox Chennai School-Apartment Dataset</title>
<style>
@page { size: A2 landscape; margin: 10mm 8mm 12mm; }
* { box-sizing: border-box; } body { font-family: Arial, sans-serif; color:#15231d; margin:0; }
h1 { color:#174f3a; font-size:22pt; margin:0 0 3mm; } .meta { font-size:9pt; margin:0 0 5mm; }
table { border-collapse:collapse; width:100%; table-layout:fixed; font-size:4.8pt; }
thead { display:table-header-group; } tr { break-inside:avoid; }
th { background:#174f3a; color:white; border:0.2mm solid #557267; padding:1mm .6mm; vertical-align:bottom; overflow-wrap:anywhere; }
td { border:0.2mm solid #b6c4be; padding:.7mm .55mm; vertical-align:top; overflow-wrap:anywhere; }
tbody tr:nth-child(even) { background:#f1f6f3; }
.small { font-size:4.2pt; } .num { text-align:right; }
</style></head><body>""")
        output.write("<h1>LunchBox — Chennai Schools and Nearby Apartments</h1>")
        output.write(f'<p class="meta"><strong>Complete tabular export:</strong> {total_rows:,} school–apartment relationships. Volume {volume} of {volume_count}; this volume contains {len(rows):,} records. Research date: 8 August 2026. Distance is straight-line Haversine; estimated travel distance is explicitly labelled. Public phones may require official-site verification. No resident or child personal data is included.</p>')
        output.write("<table><thead><tr>")
        for column in ordered:
            output.write(f"<th>{html.escape(column)}</th>")
        output.write("</tr></thead><tbody>")
        numeric = {"School Distance KM", "Estimated Travel Distance KM", "Nearby School Count", "Apartment Size/Units", "Priority Score", "Latitude", "Longitude", "School Latitude", "School Longitude"}
        for row in rows:
            output.write("<tr>")
            for column in ordered:
                value = html.escape(row.get(column, "") or "")
                css = "num" if column in numeric else ("small" if "URL" in column or "Source" in column else "")
                output.write(f'<td class="{css}">{value}</td>')
            output.write("</tr>")
        output.write("</tbody></table></body></html>")


if __name__ == "__main__":
    raise SystemExit(main())
