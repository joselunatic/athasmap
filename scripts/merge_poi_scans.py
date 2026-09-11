#!/usr/bin/env python3
"""Merge independent raster scans into one deduplicated review inventory."""
from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path

from scan_poi_candidates import Candidate, CANONICAL_HEIGHT, CANONICAL_WIDTH, deduplicate_candidates, to_normalized


def read_candidates(path: Path) -> tuple[dict, list[Candidate]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    candidates = []
    for item in data.get("candidates", []):
        anchor = item.get("anchorPixel") or item.get("anchor_pixel")
        label_box = item.get("labelBox") or item.get("label_box")
        candidates.append(
            Candidate(
                raw_label=item["raw_label"],
                anchor_pixel=(float(anchor["x"]), float(anchor["y"])) if isinstance(anchor, dict) else tuple(anchor),
                label_box=(label_box["x0"], label_box["y0"], label_box["x1"], label_box["y1"])
                if isinstance(label_box, dict)
                else tuple(label_box),
                score=float(item["score"]),
                evidence_crop=item["evidence_crop"],
                canonical_label=item.get("canonical_label"),
                anchor_method=item.get("anchor_method", "label-center"),
                ocr_score=item.get("ocr_score"),
                symbol_score=item.get("symbol_score"),
            )
        )
    return data, candidates


def merge(scans: list[Path], output: Path) -> dict:
    inputs = []
    all_candidates = []
    raw_total = 0
    for path in scans:
        data, candidates = read_candidates(path)
        inputs.append({"path": str(path).replace("\\", "/"), "scan": data.get("scan"), "stats": data.get("stats")})
        raw_total += int(data.get("stats", {}).get("rawDetections", 0))
        all_candidates.extend(candidates)
    merged = deduplicate_candidates(all_candidates, radius=56)
    rows = []
    for index, candidate in enumerate(merged, start=1):
        if not (0 <= candidate.anchor_pixel[0] <= CANONICAL_WIDTH and 0 <= candidate.anchor_pixel[1] <= CANONICAL_HEIGHT):
            raise ValueError(f"anchor fuera del lienzo: {candidate.anchor_pixel}")
        rows.append(
            {
                "candidateId": f"merged-{index:04d}",
                **asdict(candidate),
                "anchorPixel": {"x": round(candidate.anchor_pixel[0], 2), "y": round(candidate.anchor_pixel[1], 2)},
                "labelBox": {
                    "x0": round(candidate.label_box[0], 2),
                    "y0": round(candidate.label_box[1], 2),
                    "x1": round(candidate.label_box[2], 2),
                    "y1": round(candidate.label_box[3], 2),
                },
                "normalized": to_normalized(*candidate.anchor_pixel),
            }
        )
    result = {
        "version": 1,
        "sources": inputs,
        "coordinateSystem": "athas-image-normalized-v1",
        "canvas": {"width": CANONICAL_WIDTH, "height": CANONICAL_HEIGHT},
        "stats": {"rawDetections": raw_total, "inputCandidates": len(all_candidates), "deduplicated": len(rows)},
        "candidates": rows,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("output/poi-scan/combined.json"))
    parser.add_argument("scans", nargs="*", type=Path, default=[Path("output/poi-scan/candidates.json"), Path("output/poi-scan-colour/candidates.json")])
    args = parser.parse_args()
    result = merge(args.scans, args.output)
    print(json.dumps(result["stats"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
