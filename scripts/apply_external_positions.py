#!/usr/bin/env python3
"""Apply reviewed PDF-to-raster POI placements. Dry-run by default."""
from __future__ import annotations

import argparse
import json
import re
import shutil
import unicodedata
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
POI_PATH = ROOT / "poi.json"
RESULT_DIR = ROOT / "output" / "external-position-workers"

MAP_IDS = {
    "the-chaksa", "temple-of-the-sky-serpent", "mausoleum-of-shivarm",
    "echoless-caverns", "kol-tukulg", "kra-hnur", "screaming-ravine",
    "makla", "silver-spring", "echoing-mine", "salt-view", "yaramuke", "black-waters",
    "pristine-tower", "bitter-well", "arkhold", "bleak-tower", "shur-a-tamwa",
    "samarah", "cromlin",
}
APPROX_IDS = {"oco", "dasaraches", "iron-mines"}
PENDING_IDS = {"roqom"}
NEW_POIS = {
    "black-waters": {
        "name": "Black Waters", "type": "oasis", "region": "Tablelands orientales",
        "description": "Punto de agua asociado a vegetación y al corredor de Yaramuke.",
        "importance": 3,
    },
    "cromlin": {
        "name": "Cromlin", "type": "village", "region": "Tablelands orientales",
        "description": "Asentamiento puntual del corredor oriental, entre relieves y rutas de las Tablelands.",
        "importance": 3,
    },
    "roqom": {
        "name": "Roqom", "type": "ruin", "region": "Sea of Silt oriental",
        "description": "Estructura aislada del sector oriental, próxima al entorno de Isle of Bones.",
        "importance": 3,
    },
    "shault": {
        "name": "Shault", "type": "village", "region": "Tablelands orientales",
        "description": "Asentamiento nombrado en el extremo oriental de la red de viaje.",
        "importance": 3,
    },
}


def slug(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")


def load_placements() -> list[dict]:
    placements: list[dict] = []
    for zone in ("west", "center", "south"):
        path = RESULT_DIR / zone / "result.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        for item in data["approximations"]:
            item = dict(item)
            item["canonicalId"] = slug(item["pdfName"])
            placements.append(item)
    if len({item["canonicalId"] for item in placements}) != len(placements):
        raise ValueError("Hay IDs canónicos duplicados en las propuestas")
    expected = MAP_IDS | APPROX_IDS | PENDING_IDS
    if {item["canonicalId"] for item in placements} != expected:
        raise ValueError("El conjunto de propuestas no coincide con la clasificación revisada")
    return placements


def update_poi(poi: dict, placement: dict) -> None:
    poi_id = placement["canonicalId"]
    if poi_id in PENDING_IDS:
        poi["coordinates"] = None
        poi.pop("placementRadius", None)
        poi["provenance"] = "externa"
        poi["confidence"] = 3
        poi["region"] = "Ubicación pendiente de situar"
        poi["source"] = "391_Athas_Travel_hi-res.pdf · inscripción reconocida por visión"
        poi["tags"] = sorted({tag for tag in poi.get("tags", []) if tag != "ubicacion-aproximada"} | {"pendiente-de-situar"})
        poi["notes"] = (
            "El raster local no confirma un rótulo o símbolo inequívoco para este POI. "
            f"Evidencia PDF: {placement['evidencePdf']}. "
            "Se conserva como candidato externo sin coordenadas canónicas."
        )
        return
    poi["coordinates"] = placement["normalized"]
    poi["provenance"] = "mapa" if poi_id in MAP_IDS else "externa_aproximada"
    poi["confidence"] = 4 if placement["confidence"] == "high" else 3
    if poi_id in APPROX_IDS:
        poi["placementRadius"] = placement["radiusNormalized"]
        poi["source"] = "391_Athas_Travel_hi-res.pdf + contexto del raster local — ubicación aproximada"
        poi["region"] = "Ubicación aproximada en el raster local"
        poi["tags"] = sorted({tag for tag in poi.get("tags", []) if tag != "pendiente-de-situar"} | {"ubicacion-aproximada"})
        poi["notes"] = (
            f"Ubicación aproximada; radio de incertidumbre normalizado: {placement['radiusNormalized']}. "
            f"Anclas: {', '.join(placement['anchors'])}. Evidencia local: {placement['evidenceCurrent']}. "
            f"Evidencia PDF: {placement['evidencePdf']}. {placement['reasoning']}"
        )
    else:
        poi.pop("placementRadius", None)
        poi["source"] = "Inscripción del mapa local (TSR 1991) — correlacionada con 391_Athas_Travel_hi-res.pdf"
        poi["region"] = "Ubicación reconocida en el raster local"
        poi["tags"] = sorted({tag for tag in poi.get("tags", []) if tag != "pendiente-de-situar"} | {"inscripcion-raster"})
        poi["notes"] = (
            f"Rótulo o símbolo reconocido en el raster local. Anclas: {', '.join(placement['anchors'])}. "
            f"Evidencia local: {placement['evidenceCurrent']}. Evidencia PDF: {placement['evidencePdf']}."
        )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="write poi.json after validation")
    args = parser.parse_args()
    data = json.loads(POI_PATH.read_text(encoding="utf-8"))
    placements = load_placements()
    by_id = {poi["id"]: poi for poi in data["pois"]}
    missing = sorted(set(NEW_POIS) - set(by_id))
    if missing:
        raise ValueError(f"POIs nuevos inesperados: {missing}")
    for poi_id, spec in NEW_POIS.items():
        if poi_id not in by_id:
            by_id[poi_id] = {
                "id": poi_id, "name": spec["name"], "type": spec["type"], "region": spec["region"],
                "importance": spec["importance"], "confidence": 3, "tags": ["pdf-travel"],
                "description": spec["description"], "coordinates": None, "visible": True, "notes": "",
                "source": "391_Athas_Travel_hi-res.pdf · inscripción reconocida por visión",
                "provenance": "externa", "water": "unknown", "danger": "unknown", "faction": "",
            }
            data["pois"].append(by_id[poi_id])
    for placement in placements:
        update_poi(by_id[placement["canonicalId"]], placement)
    json.dumps(data, ensure_ascii=False, indent=2)
    summary = {
        "current": len(json.loads(POI_PATH.read_text(encoding="utf-8"))["pois"]),
        "after": len(data["pois"]),
        "placements": len(placements),
        "mapa": sum(p.get("provenance", "catalogue") == "mapa" for p in data["pois"]),
        "approximate": sum(p.get("provenance", "catalogue") == "externa_aproximada" for p in data["pois"]),
        "external_unplaced": sum(p.get("provenance", "catalogue") == "externa" and p["coordinates"] is None for p in data["pois"]),
        "pending_ids": [p["id"] for p in data["pois"] if p.get("provenance", "catalogue") == "externa" and p["coordinates"] is None],
        "apply": args.apply,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if args.apply:
        backup = POI_PATH.with_name(f"poi.json.bak-{datetime.now().strftime('%Y%m%d-%H%M%S')}")
        shutil.copy2(POI_PATH, backup)
        POI_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"backup": str(backup)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
