from __future__ import annotations

import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol

from .audit import AuditLog
from .http_client import ResearchHttpClient
from .models import AuditEvent, Place, UNKNOWN


class PlaceProvider(Protocol):
    def discover_schools(self, city: str, locality: str | None, max_schools: int) -> list[Place]: ...
    def discover_schools_near(self, latitude: float, longitude: float, radius_km: float, locality: str, max_schools: int) -> list[Place]: ...
    def find_apartments(self, school: Place, radius_km: float) -> list[Place]: ...
    def discover_schools_bbox(self, bbox: tuple[float, float, float, float], max_schools: int) -> list[Place]: ...
    def discover_apartments_bbox(self, bbox: tuple[float, float, float, float], max_apartments: int) -> list[Place]: ...


def _value(row: dict[str, str], *names: str) -> str:
    lowered = {key.strip().casefold(): (value or "").strip() for key, value in row.items()}
    for name in names:
        value = lowered.get(name.casefold(), "")
        if value:
            return value
    return ""


def _float(value: str) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def load_schools_csv(path: Path, audit: AuditLog) -> list[Place]:
    schools: list[Place] = []
    with path.open(newline="", encoding="utf-8-sig") as handle:
        for index, row in enumerate(csv.DictReader(handle), start=2):
            source_url = _value(row, "Source URL", "source_url") or path.resolve().as_uri()
            school = Place(
                kind="school",
                name=_value(row, "School Name", "Name", "school_name") or UNKNOWN,
                address=_value(row, "School Address", "Address", "address") or UNKNOWN,
                locality=_value(row, "Locality", "locality") or UNKNOWN,
                pin_code=_value(row, "PIN Code", "Pincode", "pin_code") or UNKNOWN,
                latitude=_float(_value(row, "Latitude", "latitude")),
                longitude=_float(_value(row, "Longitude", "longitude")),
                school_type=_value(row, "School Type", "Board", "school_type") or UNKNOWN,
                public_website=_value(row, "Public Website", "Website", "website") or UNKNOWN,
                google_maps_url=_value(row, "Google Maps URL", "google_maps_url") or UNKNOWN,
                public_phone=_value(row, "Official Public Phone", "Phone", "public_phone") or UNKNOWN,
                phone_source_url=_value(row, "Phone Source URL", "phone_source_url") or UNKNOWN,
                contact_type=_value(row, "Contact Type", "contact_type") or "Official school office",
                contact_verification=_value(row, "Contact Verification", "contact_verification") or UNKNOWN,
                source_url=source_url,
                source_type=_value(row, "Source Type", "source_type") or "User-supplied CSV",
                source_id=f"csv-school-{index}",
            )
            errors = school.validate()
            if errors:
                raise ValueError(f"Invalid school on CSV row {index}: {', '.join(errors)}")
            schools.append(school)
    audit.add(AuditEvent(
        timestamp_utc=datetime.now(timezone.utc).isoformat(), provider="CSV", operation="load_schools",
        source_url=path.resolve().as_uri(), query_summary=path.name, status="success", attempt=1,
        result_count=len(schools),
    ))
    return schools


