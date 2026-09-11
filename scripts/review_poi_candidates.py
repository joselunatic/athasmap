#!/usr/bin/env python3
"""Consolidate scanner candidates into a read-only review report."""
from __future__ import annotations

import argparse
import json
import math
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path
import re

try:
    from scripts.scan_poi_candidates import _fuzzy_canonical
except ImportError:
    from scan_poi_candidates import _fuzzy_canonical

WIDTH, HEIGHT = 4589, 3080


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    value = value.replace("'", "").replace("’", "")
    return " ".join(re.findall(r"[a-z0-9]+", value))


def classify_label(value: str) -> str:
    """Classify text without promoting it to a POI."""
    tokens = set(normalize(value).split())
    route_terms = {"road", "route", "trail", "path", "way", "roadway"}
    landscape_terms = {
        "badlands",
        "belt",
        "canyon",
        "cavern",
        "caverns",
        "dunes",
        "flats",
        "forest",
        "island",
        "lake",
        "marsh",
        "mountain",
        "mountains",
        "plain",
        "plains",
        "ravine",
        "ridge",
        "river",
        "sea",
        "scrub",
        "wastes",
    }
    if tokens & route_terms:
        return "route_or_region"
    if tokens & landscape_terms:
        return "landscape_feature"
    return "point_candidate"


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, normalize(a), normalize(b)).ratio()


def pixel_from_normalized(point: dict) -> tuple[float, float]:
    return point["x"] * WIDTH, point["y"] * HEIGHT


def inspect_candidates(root: Path, scan_path: Path) -> dict:
    scan = json.loads(scan_path.read_text(encoding="utf-8"))
    catalog = json.loads((root / "poi.json").read_text(encoding="utf-8"))
    pois = catalog["pois"]
    by_normalized = {normalize(poi["name"]): poi for poi in pois}
    lexicon = [poi["name"] for poi in pois]
    rows = []
    for candidate in scan.get("candidates", []):
        raw = candidate["raw_label"]
        canonical, _ = _fuzzy_canonical(raw, lexicon)
        poi = by_normalized.get(normalize(canonical or raw))
        if poi is None and canonical:
            best = max(
                ((similarity(canonical, item["name"]), item) for item in pois),
                key=lambda pair: pair[0],
            )
            if best[0] >= 0.75:
                poi = best[1]
        anchor = candidate["anchorPixel"]
        row = {
            "candidateId": candidate.get("candidateId") or Path(candidate["evidence_crop"]).stem,
            "rawLabel": raw,
            "canonicalLabel": canonical,
            "entityClass": classify_label(canonical or raw),
            "anchorPixel": anchor,
            "normalized": candidate["normalized"],
            "labelBox": candidate["labelBox"],
            "score": candidate["score"],
            "ocrScore": candidate.get("ocr_score"),
            "symbolScore": candidate.get("symbol_score"),
            "anchorMethod": candidate.get("anchor_method"),
            "evidenceCrop": candidate["evidence_crop"],
        }
        if poi is None:
            row.update({"status": "new-or-unmatched", "poiId": None})
        elif poi.get("coordinates") is None:
            row.update({"status": "existing-unplaced", "poiId": poi["id"]})
        else:
            current = pixel_from_normalized(poi["coordinates"])
            delta = math.hypot(anchor["x"] - current[0], anchor["y"] - current[1])
            row.update(
                {
                    "status": "existing-aligned" if delta <= 56 else "existing-displaced",
                    "poiId": poi["id"],
                    "currentPixel": {"x": round(current[0], 2), "y": round(current[1], 2)},
                    "deltaPixel": round(delta, 2),
                }
            )
        rows.append(row)
    rows.sort(key=lambda row: (row["status"], -(row["score"] or 0)))
    counts = {}
    classes = {}
    for row in rows:
        counts[row["status"]] = counts.get(row["status"], 0) + 1
        classes[row["entityClass"]] = classes.get(row["entityClass"], 0) + 1
    result = {
        "version": 1,
        "source": scan.get("source"),
        "coordinateSystem": scan.get("coordinateSystem"),
        "stats": {"candidates": len(rows), "byStatus": counts, "byClass": classes},
        "candidates": rows,
    }
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--scan", type=Path, default=Path("output/poi-scan/candidates.json"))
    parser.add_argument("--output", type=Path, default=Path("output/poi-scan/review.json"))
    args = parser.parse_args()
    result = inspect_candidates(args.root, args.scan)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result["stats"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
