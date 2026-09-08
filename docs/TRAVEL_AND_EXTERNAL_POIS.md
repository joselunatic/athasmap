# POIs externos y red de viaje

## Objetivo

Incorporar con trazabilidad lugares y tramos descubiertos en `391_Athas_Travel_hi-res.pdf` sin falsificar la geometría del raster local ni modificar su arte base.

## Decisiones

1. `poi.json` sigue siendo el catálogo fuente de POIs; una incorporación requiere evidencia, fuente y precisión declarada.
2. Las rutas del PDF se modelan como aristas semánticas en un dataset separado, no como coordenadas transferidas por píxel.
3. La primera representación usa marcadores y polilíneas Leaflet; no se modifica `tiles_new/`.
4. Una capa de tiles transparente queda como mejora opcional para rótulos cartográficos a zoom alto; debe ser conmutable e independiente del raster base.
5. Las posiciones derivadas del PDF pero no impresas en el raster actual serán explícitamente aproximadas y corregibles.

## Estados de posicionamiento

| Estado | Significado | Representación |
|---|---|---|
| `mapa` | Inscripción reconocida en el raster actual | marcador normal |
| `externa_aproximada` | POI de fuente externa, colocado por contexto visual | marcador con anillo discontinuo y radio de incertidumbre |
| `catalogue` con coordenadas `null` | Existe pero aún no se puede colocar | Pendientes |

## Pipeline

1. Visión sobre crops nativos del PDF: nombre, categoría y contexto próximo.
2. Resolver duplicados contra `poi.json`; un nombre nuevo se prepara como candidato, no se incorpora ciegamente.
3. Buscar el contexto correspondiente en el raster local: topónimos, carreteras, accidentes, ciudades próximas.
4. Clasificar la posición como exacta, aproximada o pendiente.
5. Integrar solo candidatos con evidencia revisada; conservar los dudosos en `output/`.
6. Para cada arista de viaje, exigir ambos extremos nombrados, cápsula legible, capa y crop de evidencia.

## Modelo de red propuesto

```json
{
  "id": "urik--dragons-bowl--roads",
  "fromPoiId": "urik",
  "toPoiId": "dragons_bowl",
  "layer": "roads",
  "distanceLabel": 200,
  "unit": null,
  "source": "391_Athas_Travel_hi-res.pdf",
  "confidence": "high"
}
```

`unit` queda nulo hasta confirmar su significado editorial.

## Criterios de aceptación — primera entrega

- Cada POI externo integrado conserva una fuente y un estado de precisión visibles.
- Ningún POI aproximado se presenta como inscripción del raster local.
- Los cuatro tramos revisados se pueden mostrar/ocultar como líneas conceptuales entre POIs ya situados.
- Los filtros y selección de POIs existentes siguen funcionando.
- Tests, typecheck, lint y build pasan.
