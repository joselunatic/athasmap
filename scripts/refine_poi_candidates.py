#!/usr/bin/env python3
"""Run all OCR views on one global raster box for candidate review."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from scan_poi_candidates import preprocess_variants


def parse_box(value: str) -> tuple[int, int, int, int]:
    values = tuple(int(part.strip()) for part in value.split(","))
    if len(values) != 4 or values[2] <= values[0] or values[3] <= values[1]:
        raise ValueError("box debe ser x0,y0,x1,y1 con dimensiones positivas")
    return values  # type: ignore[return-value]


def refine(raster: Path, output: Path, name: str, box: tuple[int, int, int, int]) -> dict:
    import numpy as np
    from PIL import Image
    from rapidocr_onnxruntime import RapidOCR

    image = Image.open(raster).convert("RGB")
    x0, y0, x1, y1 = box
    if x0 < 0 or y0 < 0 or x1 > image.width or y1 > image.height:
        raise ValueError(f"box fuera del raster {image.size}: {box}")
    crop = image.crop(box)
    output.mkdir(parents=True, exist_ok=True)
    crop_path = output / f"{name}.png"
    crop.resize((crop.width * 2, crop.height * 2)).save(crop_path)
    ocr = RapidOCR()
    observations = []
    for variant_name, variant in preprocess_variants(np.array(crop)):
        result, elapsed = ocr(variant)
        for row in result or []:
            if len(row) < 3:
                continue
            points, text, score = row[0], str(row[1]).strip(), float(row[2])
            xs = [float(point[0]) for point in points]
            ys = [float(point[1]) for point in points]
            observations.append(
                {
                    "variant": variant_name,
                    "text": text,
                    "score": round(score, 5),
                    "globalBox": {
                        "x0": round(min(xs) + x0, 2),
                        "y0": round(min(ys) + y0, 2),
                        "x1": round(max(xs) + x0, 2),
                        "y1": round(max(ys) + y0, 2),
                    },
                    "elapsed": elapsed,
                }
            )
    result = {
        "version": 1,
        "source": str(raster).replace("\\", "/"),
        "coordinateSystem": "athas-image-normalized-v1",
        "box": {"x0": x0, "y0": y0, "x1": x1, "y1": y1},
        "crop": str(crop_path).replace("\\", "/"),
        "observations": observations,
    }
    (output / f"{name}.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raster", type=Path, default=Path("tiles_new/zoom5_composite.png"))
    parser.add_argument("--output", type=Path, default=Path("output/poi-scan/refine"))
    parser.add_argument("--name", required=True)
    parser.add_argument("--box", required=True, help="x0,y0,x1,y1 en píxeles globales")
    args = parser.parse_args()
    result = refine(args.raster, args.output, args.name, parse_box(args.box))
    print(json.dumps({"crop": result["crop"], "observations": len(result["observations"])}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
