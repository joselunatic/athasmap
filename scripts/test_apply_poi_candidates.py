import json
import tempfile
import unittest
from pathlib import Path

from scripts.apply_poi_candidates import apply_manifest
from scripts.review_poi_candidates import classify_label


class ApplyCandidatesTests(unittest.TestCase):
    def test_applying_the_same_manifest_twice_does_not_duplicate_an_add(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            evidence = root / "output" / "poi-scan" / "evidence.png"
            evidence.parent.mkdir(parents=True)
            evidence.write_bytes(b"evidence")
            (root / "poi.json").write_text(json.dumps({"pois": []}), encoding="utf-8")
            manifest = root / "accepted.json"
            manifest.write_text(
                json.dumps(
                    {
                        "coordinateSystem": "athas-image-normalized-v1",
                        "accepted": [
                            {
                                "action": "add",
                                "poi": {
                                    "id": "sample",
                                    "name": "Sample",
                                    "type": "village",
                                    "region": "Test",
                                    "importance": 1,
                                    "confidence": 1,
                                    "tags": [],
                                    "description": "test",
                                    "coordinates": {"x": 0.2, "y": 0.3},
                                    "provenance": "mapa",
                                    "source": "raster",
                                },
                                "evidence": ["output/poi-scan/evidence.png"],
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            apply_manifest(root, manifest, True)
            result = apply_manifest(root, manifest, True)
            catalog = json.loads((root / "poi.json").read_text(encoding="utf-8"))
            self.assertEqual(len(catalog["pois"]), 1)
            self.assertEqual(result["totalAfter"], 1)
    def test_review_classifier_keeps_routes_and_landscapes_out_of_point_pois(self):
        self.assertEqual(classify_label("THE IRON ROAD"), "route_or_region")
        self.assertEqual(classify_label("CANYON OF GUTHAY"), "landscape_feature")
        self.assertEqual(classify_label("FORT BUTCHER"), "point_candidate")


if __name__ == "__main__":
    unittest.main()