class OverpassProvider:
    def __init__(self, client: ResearchHttpClient, endpoint: str) -> None:
        self.client = client
        self.endpoint = endpoint

    def discover_schools(self, city: str, locality: str | None, max_schools: int) -> list[Place]:
        area_name = locality or city
        escaped = area_name.replace('"', '\\"')
        query = (
            "[out:json][timeout:60];"
            f'area["name"="{escaped}"]["boundary"="administrative"]->.searchArea;'
            '(nwr["amenity"="school"](area.searchArea););'
            f"out tags center {max_schools};"
        )
        data = self.client.post_form_json(
            self.endpoint, {"data": query}, "OpenStreetMap/Overpass", "discover_schools",
            f"amenity=school in {area_name}, {city}; max={max_schools}",
        )
        return [place for element in data.get("elements", []) if (place := self._place(element, "school", locality or city))]

    def find_apartments(self, school: Place, radius_km: float) -> list[Place]:
        if school.latitude is None or school.longitude is None:
            return []
        metres = round(radius_km * 1000)
        around = f"(around:{metres},{school.latitude},{school.longitude})"
        query = (
            "[out:json][timeout:60];("
            f'nwr{around}["building"="apartments"]["name"];'
            f'nwr{around}["residential"="complex"]["name"];'
            f'nwr{around}["residential"="gated"]["name"];'
            f'nwr{around}["landuse"="residential"]["name"];'
            f'nwr{around}["place"="neighbourhood"]["name"];'
            ");out tags center 200;"
        )
        data = self.client.post_form_json(
            self.endpoint, {"data": query}, "OpenStreetMap/Overpass", "find_apartments",
            f"named residential communities within {radius_km:g} km of {school.name}",
        )
        return [place for element in data.get("elements", []) if (place := self._place(element, "apartment", school.locality))]

    def discover_schools_near(self, latitude: float, longitude: float, radius_km: float, locality: str, max_schools: int) -> list[Place]:
        metres = round(radius_km * 1000)
        query = (
            "[out:json][timeout:60];"
            f'(nwr(around:{metres},{latitude},{longitude})["amenity"="school"];);'
            f"out tags center {max_schools};"
        )
        data = self.client.post_form_json(
            self.endpoint, {"data": query}, "OpenStreetMap/Overpass", "discover_schools_near",
            f"amenity=school within {radius_km:g} km of {latitude},{longitude} ({locality}); max={max_schools}",
        )
        return [place for element in data.get("elements", []) if (place := self._place(element, "school", locality))]

    def discover_schools_bbox(self, bbox: tuple[float, float, float, float], max_schools: int) -> list[Place]:
        bounds = ",".join(f"{value:g}" for value in bbox)
        query = f'[out:json][timeout:180];nwr["amenity"="school"]({bounds});out tags center {max_schools};'
        data = self.client.post_form_json(
            self.endpoint, {"data": query}, "OpenStreetMap/Overpass", "discover_schools_bbox",
            f"amenity=school in bbox {bounds}; max={max_schools}",
        )
        return [place for element in data.get("elements", []) if (place := self._place(element, "school", "Chennai"))]

    def discover_apartments_bbox(self, bbox: tuple[float, float, float, float], max_apartments: int) -> list[Place]:
        bounds = ",".join(f"{value:g}" for value in bbox)
        query = (
            "[out:json][timeout:180];("
            f'nwr["building"="apartments"]["name"]({bounds});'
            f'nwr["residential"~"^(complex|gated)$"]["name"]({bounds});'
            f'nwr["landuse"="residential"]["name"]({bounds});'
            f'nwr["place"="neighbourhood"]["name"]({bounds});'
            f");out tags center {max_apartments};"
        )
        data = self.client.post_form_json(
            self.endpoint, {"data": query}, "OpenStreetMap/Overpass", "discover_apartments_bbox",
            f"named apartment/residential communities in bbox {bounds}; max={max_apartments}",
        )
        return [place for element in data.get("elements", []) if (place := self._place(element, "apartment", "Chennai"))]

    @staticmethod
    def _place(element: dict[str, Any], kind: str, fallback_locality: str) -> Place | None:
        tags = element.get("tags", {})
        name = str(tags.get("name", "")).strip()
        coordinates = element if "lat" in element else element.get("center", {})
        latitude = coordinates.get("lat")
        longitude = coordinates.get("lon")
        if not name or latitude is None or longitude is None:
            return None
        locality = str(
            tags.get("addr:suburb") or tags.get("addr:neighbourhood")
            or tags.get("addr:city_district") or fallback_locality or UNKNOWN
        )
        address_parts = [
            tags.get("addr:housenumber"), tags.get("addr:street"), tags.get("addr:suburb"),
            tags.get("addr:city"), tags.get("addr:postcode"),
        ]
        address = ", ".join(str(part) for part in address_parts if part) or UNKNOWN
        element_type = str(element.get("type", "node"))
        element_id = str(element.get("id", ""))
        source_url = f"https://www.openstreetmap.org/{element_type}/{element_id}"
        website = str(tags.get("contact:website") or tags.get("website") or UNKNOWN)
        public_phone = str(tags.get("contact:phone") or tags.get("phone") or UNKNOWN)
        phone_source_url = source_url if public_phone != UNKNOWN else UNKNOWN
        contact_type = "Official school office" if kind == "school" else "Public management/developer office"
        contact_verification = (
            "Publicly listed in OpenStreetMap; verify against official website before outreach"
            if public_phone != UNKNOWN else UNKNOWN
        )
        units = _parse_units(tags)
        gated = _gated_status(tags) if kind == "apartment" else UNKNOWN
        school_type = _school_type(tags) if kind == "school" else UNKNOWN
        return Place(
            kind=kind, name=name, address=address, locality=locality,
            pin_code=str(tags.get("addr:postcode") or UNKNOWN), latitude=float(latitude),
            longitude=float(longitude), school_type=school_type, units=units,
            gated_status=gated, public_website=website, google_maps_url=UNKNOWN,
            public_phone=public_phone, phone_source_url=phone_source_url,
            contact_type=contact_type, contact_verification=contact_verification,
            source_url=source_url, source_type="OpenStreetMap/Overpass",
            source_id=f"osm-{element_type}-{element_id}", tags=tags,
        )


