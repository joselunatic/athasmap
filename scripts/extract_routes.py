#!/usr/bin/env python3
"""
Extract red trade routes from athas.png into a GeoJSON of LineStrings.
Requires: pillow, numpy, scikit-image
pip install --user pillow numpy scikit-image

Supports three modes to adjust for resource usage:
- default: full resolution
- small:  half resolution (factor 2), min component pixels 200
- micro:  quarter resolution (factor 4), min component pixels 400

Usage:
  python scripts/extract_routes.py            # default
  python scripts/extract_routes.py --small    # half res
  python scripts/extract_routes.py --micro    # quarter res
"""
import json
import math
import os
import sys
from collections import deque
from typing import List, Tuple

import numpy as np
from PIL import Image, ImageEnhance
from skimage.morphology import skeletonize
from skimage.measure import label, regionprops

# Paths
ROOT = os.path.dirname(__file__)
IMG_PATH = os.path.join(ROOT, "..", "src", "athas.png")
OUT_PATH = os.path.join(ROOT, "..", "backend", "data", "routes.geojson")

# Base image size
BASE_W, BASE_H = 9179, 6160
# Bounds for lon/lat conversion
MIN_LNG, MAX_LNG = -182.337, 21.463
MIN_LAT, MAX_LAT = 64.02, 87.17

# Threshold parameters for "red-ish" roads
MIN_R = 150
MAX_G = 120
MAX_B = 110
MIN_R_DOMINANCE = 40  # R - max(G,B) >= MIN_R_DOMINANCE

# Defaults (will be adjusted per mode)
SCALE_FACTOR = 1  # 1=default, 2=small, 4=micro
MIN_PIXELS_COMPONENT = 80


def parse_mode():
    global SCALE_FACTOR, MIN_PIXELS_COMPONENT
    if '--small' in sys.argv:
        SCALE_FACTOR = 2
        MIN_PIXELS_COMPONENT = 200
    elif '--micro' in sys.argv:
        SCALE_FACTOR = 4
        MIN_PIXELS_COMPONENT = 400


def load_image(path: str) -> np.ndarray:
    img = Image.open(path).convert("RGB")
    if SCALE_FACTOR > 1:
        img = img.resize((img.width // SCALE_FACTOR, img.height // SCALE_FACTOR))
    img = ImageEnhance.Contrast(img).enhance(1.2)
    return np.array(img)


def mask_red_routes(arr: np.ndarray) -> np.ndarray:
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    dominance = r - np.maximum(g, b)
    mask = (r >= MIN_R) & (g <= MAX_G) & (b <= MAX_B) & (dominance >= MIN_R_DOMINANCE)
    return mask


def components(mask: np.ndarray) -> List[np.ndarray]:
    lbl = label(mask, connectivity=2)
    comps = []
    for region in regionprops(lbl):
        if region.area < MIN_PIXELS_COMPONENT:
            continue
        coords = region.coords
        comp_mask = np.zeros_like(mask, dtype=bool)
        comp_mask[coords[:, 0], coords[:, 1]] = True
        comps.append(comp_mask)
    return comps


def skeleton_to_lines(skel: np.ndarray) -> List[List[Tuple[int, int]]]:
    # Extract paths by tracing from endpoints over 8-neighborhood
    H, W = skel.shape
    skel_coords = set(zip(*np.nonzero(skel)))

    def neighbors(p):
        x, y = p
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                nx, ny = x + dx, y + dy
                if 0 <= nx < H and 0 <= ny < W and (nx, ny) in skel_coords:
                    yield (nx, ny)

    endpoints = {p for p in skel_coords if sum(1 for _ in neighbors(p)) == 1}
    visited = set()
    lines = []

    def trace(start):
        path = []
        stack = deque([start])
        while stack:
            p = stack.popleft()
            if p in visited:
                continue
            visited.add(p)
            path.append((p[1], p[0]))  # store as (x,y)
            deg = [n for n in neighbors(p) if n not in visited]
            if len(deg) == 1:
                stack.append(deg[0])
            elif len(deg) > 1:
                stack.append(deg[0])
                for extra in deg[1:]:
                    stack.append(extra)
        return path

    for ep in endpoints:
        if ep in visited:
            continue
        line = trace(ep)
        if len(line) > 1:
            lines.append(line)

    for p in list(skel_coords):
        if p in visited:
            continue
        line = trace(p)
        if len(line) > 1:
            lines.append(line)

    return lines


def simplify_line(line: List[Tuple[int, int]], max_points=200) -> List[Tuple[int, int]]:
    if len(line) <= max_points:
        return line
    step = max(1, len(line) // max_points)
    return line[::step]


def pixel_to_lonlat(x: float, y: float) -> Tuple[float, float]:
    # Use scaled image size to map back to full bounds
    w = BASE_W / SCALE_FACTOR
    h = BASE_H / SCALE_FACTOR
    lon = MIN_LNG + (x / w) * (MAX_LNG - MIN_LNG)
    lat = MAX_LAT - (y / h) * (MAX_LAT - MIN_LAT)
    return round(lon, 6), round(lat, 6)


def main():
    parse_mode()
    arr = load_image(IMG_PATH)
    mask = mask_red_routes(arr)
    comps = components(mask)

    features = []
    for idx, comp in enumerate(comps):
        skel = skeletonize(comp)
        lines = skeleton_to_lines(skel)
        for li, line in enumerate(lines):
            if len(line) < 2:
                continue
            line = simplify_line(line)
            coords = [pixel_to_lonlat(x, y) for x, y in line]
            features.append({
                "type": "Feature",
                "properties": {
                    "id": f"route_{idx}_{li}",
                    "name": f"Route {idx}-{li}",
                    "type": "route"
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": coords
                }
            })

    geo = {"type": "FeatureCollection", "features": features}
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(geo, f, indent=2)
    print(f"Mode scale={SCALE_FACTOR} comps={len(comps)} -> Extracted {len(features)} routes -> {OUT_PATH}")


if __name__ == "__main__":
    main()
