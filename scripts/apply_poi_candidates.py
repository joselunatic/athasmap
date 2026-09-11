#!/usr/bin/env python3
"""Apply explicitly accepted raster candidates to poi.json, with a backup."""
from __future__ import annotations

import argparse
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

WIDTH, HEIGHT = 4589, 3080
PROVENANCE = "mapa"


def normalized(value: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", value.lower().replace("'", "").replace("’", "")))


def validate_coordinates(point: dict) -> None:
    if set(point) != {"x", "y"} or not all(isinstance(point[key], (int, float)) for key in ("x", "y")):
        raise ValueError(f"coordenadas inválidas: {point}")
    if not all(0 <= point[key] <= 1 for key in ("x", "y")):
        raise ValueError(f"coordenadas fuera de rango: {point}")


def validate_evidence(entry: dict, root: Path) -> None:
    evidence = entry.get("evidence", [])
    if not evidence or not isinstance(evidence, list):
        raise ValueError(f"{entry.get('id') or entry.get('poi', {}).get('id')}: falta evidencia")
    for item in evidence:
        path = root / item
        if not str(path.resolve()).startswith(str((root / "output" / "poi-scan").resolve())):
            raise ValueError(f"evidencia fuera de output/poi-scan: {item}")
        if not path.exists():
            raise ValueError(f"evidencia no encontrada: {item}")


def validate_manifest(manifest: dict, catalog: dict, root: Path) -> None:
    if manifest.get("coordinateSystem") != "athas-image-normalized-v1":
        raise ValueError("sistema de coordenadas no reconocido")
    ids = {poi["id"] for poi in catalog.get("pois", [])}
    names = {normalized(poi["name"]) for poi in catalog.get("pois", [])}
    seen_ids: set[str] = set()
    seen_names: set[str] = set()
    for entry in manifest.get("accepted", []):
        action = entry.get("action")
        if action not in {"add", "update_coordinates"}:
            raise ValueError(f"acción no permitida: {action}")
        item = entry.get("poi", entry)
        item_id = item.get("id") or entry.get("id")
        if not item_id or item_id in seen_ids:
            raise ValueError(f"id duplicado o ausente: {item_id}")
        seen_ids.add(item_id)
        validate_evidence(entry, root)
        point = entry.get("coordinates", item.get("coordinates"))
        if point is None:
            raise ValueError(f"{item_id}: falta coordenada")
        validate_coordinates(point)
        if action == "add":
            if item_id in ids:
                existing = next(poi for poi in catalog["pois"] if poi["id"] == item_id)
                if existing != item:
                    raise ValueError(f"{item_id}: ya existe con contenido distinto")
                continue
            name_key = normalized(item["name"])
            if name_key in names or name_key in seen_names:
                raise ValueError(f"nombre duplicado: {item['name']}")
            seen_names.add(name_key)
            if item.get("provenance") != PROVENANCE:
                raise ValueError(f"{item_id}: un alta raster debe tener provenance mapa")
        else:
            if item_id not in ids:
                raise ValueError(f"{item_id}: no existe para actualizar")


def apply_manifest(root: Path, manifest_path: Path, apply: bool) -> dict:
    catalog_path = root / "poi.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    validate_manifest(manifest, catalog, root)
    by_id = {poi["id"]: poi for poi in catalog["pois"]}
    actions = []
    for entry in manifest["accepted"]:
        item = entry.get("poi", entry)
        item_id = item.get("id") or entry["id"]
        point = entry.get("coordinates", item.get("coordinates"))
        if entry["action"] == "add":
            if item_id in by_id:
                actions.append({"action": "already-present", "id": item_id, "name": item["name"], "coordinates": point})
            else:
                actions.append({"action": "add", "id": item_id, "name": item["name"], "coordinates": point})
        else:
            actions.append({"action": "update_coordinates", "id": item_id, "name": by_id[item_id]["name"], "coordinates": point})
    if apply:
        backup_dir = root / "output" / "poi-scan" / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        shutil.copy2(catalog_path, backup_dir / f"poi-{stamp}.json")
        for entry in manifest["accepted"]:
            item = entry.get("poi", entry)
            item_id = item.get("id") or entry["id"]
            point = entry.get("coordinates", item.get("coordinates"))
            if entry["action"] == "add":
                if item_id not in by_id:
                    catalog["pois"].append(item)
                    by_id[item_id] = item
            else:
                by_id[item_id]["coordinates"] = point
                if entry.get("source"):
                    by_id[item_id]["source"] = entry["source"]
                if entry.get("provenance"):
                    by_id[item_id]["provenance"] = entry["provenance"]
        catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"apply": apply, "actions": actions, "totalAfter": len(catalog["pois"]) if apply else len(catalog["pois"]) + sum(e["action"] == "add" for e in manifest["accepted"])}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--manifest", type=Path, default=Path("output/poi-scan/accepted.json"))
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    print(json.dumps(apply_manifest(args.root, args.manifest, args.apply), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