class FixtureProvider:
    """Deterministic offline provider for examples and tests; never presented as verified research."""

    def __init__(self, path: Path, audit: AuditLog) -> None:
        self.path = path
        self.audit = audit
        self.data = json.loads(path.read_text(encoding="utf-8"))
        notice = str(self.data.get("notice", "")).casefold()
        self.provider_name = "Synthetic fixture" if "synthetic" in notice else "Curated fixture JSON"

    def discover_schools(self, city: str, locality: str | None, max_schools: int) -> list[Place]:
        schools = [self._place(item, "school") for item in self.data.get("schools", [])][:max_schools]
        self._log("discover_schools", f"synthetic fixture for {locality or city}", len(schools))
        return schools

    def find_apartments(self, school: Place, radius_km: float) -> list[Place]:
        apartments = [self._place(item, "apartment") for item in self.data.get("apartments", [])]
        self._log("find_apartments", f"synthetic fixture within {radius_km:g} km of {school.name}", len(apartments))
        return apartments

    def discover_schools_near(self, latitude: float, longitude: float, radius_km: float, locality: str, max_schools: int) -> list[Place]:
        return self.discover_schools(locality, locality, max_schools)

    def discover_schools_bbox(self, bbox: tuple[float, float, float, float], max_schools: int) -> list[Place]:
        return self.discover_schools("Chennai", None, max_schools)

    def discover_apartments_bbox(self, bbox: tuple[float, float, float, float], max_apartments: int) -> list[Place]:
        apartments = [self._place(item, "apartment") for item in self.data.get("apartments", [])][:max_apartments]
        self._log("discover_apartments_bbox", f"fixture bbox {bbox}", len(apartments))
        return apartments

    def _place(self, item: dict[str, Any], kind: str) -> Place:
        return Place(kind=kind, **item)

    def _log(self, operation: str, summary: str, count: int) -> None:
        self.audit.add(AuditEvent(
            timestamp_utc=datetime.now(timezone.utc).isoformat(), provider=self.provider_name,
            operation=operation, source_url=self.path.resolve().as_uri(), query_summary=summary,
            status="success", attempt=1, result_count=count,
        ))


def _parse_units(tags: dict[str, Any]) -> int | None:
    for key in ("building:units", "apartments", "units"):
        value = str(tags.get(key, ""))
        match = re.search(r"\d+", value)
        if match:
            return int(match.group())
    return None


def _gated_status(tags: dict[str, Any]) -> str:
    if tags.get("residential") == "gated" or tags.get("access") == "private":
        return "Publicly tagged as gated/private-access community"
    if tags.get("residential") == "complex":
        return "Publicly tagged as residential complex"
    return UNKNOWN


def _school_type(tags: dict[str, Any]) -> str:
    for key in ("school:board", "board", "operator:type", "school:type"):
        value = str(tags.get(key, "")).strip()
        if value:
            return value
    return UNKNOWN
