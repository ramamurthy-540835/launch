from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

UNKNOWN = "Not publicly available"


@dataclass(slots=True)
class Place:
    kind: str
    name: str
    address: str = UNKNOWN
    locality: str = UNKNOWN
    pin_code: str = UNKNOWN
    latitude: float | None = None
    longitude: float | None = None
    school_type: str = UNKNOWN
    units: int | None = None
    gated_status: str = UNKNOWN
    public_website: str = UNKNOWN
    google_maps_url: str = UNKNOWN
    public_phone: str = UNKNOWN
    phone_source_url: str = UNKNOWN
    contact_type: str = UNKNOWN
    contact_verification: str = UNKNOWN
    source_url: str = UNKNOWN
    source_type: str = UNKNOWN
    source_id: str = ""
    tags: dict[str, Any] = field(default_factory=dict, repr=False)

    def validate(self) -> list[str]:
        errors: list[str] = []
        if self.kind not in {"school", "apartment"}:
            errors.append("kind must be school or apartment")
        if not self.name.strip() or self.name == UNKNOWN:
            errors.append("name is required")
        if self.latitude is None or not -90 <= self.latitude <= 90:
            errors.append("latitude must be between -90 and 90")
        if self.longitude is None or not -180 <= self.longitude <= 180:
            errors.append("longitude must be between -180 and 180")
        if self.source_url == UNKNOWN:
            errors.append("source URL is required")
        return errors


@dataclass(slots=True)
class Relationship:
    apartment: Place
    school: Place
    distance_km: float
    estimated_travel_km: float
    distance_method: str
    nearby_school_count: int
    priority_score: int
    research_date: str = field(default_factory=lambda: date.today().isoformat())


@dataclass(slots=True)
class AuditEvent:
    timestamp_utc: str
    provider: str
    operation: str
    source_url: str
    query_summary: str
    status: str
    attempt: int
    result_count: int = 0
    duration_ms: int = 0
    error: str = ""
