import unittest
from datetime import datetime, timezone

from research.lunchbox_research.storage import build_gcs_run_prefix, build_run_id


class StorageTests(unittest.TestCase):
    def test_run_id_is_utc_and_filesystem_safe(self) -> None:
        value = build_run_id(datetime(2026, 8, 8, 7, 30, 45, tzinfo=timezone.utc))
        self.assertEqual(value, "2026-08-08T073045Z")

    def test_gcs_prefix_is_normalized(self) -> None:
        value = build_gcs_run_prefix("gs://chennaifood/", "/marketing/research/runs/", "run-1")
        self.assertEqual(value, "gs://chennaifood/marketing/research/runs/run-1/")

    def test_bucket_is_required(self) -> None:
        with self.assertRaisesRegex(ValueError, "bucket"):
            build_gcs_run_prefix("", "marketing", "run-1")


if __name__ == "__main__":
    unittest.main()
