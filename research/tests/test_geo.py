import unittest

from research.lunchbox_research.geo import estimated_travel_km, haversine_km


class DistanceTests(unittest.TestCase):
    def test_same_point_is_zero(self) -> None:
        self.assertEqual(haversine_km(13.0, 80.0, 13.0, 80.0), 0.0)

    def test_known_one_degree_equator_distance(self) -> None:
        self.assertAlmostEqual(haversine_km(0, 0, 0, 1), 111.195, places=3)

    def test_travel_estimate_is_explicit_multiplier(self) -> None:
        self.assertAlmostEqual(estimated_travel_km(2.0), 2.5)


if __name__ == "__main__":
    unittest.main()
