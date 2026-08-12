from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .audit import AuditLog
from .exporters import DATASET_COLUMNS, SUMMARY_COLUMNS, relationship_row, write_csv, write_xlsx
from .http_client import ResearchHttpClient
from .normalize import deduplicate_places
from .pipeline import locality_summary, match_and_rank, validate_places
from .providers import FixtureProvider, OverpassProvider, load_schools_csv
from .storage import upload_files

DEFAULT_CONFIG = Path(__file__).resolve().parents[1] / "config.example.json"
DEFAULT_FIXTURE = Path(__file__).resolve().parents[1] / "sample" / "fixture.json"


def parser() -> argparse.ArgumentParser:
    command = argparse.ArgumentParser(description="Find public apartment/community locations near schools.")
    command.add_argument("--city", default="Chennai", help="City name; defaults to Chennai.")
    command.add_argument("--locality", help="Optional pilot locality within the city.")
    command.add_argument("--center-lat", type=float, help="Neighbourhood centre latitude for non-administrative localities.")
    command.add_argument("--center-lon", type=float, help="Neighbourhood centre longitude for non-administrative localities.")
    command.add_argument("--school-search-radius", type=float, default=5.0, help="School discovery radius around the supplied centre, in km.")
    command.add_argument("--schools", type=Path, help="CSV containing explicit schools and coordinates.")
    command.add_argument("--radius", type=float, default=3.0, help="Maximum straight-line radius in km (0.1–10).")
    command.add_argument("--provider", choices=("osm", "fixture"), default="osm")
    command.add_argument("--fixture", type=Path, default=DEFAULT_FIXTURE, help="Offline fixture JSON path.")
    command.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    command.add_argument("--output-dir", type=Path, default=Path("output"))
    command.add_argument("--max-schools", type=int, help="Override configured school limit.")
    command.add_argument("--bulk-bbox", help="Bulk mode bbox as south,west,north,east; avoids one apartment request per school.")
    command.add_argument("--max-apartments", type=int, default=10000, help="Maximum named residential places in bulk mode.")
    command.add_argument("--no-gcs-upload", action="store_true", help="Keep outputs local only for offline/testing runs.")
    return command


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    if not 0.1 <= args.radius <= 10:
        print("error: --radius must be between 0.1 and 10 km", file=sys.stderr)
        return 2
    if (args.center_lat is None) != (args.center_lon is None):
        print("error: --center-lat and --center-lon must be provided together", file=sys.stderr)
        return 2
    if args.center_lat is not None and not (-90 <= args.center_lat <= 90 and -180 <= args.center_lon <= 180):
        print("error: centre coordinates are outside valid latitude/longitude ranges", file=sys.stderr)
        return 2
    config = json.loads(args.config.read_text(encoding="utf-8"))
    max_schools = args.max_schools or int(config.get("max_schools", 25))
    bbox = None
    if args.bulk_bbox:
        try:
            values = tuple(float(value.strip()) for value in args.bulk_bbox.split(","))
            if len(values) != 4:
                raise ValueError
            south, west, north, east = values
            if not (-90 <= south < north <= 90 and -180 <= west < east <= 180):
                raise ValueError
            bbox = (south, west, north, east)
        except ValueError:
            print("error: --bulk-bbox must be south,west,north,east with valid bounds", file=sys.stderr)
            return 2
    audit = AuditLog()

    if args.provider == "fixture":
        provider = FixtureProvider(args.fixture, audit)
    else:
        client = ResearchHttpClient(
            audit=audit,
            user_agent=str(config["user_agent"]),
            min_interval_seconds=float(config.get("rate_limit_seconds", 2.0)),
            timeout_seconds=int(config.get("timeout_seconds", 60)),
            retries=int(config.get("retries", 3)),
        )
        provider = OverpassProvider(client, str(config["overpass_endpoint"]))

    try:
        if bbox:
            schools = provider.discover_schools_bbox(bbox, max_schools)
        elif args.schools:
            schools = load_schools_csv(args.schools, audit)
        elif args.center_lat is not None and args.center_lon is not None:
            schools = provider.discover_schools_near(
                args.center_lat, args.center_lon, args.school_search_radius,
                args.locality or args.city, max_schools,
            )
        else:
            schools = provider.discover_schools(args.city, args.locality, max_schools)
        schools = deduplicate_places(schools)
        validate_places(schools, "school")
        if not schools:
            raise RuntimeError("No valid schools were found. Provide --schools or choose a more specific locality.")

        collected_apartments = []
        if bbox:
            collected_apartments = provider.discover_apartments_bbox(bbox, args.max_apartments)
        else:
            for school in schools:
                try:
                    collected_apartments.extend(provider.find_apartments(school, args.radius))
                except RuntimeError as error:
                    print(f"warning: apartment lookup failed for {school.name}: {error}", file=sys.stderr)
        apartments = deduplicate_places(collected_apartments)
        relationships = match_and_rank(schools, apartments, args.radius)
        dataset_rows = [relationship_row(item) for item in relationships]
        summary_rows = locality_summary(relationships)

        output = args.output_dir
        output.mkdir(parents=True, exist_ok=True)
        csv_path = output / "apartments_near_schools.csv"
        xlsx_path = output / "apartments_near_schools.xlsx"
        summary_path = output / "locality_summary.csv"
        audit_path = output / "research_log.csv"
        write_csv(csv_path, dataset_rows, DATASET_COLUMNS)
        write_csv(summary_path, summary_rows, SUMMARY_COLUMNS)
        write_xlsx(xlsx_path, [
            ("Apartment relationships", DATASET_COLUMNS, dataset_rows),
            ("Locality summary", SUMMARY_COLUMNS, summary_rows),
        ])
        audit.write(audit_path)
        gcs_destination = ""
        upload_config = config.get("gcs_upload", {})
        if bool(upload_config.get("enabled", False)) and not args.no_gcs_upload:
            try:
                gcs_destination = upload_files(
                    [csv_path, xlsx_path, summary_path, audit_path],
                    bucket=str(upload_config["bucket"]),
                    prefix=str(upload_config.get("prefix", "marketing/research/runs")),
                    project=str(upload_config["project"]),
                )
            except (OSError, RuntimeError, ValueError, KeyError) as error:
                print(f"error: local outputs were saved, but GCS upload failed: {error}", file=sys.stderr)
                return 1
        print(f"Schools: {len(schools)}")
        print(f"Unique apartments: {len(apartments)}")
        print(f"Relationships: {len(relationships)}")
        print(f"CSV: {csv_path}")
        print(f"Excel: {xlsx_path}")
        print(f"Audit: {audit_path}")
        if gcs_destination:
            print(f"GCS: {gcs_destination}")
        return 0
    except (OSError, ValueError, RuntimeError, KeyError, json.JSONDecodeError) as error:
        args.output_dir.mkdir(parents=True, exist_ok=True)
        audit.write(args.output_dir / "research_log.csv")
        print(f"error: {error}", file=sys.stderr)
        return 1
