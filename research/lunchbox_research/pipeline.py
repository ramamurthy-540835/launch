from __future__ import annotations

from collections import defaultdict

from .geo import estimated_travel_km, haversine_km
from .models import Place, Relationship, UNKNOWN
from .normalize import deduplicate_places


def validate_places(places: list[Place], label: str) -> None:
    failures: list[str] = []
    for index, place in enumerate(places, start=1):
        errors = place.validate()
        if errors:
            failures.append(f"{label} {index} ({place.name}): {', '.join(errors)}")
    if failures:
        raise ValueError("; ".join(failures))


def match_and_rank(schools: list[Place], apartments: list[Place], radius_km: float) -> list[Relationship]:
    validate_places(schools, "school")
    apartments = deduplicate_places(apartments)
    validate_places(apartments, "apartment")
    distances: dict[str, list[tuple[Place, float]]] = defaultdict(list)
    for apartment in apartments:
        for school in schools:
            distance = haversine_km(
                apartment.latitude or 0, apartment.longitude or 0,
                school.latitude or 0, school.longitude or 0,
            )
            if distance <= radius_km:
                distances[apartment.source_id or apartment.name].append((school, distance))

    relationships: list[Relationship] = []
    for apartment in apartments:
        matches = distances.get(apartment.source_id or apartment.name, [])
        if not matches:
            continue
        within_three_count = sum(distance <= 3.0 for _, distance in matches)
        nearest = min(distance for _, distance in matches)
        score = priority_score(apartment, nearest, within_three_count)
        for school, distance in sorted(matches, key=lambda item: item[1]):
            relationships.append(Relationship(
                apartment=apartment,
                school=school,
                distance_km=round(distance, 3),
                estimated_travel_km=round(estimated_travel_km(distance), 3),
                distance_method="Straight-line Haversine; travel estimate = straight-line x 1.25",
                nearby_school_count=within_three_count,
                priority_score=score,
            ))
    return sorted(relationships, key=lambda item: (-item.priority_score, item.distance_km, item.apartment.name))


def priority_score(apartment: Place, nearest_school_km: float, school_count_within_3km: int) -> int:
    if nearest_school_km <= 1:
        distance_points = 40
    elif nearest_school_km <= 2:
        distance_points = 30
    elif nearest_school_km <= 3:
        distance_points = 20
    else:
        distance_points = 5
    school_points = min(school_count_within_3km * 5, 25)
    community_points = 15 if apartment.gated_status != UNKNOWN else 0
    units_points = 10 if apartment.units is not None else 0
    public_contact_points = 10 if (
        apartment.public_website != UNKNOWN or apartment.public_phone != UNKNOWN
    ) else 0
    return min(distance_points + school_points + community_points + units_points + public_contact_points, 100)


def locality_summary(relationships: list[Relationship], high_threshold: int = 70) -> list[dict[str, str | int]]:
    grouped: dict[str, dict[str, object]] = {}
    for item in relationships:
        locality = item.apartment.locality
        bucket = grouped.setdefault(locality, {"schools": set(), "apartments": {}, "high": set()})
        bucket["schools"].add(item.school.name)  # type: ignore[union-attr]
        bucket["apartments"][item.apartment.name] = item.priority_score  # type: ignore[index]
        if item.priority_score >= high_threshold:
            bucket["high"].add(item.apartment.name)  # type: ignore[union-attr]
    return [{
        "Locality": locality,
        "Number of Schools": len(data["schools"]),  # type: ignore[arg-type]
        "Number of Apartments": len(data["apartments"]),  # type: ignore[arg-type]
        "High Priority Apartments": "; ".join(sorted(data["high"])) or UNKNOWN,  # type: ignore[arg-type]
    } for locality, data in sorted(grouped.items())]
