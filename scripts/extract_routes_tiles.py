#!/usr/bin/env python3
"""
Extract trade routes (red pixels) per tile and export as GeoJSON LineStrings.
Works tile-by-tile to reduce memory usage.

Default input: ../tiles_new
Default zoom: 5 (process tiles_new/5/x/y.png)

CLI:
  python scripts/extract_routes_tiles.py                  # default tiles_new, zoom 5
  python scripts/extract_routes_tiles.py --tiles ../tiles_new --zoom 5 --min-pixels 12 --snap 0.02

Requires: pillow, numpy, scikit-image
pip install --user pillow numpy scikit-image
"""
import argparse
import json
import os
from collections import deque
from math import cos, radians, sqrt
from typing import List, Tuple

import numpy as np
from PIL import Image, ImageEnhance
from skimage.morphology import (
    binary_closing,
    binary_dilation,
    binary_opening,
    remove_small_objects,
    skeletonize,
)
from skimage.measure import label, regionprops
from skimage.color import rgb2hsv, rgb2lab

# Bounds for lon/lat conversion (synthetic bounds used in front)
MIN_LNG, MAX_LNG = -182.337, 21.463
MIN_LAT, MAX_LAT = 64.02, 87.17
TILE_SIZE = 256

# Threshold parameters for "red-ish" roads
MIN_R = 150
MAX_G = 120
MAX_B = 110
MIN_R_DOMINANCE = 40  # R - max(G,B) >= MIN_R_DOMINANCE


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tiles', default=os.path.join(os.path.dirname(__file__), '..', 'tiles_new'), help='Tiles directory (XYZ)')
    ap.add_argument('--zoom', default=5, type=int, help='Zoom level to process')
    ap.add_argument('--min-pixels', default=12, type=int, help='Minimum component size in pixels')
    ap.add_argument('--snap', default=0.02, type=float, help='Snap tolerance (deg) to merge lines across tiles')
    ap.add_argument('--hue-low', default=350, type=int, help='Lower hue bound for red (0-360, wraps)')
    ap.add_argument('--hue-high', default=40, type=int, help='Upper hue bound for red (0-360, wraps)')
    ap.add_argument('--sat-min', default=0.2, type=float, help='Minimum saturation for HSV mask')
    ap.add_argument('--value-min', default=0.2, type=float, help='Minimum value for HSV mask')
    ap.add_argument('--lab-a', default=10, type=float, help='LAB a* dominance threshold (redness)')
    ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'backend', 'data', 'routes.geojson'), help='Output GeoJSON')
    return ap.parse_args()


def mask_red_routes(arr: np.ndarray, hue_low: int, hue_high: int, sat_min: float, value_min: float, lab_a: float) -> np.ndarray:
    """
    Combine three cues:
    1) RGB dominance (classic heuristic).
    2) HSV hue/sat to pick reds with enough intensity.
    3) LAB a* channel for redness even when low-sat.
    """
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    dominance = r - np.maximum(g, b)
    rgb_mask = (r >= MIN_R) & (g <= MAX_G) & (b <= MAX_B) & (dominance >= MIN_R_DOMINANCE)

    hsv = rgb2hsv(arr / 255.0)
    h = hsv[:, :, 0] * 360.0
    s = hsv[:, :, 1]
    v = hsv[:, :, 2]
    if hue_low <= hue_high:
        hue_mask = (h >= hue_low) & (h <= hue_high)
    else:
        hue_mask = (h >= hue_low) | (h <= hue_high)
    hsv_mask = hue_mask & (s >= sat_min) & (v >= value_min)

    lab = rgb2lab(arr / 255.0)
    lab_mask = lab[:, :, 1] >= lab_a

    mask = rgb_mask | hsv_mask | lab_mask
    return mask


def components(mask: np.ndarray, min_pixels: int) -> List[np.ndarray]:
    lbl = label(mask, connectivity=2)
    comps = []
    for region in regionprops(lbl):
        if region.area < min_pixels:
            continue
        coords = region.coords
        comp_mask = np.zeros_like(mask, dtype=bool)
        comp_mask[coords[:, 0], coords[:, 1]] = True
        comps.append(comp_mask)
    return comps


def skeleton_to_lines(skel: np.ndarray) -> List[List[Tuple[int, int]]]:
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
            path.append((p[1], p[0]))  # (x,y)
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


