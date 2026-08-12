import unittest

from research.lunchbox_research.models import Place
from research.lunchbox_research.pipeline import priority_score, validate_places
from research.lunchbox_research.exporters import relationship_row
from research.lunchbox_research.models import Relationship


class ValidationTests(unittest.TestCase):
    def test_rejects_missing_coordinates_and_source(self) -> None:
        place = Place(kind="school", name="School")
        with self.assertRaisesRegex(ValueError, "latitude"):
            validate_places([place], "school")

    def test_rejects_invalid_coordinate_range(self) -> None:
        place = Place(
            kind="apartment", name="Community", latitude=100, longitude=80,
            source_url="https://example.invalid/source",
        )
        self.assertIn("latitude must be between -90 and 90", place.validate())

    def test_score_uses_only_publicly_available_signals(self) -> None:
        place = Place(
            kind="apartment", name="Community", latitude=13, longitude=80,
            source_url="https://example.invalid/source", units=100,
            gated_status="Publicly tagged as residential complex",
            public_website="https://example.invalid/community",
        )
        self.assertEqual(priority_score(place, 0.8, 2), 85)

    def test_exports_official_contact_provenance(self) -> None:
        school = Place(kind="school", name="School", latitude=13, longitude=80,
                       source_url="https://school.example/contact", public_phone="044-10000000",
                       phone_source_url="https://school.example/contact", contact_type="Official school office")
        apartment = Place(kind="apartment", name="Community", latitude=13.001, longitude=80,
                          source_url="https://builder.example/project", public_phone="044-20000000",
                          phone_source_url="https://builder.example/project", contact_type="Developer office")
        row = relationship_row(Relationship(apartment, school, 0.1, 0.125, "test", 1, 50))
        self.assertEqual(row["School Official Public Phone"], "044-10000000")
        self.assertEqual(row["Apartment Phone Source URL"], "https://builder.example/project")


if __name__ == "__main__":
    unittest.main()
