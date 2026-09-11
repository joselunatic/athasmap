import unittest

from scripts.scan_poi_candidates import (
    CANONICAL_HEIGHT,
    CANONICAL_WIDTH,
    Candidate,
    deduplicate_candidates,
    find_symbol_anchor,
    iter_windows,
    label_similarity,
    normalize_label,
    to_normalized,
    _fuzzy_canonical,
)


class ScannerCoreTests(unittest.TestCase):
    def test_windows_cover_useful_canvas_with_overlap_and_global_coordinates(self):
        windows = list(iter_windows(CANONICAL_WIDTH, CANONICAL_HEIGHT, tile=768, overlap=0.2))
        self.assertGreater(len(windows), 20)
        self.assertEqual(windows[0], (0, 0, 768, 768))
        self.assertEqual(windows[-1][2:], (CANONICAL_WIDTH, CANONICAL_HEIGHT))
        self.assertEqual(min(w[0] for w in windows), 0)
        self.assertEqual(min(w[1] for w in windows), 0)
        self.assertTrue(any(a[0] < b[0] < a[2] for a in windows for b in windows[1:]))

    def test_coordinates_use_the_non_empty_4589_by_3080_box(self):
        self.assertEqual(to_normalized(0, 0), {"x": 0.0, "y": 0.0})
        self.assertEqual(to_normalized(CANONICAL_WIDTH, CANONICAL_HEIGHT), {"x": 1.0, "y": 1.0})
        self.assertEqual(to_normalized(2294.5, 1540), {"x": 0.5, "y": 0.5})

    def test_label_normalization_supports_apostrophes_and_ocr_spacing(self):
        self.assertEqual(normalize_label("MIRA’S  HALO"), "miras halo")
        self.assertEqual(normalize_label("  KRIKIK'S-PACK "), "krikiks pack")

    def test_overlapping_reads_merge_only_same_label_near_same_anchor(self):
        candidates = [
            Candidate("Fort Skonz", (100, 200), (80, 180, 150, 225), 0.72, "a.png"),
            Candidate("FORT SKONZ", (104, 203), (82, 181, 151, 226), 0.91, "b.png"),
            Candidate("Fort Skonz", (500, 600), (480, 580, 550, 625), 0.95, "c.png"),
        ]
        merged = deduplicate_candidates(candidates, radius=32)
        self.assertEqual(len(merged), 2)
        self.assertEqual(merged[0].raw_label, "FORT SKONZ")
        self.assertEqual(merged[0].score, 0.91)

    def test_fuzzy_matching_does_not_merge_distinct_fort_names(self):
        self.assertEqual(_fuzzy_canonical("FORT IANTO", ["Fort Inix"])[0], None)
        self.assertEqual(_fuzzy_canonical("FORT yKONZ", ["Fort Skonz"])[0], "Fort Skonz")

        import cv2
        import numpy as np

        image = np.full((200, 300, 3), 240, dtype=np.uint8)
        cv2.circle(image, (100, 100), 12, (20, 20, 20), -1)
        anchor = find_symbol_anchor(image, (108, 90, 180, 116), search_radius=60)
        self.assertIsNotNone(anchor)
        self.assertAlmostEqual(anchor[0], 100, delta=3)
        self.assertAlmostEqual(anchor[1], 100, delta=3)


if __name__ == "__main__":
    unittest.main()