def simplify_line(line: List[Tuple[int, int]], max_points=128) -> List[Tuple[int, int]]:
    if len(line) <= max_points:
        return line
    step = max(1, len(line) // max_points)
    return line[::step]


def approx_dist(p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
    """Rough distance in degrees scaled by cos(lat) to keep tolerance meaningful."""
    lon1, lat1 = p1
    lon2, lat2 = p2
    dlon = lon1 - lon2
    dlat = lat1 - lat2
    scale = cos(radians((lat1 + lat2) / 2.0))
    return sqrt((dlon * scale) ** 2 + dlat ** 2)


def merge_lines(lines: List[List[Tuple[float, float]]], tol: float) -> List[List[Tuple[float, float]]]:
    """Iteratively merge lines whose endpoints are within tolerance."""
    merged = True
    lines = [list(l) for l in lines if len(l) >= 2]
    while merged:
        merged = False
        new_lines = []
        skip = set()
        for i, line_a in enumerate(lines):
            if i in skip:
                continue
            for j in range(i + 1, len(lines)):
                if j in skip:
                    continue
                line_b = lines[j]
                a_start, a_end = line_a[0], line_a[-1]
                b_start, b_end = line_b[0], line_b[-1]
                if approx_dist(a_end, b_start) <= tol:
                    merged_line = line_a + line_b[1:]
                elif approx_dist(a_end, b_end) <= tol:
                    merged_line = line_a + list(reversed(line_b[:-1]))
                elif approx_dist(a_start, b_start) <= tol:
                    merged_line = list(reversed(line_a[1:])) + line_b
                elif approx_dist(a_start, b_end) <= tol:
                    merged_line = line_b + line_a[1:]
                else:
                    continue
                line_a = merged_line
                skip.add(j)
                merged = True
            new_lines.append(line_a)
        lines = new_lines
    return lines


def tile_px_to_lonlat(x_px: float, y_px: float, z: int, tile_x: int, tile_y: int) -> Tuple[float, float]:
    # Convert tile pixel to global pixel
    global_x = tile_x * TILE_SIZE + x_px
    global_y = tile_y * TILE_SIZE + y_px
    denom = TILE_SIZE * (2 ** z)
    lon = MIN_LNG + (global_x / denom) * (MAX_LNG - MIN_LNG)
    lat = MAX_LAT - (global_y / denom) * (MAX_LAT - MIN_LAT)
    return round(lon, 6), round(lat, 6)


def process_tile(tile_path: str, z: int, tile_x: int, tile_y: int, min_pixels: int, hue_low: int, hue_high: int, sat_min: float, value_min: float, lab_a: float):
    img = Image.open(tile_path).convert("RGB")
    arr = np.array(ImageEnhance.Contrast(img).enhance(1.35))

    mask = mask_red_routes(arr, hue_low, hue_high, sat_min, value_min, lab_a)
    # Clean mask to remove speckles and bridge small gaps
    mask = binary_opening(mask, footprint=np.ones((2, 2)))
    mask = binary_closing(mask, footprint=np.ones((3, 3)))
    mask = binary_dilation(mask, footprint=np.ones((2, 2)))
    mask = remove_small_objects(mask, min_size=max(4, min_pixels // 2))

    comps = components(mask, min_pixels)
    lines_out = []
    for comp in comps:
        skel = skeletonize(comp)
        lines = skeleton_to_lines(skel)
        for line in lines:
            if len(line) < 2:
                continue
            line = simplify_line(line)
            coords = [tile_px_to_lonlat(x, y, z, tile_x, tile_y) for x, y in line]
            lines_out.append(coords)
    return lines_out


def main():
    args = parse_args()
    z = args.zoom
    tiles_dir = os.path.join(args.tiles, str(z))
    if not os.path.isdir(tiles_dir):
        raise SystemExit(f"Zoom directory not found: {tiles_dir}")

    lines = []
    for x_str in os.listdir(tiles_dir):
        if not x_str.isdigit():
            continue
        x = int(x_str)
        xdir = os.path.join(tiles_dir, x_str)
        for f in os.listdir(xdir):
            if not f.endswith('.png'):
                continue
            y = int(f.split('.')[0])
            tile_path = os.path.join(xdir, f)
            tile_lines = process_tile(
                tile_path,
                z,
                x,
                y,
                args.min_pixels,
                args.hue_low,
                args.hue_high,
                args.sat_min,
                args.value_min,
                args.lab_a,
            )
            lines.extend(tile_lines)

    merged = merge_lines(lines, tol=args.snap)

    features = []
    for idx, coords in enumerate(merged):
        features.append({
            "type": "Feature",
            "properties": {
                "id": f"route_{idx}",
                "name": f"Route {idx}",
                "type": "route"
            },
            "geometry": {
                "type": "LineString",
                "coordinates": coords
            }
        })

    geo = {"type": "FeatureCollection", "features": features}
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as fh:
        json.dump(geo, fh, indent=2)
    print(f"Processed zoom {z}, tiles dir {tiles_dir}, merged lines {len(merged)}, features {len(features)} -> {args.out}")


if __name__ == "__main__":
    main()
