import gzip
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from scripts import build


class PublicationTest(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.export = self.root / "records.json.gz"
        self.data = json.loads((build.ROOT / "data" / "seed.json").read_bytes())
        self.data.update(built="2025-01-12", retrievedAt="2025-01-12T10:00:00Z")

    def import_against(self, current):
        self.export.write_bytes(gzip.compress(json.dumps(self.data).encode()))
        response = io.BytesIO(json.dumps(current).encode())
        with patch.object(build, "urlopen", return_value=response):
            return build.verified_export(self.export)

    def test_import_preserves_acquisition_time(self):
        result = self.import_against({"built": "2025-01-11"})
        self.assertEqual(result["retrievedAt"], self.data["retrievedAt"])
        self.assertEqual(result["snapshotKind"], "verified-export")

    def test_older_and_ambiguous_same_day_imports_are_rejected(self):
        for current in ({"retrievedAt": "2025-01-12T10:01:00Z"}, {"built": "2025-01-12"}):
            with self.subTest(current=current), self.assertRaisesRegex(ValueError, "already as recent"):
                self.import_against(current)

    def test_missing_source_is_rejected(self):
        self.data["records"] = [row for row in self.data["records"] if row["institution"] != "Canada Revenue Agency"]
        with self.assertRaisesRegex(ValueError, "all six"):
            self.import_against({"built": "2025-01-11"})

    def test_live_failure_preserves_existing_dist(self):
        dist = self.root / "dist"
        dist.mkdir()
        published = dist / "records.json"
        published.write_text("prior publication")
        with patch.object(build, "ROOT", self.root), patch.object(build, "acquire", side_effect=RuntimeError("source timeout")), patch("sys.argv", ["build.py"]):
            with self.assertRaisesRegex(RuntimeError, "source timeout"):
                build.main()
        self.assertEqual(published.read_text(), "prior publication")
