# Arquitectura — POIs externos y red de viaje

## Fuentes de verdad
- `poi.json`: catálogo de POIs.
- `tiles_new/zoom5_composite.png`: evidencia canónica para `provenance: "mapa"`.
- `391_Athas_Travel_hi-res.pdf`: evidencia editorial externa de lugares y tramos.
- `travel-network.json` (propuesto): aristas semánticas; independiente de `routes.geojson`.

## Posicionamiento
Las coordenadas usan `athas-image-normalized-v1` sobre la caja útil 4589×3080. Solo se asignan tras revisión de crop y anclas.

## Escáner global
`scripts/scan_poi_candidates.py` es una fase de descubrimiento aislada: ventanas solapadas → OCR multi-variante → anchor de símbolo → matching de nombres → deduplicación → crops de evidencia en `output/poi-scan/`. `scripts/review_poi_candidates.py` cruza candidatos con `poi.json` y calcula desplazamientos, pero no escribe datos. `scripts/apply_poi_candidates.py` solo acepta un manifiesto revisado con `--apply` y crea un backup. El barrido no convierte una lectura fuzzy en `provenance: mapa`; esa promoción requiere evidencia local visual.

| Procedencia | Regla |
|---|---|
| `mapa` | Rótulo o símbolo local verificable en el raster. |
| `externa_aproximada` | Contexto PDF+raster suficiente, sin rótulo local concluyente; incluir radio. |
| `externa` | Fuente externa conocida, sin coordenada. |

## Rutas
Una arista no reproduce el trazado del PDF. Expresa la relación editorial entre POIs:

```json
{"fromPoiId":"urik","toPoiId":"dragons-bowl","layer":"roads","distanceLabel":200,"unit":null,"source":"391_Athas_Travel_hi-res.pdf","confidence":"high"}
```

Leaflet podrá mostrar una línea conceptual recta o suavizada entre marcadores colocados, etiquetada como aproximación. No se consume `routes.geojson` para datos de producto.

## Capa experimental retirada
`routes.geojson` contiene 4.593 LineStrings creados por detección de color/contraste; no representa una red curada. Se conserva como artefacto de investigación, pero no se carga en UI de producto.
