import unittest

from research.lunchbox_research.models import Place
from research.lunchbox_research.normalize import deduplicate_places, normalize_text


def apartment(name: str, address: str, latitude: float = 13.0) -> Place:
    return Place(
        kind="apartment", name=name, address=address, latitude=latitude, longitude=80.0,
        source_url="https://www.openstreetmap.org/node/1", source_type="test",
        source_id=name,
    )


class DeduplicationTests(unittest.TestCase):
    def test_normalization_removes_case_and_punctuation(self) -> None:
        self.assertEqual(normalize_text("Alpha—Residency!"), "alpha residency")

    def test_same_name_address_and_coordinates_deduplicate(self) -> None:
        places = [
            apartment("Alpha Residency", "1 Main Road"),
            apartment("alpha-residency", "1, Main Road"),
        ]
        self.assertEqual(len(deduplicate_places(places)), 1)

    def test_different_coordinates_are_retained(self) -> None:
        places = [apartment("Alpha", "1 Main Road", 13.0), apartment("Alpha", "1 Main Road", 13.1)]
        self.assertEqual(len(deduplicate_places(places)), 2)


if __name__ == "__main__":
    unittest.main()
