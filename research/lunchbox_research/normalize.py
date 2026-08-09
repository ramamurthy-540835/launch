from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable

from .models import Place, UNKNOWN


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(character for character in value if not unicodedata.combining(character))
    return re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()


def dedupe_key(place: Place) -> tuple[str, str, str, str]:
    latitude = f"{place.latitude:.5f}" if place.latitude is not None else ""
    longitude = f"{place.longitude:.5f}" if place.longitude is not None else ""
    address = "" if place.address == UNKNOWN else normalize_text(place.address)
    return normalize_text(place.name), address, latitude, longitude


def _quality(place: Place) -> int:
    public_fields = (
        place.address,
        place.locality,
        place.pin_code,
        place.public_website,
        place.source_url,
    )
    return sum(value not in {"", UNKNOWN} for value in public_fields) + len(place.tags)


def deduplicate_places(places: Iterable[Place]) -> list[Place]:
    """Deduplicate on normalized name + address + five-decimal coordinates."""
    selected: dict[tuple[str, str, str, str], Place] = {}
    for place in places:
        key = dedupe_key(place)
        existing = selected.get(key)
        if existing is None or _quality(place) > _quality(existing):
            selected[key] = place
    return list(selected.values())
