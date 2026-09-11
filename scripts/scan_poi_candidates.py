"""Global OCR/CV scanner for Athas raster POI candidates.

The scanner is deliberately proposal-only: it writes candidates and evidence crops,
never mutating poi.json. Coordinates are always global pixels in the useful raster
box (4589 x 3080), not viewport or tile-local coordinates.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import unicodedata
from dataclasses import asdict, dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Iterable, Sequence

CANONICAL_WIDTH = 4589
CANONICAL_HEIGHT = 3080


@dataclass(frozen=True)
class Candidate:
    raw_label: str
    anchor_pixel: tuple[float, float]
    label_box: tuple[float, float, float, float]
    score: float
    evidence_crop: str
    canonical_label: str | None = None
    anchor_method: str = "label-center"
    ocr_score: float | None = None
    symbol_score: float | None = None


def iter_windows(
    width: int,
    height: int,
    tile: int = 768,
    overlap: float = 0.2,
) -> Iterable[tuple[int, int, int, int]]:
    """Yield deterministic global windows covering a canvas exactly."""
    if width <= 0 or height <= 0 or tile <= 0:
        raise ValueError("width, height y tile deben ser positivos")
    if not 0 <= overlap < 1:
        raise ValueError("overlap debe estar en [0, 1)")
    step = max(1, round(tile * (1 - overlap)))

    def starts(length: int) -> list[int]:
        if length <= tile:
            return [0]
        values = list(range(0, length - tile + 1, step))
        final = length - tile
        if values[-1] != final:
            values.append(final)
        return values

    for y in starts(height):
        for x in starts(width):
            yield (x, y, min(x + tile, width), min(y + tile, height))


def to_normalized(x: float, y: float) -> dict[str, float]:
    if not (0 <= x <= CANONICAL_WIDTH and 0 <= y <= CANONICAL_HEIGHT):
        raise ValueError("pixel fuera de la caja útil del raster")
    return {"x": x / CANONICAL_WIDTH, "y": y / CANONICAL_HEIGHT}


def normalize_label(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    value = value.lower().replace("'", "").replace("’", "")
    return " ".join(re.findall(r"[a-z0-9]+", value))


def label_similarity(left: str, right: str) -> float:
    a, b = normalize_label(left), normalize_label(right)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


def deduplicate_candidates(
    candidates: Sequence[Candidate],
    radius: float = 48,
) -> list[Candidate]:
    """Merge overlap reads only when normalized text and anchors agree."""
    chosen: list[Candidate] = []
    for candidate in sorted(candidates, key=lambda item: item.score, reverse=True):
        label = normalize_label(candidate.canonical_label or candidate.raw_label)
        duplicate = False
        for existing in chosen:
            existing_label = normalize_label(existing.canonical_label or existing.raw_label)
            distance = math.hypot(
                candidate.anchor_pixel[0] - existing.anchor_pixel[0],
                candidate.anchor_pixel[1] - existing.anchor_pixel[1],
            )
            if label == existing_label and distance <= radius:
                duplicate = True
                break
        if not duplicate:
            chosen.append(candidate)
    return sorted(chosen, key=lambda item: (item.anchor_pixel[1], item.anchor_pixel[0]))


def _fuzzy_canonical(raw: str, lexicon: Sequence[str]) -> tuple[str | None, float]:
    if not lexicon:
        return None, 0.0
    exact = normalize_label(raw)
    for name in lexicon:
        if normalize_label(name) == exact:
            return name, 1.0
    scored = sorted(((label_similarity(raw, name), name) for name in lexicon), reverse=True)
    best_score, best_name = scored[0]
    return (best_name, best_score) if best_score >= 0.82 else (None, best_score)


def _box_from_ocr(box: Sequence[Sequence[float]]) -> tuple[float, float, float, float]:
    xs = [float(point[0]) for point in box]
    ys = [float(point[1]) for point in box]
    return (min(xs), min(ys), max(xs), max(ys))


def _box_iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    x0, y0 = max(a[0], b[0]), max(a[1], b[1])
    x1, y1 = min(a[2], b[2]), min(a[3], b[3])
    overlap = max(0.0, x1 - x0) * max(0.0, y1 - y0)
    if overlap == 0:
        return 0.0
    area_a = max(1.0, (a[2] - a[0]) * (a[3] - a[1]))
    area_b = max(1.0, (b[2] - b[0]) * (b[3] - b[1]))
    return overlap / (area_a + area_b - overlap)


def find_symbol_anchor(
    image_rgb,
    label_box: tuple[float, float, float, float],
    search_radius: int = 150,
):
    """Find a plausible dark symbol near a label and return (x, y, score)."""
    import cv2
    import numpy as np

    image_height, image_width = image_rgb.shape[:2]
    lx0, ly0, lx1, ly1 = label_box
    rx0 = max(0, int(math.floor(lx0 - search_radius)))
    ry0 = max(0, int(math.floor(ly0 - search_radius)))
    rx1 = min(image_width, int(math.ceil(lx1 + search_radius)))
    ry1 = min(image_height, int(math.ceil(ly1 + search_radius)))
    local = image_rgb[ry0:ry1, rx0:rx1]
    gray = cv2.cvtColor(local, cv2.COLOR_RGB2GRAY)
    masks = ((92, cv2.inRange(gray, 0, 92)), (52, cv2.inRange(gray, 0, 52)))
    local_box = (lx0 - rx0, ly0 - ry0, lx1 - rx0, ly1 - ry0)
    center = ((local_box[0] + local_box[2]) / 2, (local_box[1] + local_box[3]) / 2)
    options: list[tuple[float, float, float]] = []
    for threshold, mask in masks:
        count, labels, stats, centroids = cv2.connectedComponentsWithStats(mask, 8)
        for index in range(1, count):
            x, y, w, h, area = (int(value) for value in stats[index])
            if area < 22 or area > 2500 or w < 4 or h < 4 or w > 100 or h > 100:
                continue
            component_box = (x, y, x + w, y + h)
            cx, cy = (float(centroids[index][0]), float(centroids[index][1]))
            # Text components have their centroid inside the OCR box. Compact
            # icons immediately beside/above the box are intentionally retained.
            if local_box[0] <= cx <= local_box[2] and local_box[1] <= cy <= local_box[3]:
                continue
            if _box_iou(component_box, local_box) > 0.55:
                continue
            center_distance = math.hypot(cx - center[0], cy - center[1])
            if center_distance > search_radius:
                continue
            horizontal_gap = max(local_box[0] - (x + w), x - local_box[2], 0)
            vertical_gap = max(local_box[1] - (y + h), y - local_box[3], 0)
            box_gap = math.hypot(horizontal_gap, vertical_gap)
            box_proximity = 1 - min(box_gap, search_radius) / search_radius
            center_proximity = 1 - center_distance / search_radius
            fill = area / max(1, w * h)
            compact = min(w, h) / max(w, h)
            size = min(1.0, area / 180.0)
            shape = 0.35 * compact + 0.25 * min(fill * 2, 1.0) + 0.25 * size + 0.15
            # Strict ink is a useful discriminator on the brown raster: it
            # recovers black dots that merge with dark terrain at threshold 92.
            strict_bonus = 0.08 if threshold == 52 and fill > 0.45 else 0.0
            score = max(0.0, (shape + strict_bonus) * (0.65 * box_proximity + 0.35 * center_proximity))
            options.append((score, cx, cy))
    if not options:
        return None
    score, x, y = max(options)
    return x + rx0, y + ry0, min(1.0, score)


def preprocess_variants(image_rgb):
    """Return OCR variants without changing their global coordinate frame."""
    import cv2
    import numpy as np

    gray = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2GRAY)
    # Keep the original for colour/contrast-sensitive text, plus two ink views.
    blackhat = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, np.ones((13, 13), np.uint8))
    adaptive = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        9,
    )
    return [
        ("colour", image_rgb),
        ("gray", cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)),
        ("blackhat", cv2.cvtColor(blackhat, cv2.COLOR_GRAY2RGB)),
        ("adaptive", cv2.cvtColor(adaptive, cv2.COLOR_GRAY2RGB)),
    ]


def _load_lexicon(root: Path) -> list[str]:
    names: set[str] = set()
    catalog = root / "poi.json"
    if catalog.exists():
        data = json.loads(catalog.read_text(encoding="utf-8"))
        names.update(poi["name"] for poi in data.get("pois", []))
    results = root / "output" / "external-position-workers"
    for path in results.glob("*/result.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            names.update(item["pdfName"] for item in data.get("approximations", []))
        except (OSError, KeyError, json.JSONDecodeError):
            continue
    # Canonical labels confirmed while calibrating the native raster. These are
    # names only; they do not supply coordinates or override raster evidence.
    names.update(
        {
            "Gunginwald",
            "Fort Butcher",
            "Mira's Halo",
            "Krikik's Pack",
            "The Iron Road",
            "Canyon of Guthay",
        }
    )
    return sorted(names)


def _save_evidence(image, box, output_dir: Path, index: int) -> str:
    from PIL import Image

    width, height = image.size
    x0, y0, x1, y1 = (int(round(value)) for value in box)
    pad = 120
    crop = image.crop(
        (
            max(0, x0 - pad),
            max(0, y0 - pad),
            min(width, x1 + pad),
            min(height, y1 + pad),
        )
    )
    output_dir.mkdir(parents=True, exist_ok=True)
    filename = f"candidate-{index:04d}.png"
    crop.save(output_dir / filename)
    return str(output_dir / filename).replace("\\", "/")


def scan_raster(
    raster_path: Path,
    output_dir: Path,
    tile: int = 1024,
    overlap: float = 0.2,
    min_ocr_score: float = 0.35,
    variant_names: Sequence[str] = ("colour", "gray"),
) -> dict:
    from PIL import Image
    from rapidocr_onnxruntime import RapidOCR

    image = Image.open(raster_path).convert("RGB")
    if image.width < CANONICAL_WIDTH or image.height < CANONICAL_HEIGHT:
        raise ValueError(f"raster demasiado pequeño: {image.size}")
    useful = image.crop((0, 0, CANONICAL_WIDTH, CANONICAL_HEIGHT))
    lexicon = _load_lexicon(raster_path.parents[1])
    ocr = RapidOCR()
    raw_candidates: list[Candidate] = []
    window_count = 0
    detection_count = 0

    for x0, y0, x1, y1 in iter_windows(CANONICAL_WIDTH, CANONICAL_HEIGHT, tile, overlap):
        window_count += 1
        crop = useful.crop((x0, y0, x1, y1))
        # OCR gets several views, but every box is translated back globally.
        variants = dict(preprocess_variants(__import__("numpy").array(crop)))
        for variant_name in variant_names:
            if variant_name not in variants:
                raise ValueError(f"variante OCR desconocida: {variant_name}")
            variant = variants[variant_name]
            result, _elapsed = ocr(variant)
            for row in result or []:
                if len(row) < 3:
                    continue
                box, raw, confidence = row[0], str(row[1]).strip(), float(row[2])
                if confidence < min_ocr_score or len(normalize_label(raw)) < 3:
                    continue
                local_box = _box_from_ocr(box)
                global_box = (
                    local_box[0] + x0,
                    local_box[1] + y0,
                    local_box[2] + x0,
                    local_box[3] + y0,
                )
                label_center = (
                    (global_box[0] + global_box[2]) / 2,
                    (global_box[1] + global_box[3]) / 2,
                )
                canonical, match_score = _fuzzy_canonical(raw, lexicon)
                symbol = find_symbol_anchor(__import__("numpy").array(useful), global_box)
                # find_symbol_anchor expects global coordinates when passed the
                # full useful raster; use the global image deliberately here.
                if symbol:
                    anchor = (symbol[0], symbol[1])
                    anchor_method = "nearby-symbol"
                    symbol_score = symbol[2]
                else:
                    anchor = label_center
                    anchor_method = "label-center"
                    symbol_score = None
                score = min(1.0, 0.55 * confidence + 0.30 * match_score + 0.15 * (symbol_score or 0))
                raw_candidates.append(
                    Candidate(
                        raw_label=raw,
                        anchor_pixel=anchor,
                        label_box=global_box,
                        score=score,
                        evidence_crop="",
                        canonical_label=canonical,
                        anchor_method=anchor_method,
                        ocr_score=confidence,
                        symbol_score=symbol_score,
                    )
                )
                detection_count += 1

    merged = deduplicate_candidates(raw_candidates, radius=56)
    crops_dir = output_dir / "crops"
    finalized: list[Candidate] = []
    for index, candidate in enumerate(merged, start=1):
        evidence = _save_evidence(useful, candidate.label_box, crops_dir, index)
        finalized.append(
            Candidate(
                **{**asdict(candidate), "evidence_crop": evidence}
            )
        )
    output = {
        "version": 1,
        "source": "tiles_new/zoom5_composite.png",
        "coordinateSystem": "athas-image-normalized-v1",
        "canvas": {"width": CANONICAL_WIDTH, "height": CANONICAL_HEIGHT},
        "scan": {"tile": tile, "overlap": overlap, "windows": window_count},
        "stats": {"rawDetections": detection_count, "deduplicated": len(finalized)},
        "candidates": [
            {
                "candidateId": f"{output_dir.name}-{index:04d}",
                **asdict(candidate),
                "anchorPixel": {
                    "x": round(candidate.anchor_pixel[0], 2),
                    "y": round(candidate.anchor_pixel[1], 2),
                },
                "labelBox": {
                    "x0": round(candidate.label_box[0], 2),
                    "y0": round(candidate.label_box[1], 2),
                    "x1": round(candidate.label_box[2], 2),
                    "y1": round(candidate.label_box[3], 2),
                },
                "normalized": to_normalized(*candidate.anchor_pixel),
            }
            for index, candidate in enumerate(finalized, start=1)
        ],
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "candidates.json").write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raster", type=Path, default=Path("tiles_new/zoom5_composite.png"))
    parser.add_argument("--output", type=Path, default=Path("output/poi-scan"))
    parser.add_argument("--tile", type=int, default=1024)
    parser.add_argument("--overlap", type=float, default=0.2)
    parser.add_argument("--min-ocr-score", type=float, default=0.35)
    parser.add_argument("--variants", default="colour,gray", help="OCR variants separated by commas")
    args = parser.parse_args()
    result = scan_raster(
        args.raster,
        args.output,
        args.tile,
        args.overlap,
        args.min_ocr_score,
        tuple(name.strip() for name in args.variants.split(",") if name.strip()),
    )
    print(json.dumps(result["stats"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
