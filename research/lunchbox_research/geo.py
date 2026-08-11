from __future__ import annotations

from math import asin, cos, radians, sin, sqrt

EARTH_RADIUS_KM = 6371.0088


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return straight-line distance over the earth's surface in kilometres."""
    latitude_delta = radians(lat2 - lat1)
    longitude_delta = radians(lon2 - lon1)
    a = (
        sin(latitude_delta / 2) ** 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(longitude_delta / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * asin(sqrt(a))


def estimated_travel_km(straight_line_km: float, multiplier: float = 1.25) -> float:
    """Return an explicitly labelled estimate, never a claimed routed distance."""
    return straight_line_km * multiplier
