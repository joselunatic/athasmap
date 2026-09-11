# Athas · Atlas del Sol Oscuro

Webapp local para explorar el mapa de Athas, situar lugares y preparar expediciones. React + TypeScript estricto + Vite, Leaflet `CRS.Simple` y validación Zod. Sin backend ni servicios externos.

## Arranque

Requiere Node.js 22.12 o superior y npm. Ejecuta desde la raíz, no desde `frontend/`:

```sh
npm ci
npm run dev
```

Abre http://127.0.0.1:5173. Producción:

```sh
npm run build
npm run preview
```

`dist/` puede servirse en la raíz de un servidor estático. Incluye teselas 0–5 y la red semántica curada; no copia el composite de referencia de 33 MB. No uses `file://`.

## Uso

- **Lugares:** busca por nombre, descripción o etiquetas y filtra por categoría, región, etiqueta e importancia. «Pendientes» muestra registros sin coordenadas. Los filtros también afectan a los marcadores.
- **Situar/mover:** abre una ficha, pulsa «Situar en el mapa» y elige una posición. Cancelar/Escape conserva la posición anterior hasta el clic. Con teclado, enfoca el mapa, desplázalo con flechas y pulsa Enter para elegir el centro.
- **Crear:** botón `+`, clic en el mapa, completa el formulario y guarda. Cancelar no crea el registro.
- **Editar:** metadatos, visibilidad, agua, peligro, facción, fuentes y notas privadas. La eliminación exige confirmación.
- **Viaje:** selecciona POIs ubicados o puntos libres. «Ruta manual» permite añadir puntos en orden, deshacer el último y terminar conservando el trazado. La alternativa directa dibuja una línea entre extremos.
- **Capas:** POIs, cuadrícula y red de viaje semántica. Los caminos y nombres impresos son parte inseparable del raster; los POIs aproximados se dibujan con un radio de incertidumbre.
- **Datos:** exporta campaña completa, POIs o red. La importación muestra un resumen y pide confirmar el reemplazo; puedes exportar una copia previa.

En móvil, «Abrir herramientas» muestra el panel y «Ver mapa» lo oculta. Iniciar una colocación deja libre el mapa.

## Procedencia y coordenadas

Los originales `routes.geojson`, `tiles/`, `tiles_new/` no se modifican. El catálogo `poi.json` conserva sus 42 registros iniciales, añade 72 procedentes de *The Wanderer's Chronicle* (Athas.org), 9 lugares de la campaña compartida del DM, 22 topónimos externos iniciales, 4 candidatos externos reconciliados de la revisión del PDF y 13 inscripciones nuevas del barrido global. `initialState()` migra determinísticamente los **162 POIs**: 57 con inscripción local, 3 con ubicación externa aproximada y 3 externos todavía sin situar (`Freedom`, `Roqom`, `Shault`). Los candidatos aproximados incluyen un radio de incertidumbre; ninguna posición se presenta como canónica sin evidencia del raster. Las entradas citan su fuente en `source` y el estado se muestra en la ficha.

El composite mide 4608 × 3328 píxeles; la caja no vacía ocupa **4589 × 3080** desde la esquina superior izquierda. El resto es relleno.

```text
Sistema: athas-image-normalized-v1
coordinates = { x: 0..1, y: 0..1 } o null
Origen: esquina superior izquierda; x hacia la derecha, y hacia abajo
Píxel de zoom 5: [x × 4589, y × 3080]
Leaflet [lat,lng]: [-y × 3080 / 32, x × 4589 / 32]
```

Los nombres lat/lng son de la API de Leaflet: no representan posiciones terrestres. Teselas XYZ de 256 píxeles, zooms nativos 0–5; el nivel 6 amplía el 5. Convención documentada: [Leaflet CRS.Simple](https://leafletjs.com/examples/crs-simple/crs-simple.html).

Se intercambia **JSON propio**, no GeoJSON RFC 7946, para no presentar coordenadas de fantasía como WGS84. Ejemplo de POIs:

```json
{
  "version": 1,
  "coordinateSystem": "athas-image-normalized-v1",
  "pois": [{
    "id": "campamento-personal", "name": "Campamento de la expedición",
    "type": "outpost", "region": "Mi campaña", "importance": 2,
    "confidence": 1, "tags": ["campaña"],
    "description": "Creación del usuario, no canónica.", "coordinates": null,
    "provenance": "user", "source": "Notas del DJ"
  }]
}
```

Las importaciones parciales reemplazan la colección correspondiente; no fusionan. Se validan categorías, identificadores únicos, límites, números finitos y referencias de red. Máximo por archivo: 10 MB. Exporta desde Datos para obtener un ejemplo completo con todos los campos.

## Escáner global de POIs

El detector reproducible trabaja sobre `tiles_new/zoom5_composite.png`, usando la caja útil 4589 × 3080. Divide el raster en ventanas solapadas, ejecuta OCR, busca símbolos oscuros cercanos, traduce todo a coordenadas globales y deduplica los solapes. Nunca publica directamente.

```sh
npm run scan:pois
npm run review:pois
python scripts/refine_poi_candidates.py --name kled-zone --box 1300,850,1850,1350
```

La ejecución validada produjo dos pasadas: 234→187 candidatos en gris y 261→212 en color; la unión conservadora quedó en 310 candidatos únicos. Los crops y JSON quedan en `output/poi-scan/` (ignorado por Git). El aplicador exige un manifiesto revisado y `--apply`, y crea backup; es idempotente para altas idénticas. Se publicaron 13 inscripciones puntuales confirmadas (`Gunginwald`, `Fort Butcher`, `Mira's Halo`, `Fort Skonz`, `Fort Ebon`, `Fort Ianto`, `Fort Sandol`, `Fort Adro`, `Fort Harbeth`, `Fort Fyra`, `Fort Courage`, `Fort Firstwatch`, `Utba`, `Jhazlim`) y se corrigió `Kled`. `Krikik's Pack`, `Iron Mines`, los picos cuya ancla requiere refinamiento adicional, carreteras, regiones y accidentes extensos permanecen sin promoción automática.

## Distancia y tiempo

**Geografía (fija):** la escala se calibra desde la barra impresa en el raster (0/10/20/30 mi). El ancho útil del mapa mide ≈ **408 millas**; no es editable por expedición para no alterar la geografía del mundo.

```text
distancia = hypot(Δx, Δy × 3080 / 4589) × 408   (millas)
```

**Reglas de viaje (D&D 5e):** el tiempo se calcula con la tabla oficial de ritmo diario, no con velocidades de AD&D 2e.

| Ritmo (a pie) | Mi por jornada |
|---|---|
| Lento | 18 |
| Normal | 24 |
| Rápido | 30 |

```text
jornadas = Σ por tramo [ segmento_mi / (ritmo_diario × terreno) ]
terreno  = carretera ×1 · resto ×0,5   (5e: normal vs difícil, adaptación Dark Sun)
días de marcha = ceil(jornadas)
```

- **Marcha forzada:** más de 8 h/jornada activa un aviso de tiradas de Constitución (5e); no multiplica la distancia.
- **Terreno por tramo:** cada waypoint del itinerario puede llevar `terrain`; si no, hereda el terreno global.
- **Modos de montura** (caravana 16 / montura 32 / kank 24 / mekillot 12 mi/día) son **adaptación homebrew** — no existe un Dark Sun 5e oficial — y no calibran la escala.
- **Calor, tormenta, carga y agua escasa** ya no modifican la velocidad: generan avisos de supervivencia (reglas de campaña, no 5e).
- La línea directa no evita obstáculos; la ruta manual suma segmentos. No hay pathfinding por aristas ni optimización de caminos todavía.

## Red extensible

`networkSchema` define nodos `{id,name,coordinates}` y aristas `{id,from,to,terrain,cost,distanceLabel,unit,source,evidence,confidence,dangers,traffic,status,restrictions,bidirectional}`. La red inicial de `travel-network.json` contiene **7 nodos y 4 tramos** revisados semánticamente desde `391_Athas_Travel_hi-res.pdf`. `distanceLabel` conserva el valor impreso y `unit: null` evita inventar si son millas, leguas u otra unidad. Se validan nodos referenciados e identificadores únicos.

La red se importa, exporta y visualiza uniendo nodos con segmentos rectos conceptuales; no reproduce la geometría del PDF ni calcula navegación. Las líneas muestran el valor editorial y «unidad pendiente». `routes.geojson` se conserva como artefacto experimental, pero ya no se carga ni se ofrece en la UI porque sus 4.593 segmentos proceden de detección de color/contraste, no de una red curada. Formato vacío válido:

```json
{
  "version": 1,
  "coordinateSystem": "athas-image-normalized-v1",
  "network": { "nodes": [], "edges": [], "source": "Mi campaña" }
}
```

`routes.geojson` se conserva únicamente como artefacto de investigación histórica. No se copia al build, no se carga en la UI y no se convierte en navegación: sus miles de segmentos proceden de detección de contraste y contienen falsos positivos.

## Persistencia y privacidad

La campaña compartida se guarda mediante `PUT /api/state` en el volumen Docker `athasmap_data`. Las escrituras requieren la contraseña configurada en `ATLAS_ADMIN_PASSWORD`; la interfaz la pide al primer cambio de cada pestaña y la mantiene sólo en `sessionStorage`. La contraseña no se incorpora al bundle ni a archivos versionados.

Cada guardado lleva una revisión. Si otra persona actualizó la campaña antes, el servidor rechaza la escritura y solicita recargar, para evitar sobrescrituras silenciosas. No hay usuarios ni permisos por persona: quien conozca la contraseña puede editar.

También se conserva una copia local en `localStorage`, clave `athas.atlas.v1`, para recuperación y exportación. Los fallos de acceso/cuota se comunican y el cambio fallido no se presenta como guardado. Las notas privadas no están cifradas y se incluyen en las exportaciones.

Para iniciar el despliegue, crea un `.env` local con `ATLAS_ADMIN_PASSWORD=wayan` (o usa otra contraseña) y ejecuta `docker compose up -d --build`.

## Archivos y verificación

| Archivo | Responsabilidad |
|---|---|
| `src/domain.ts` | Esquemas, migración, coordenadas, viaje, intercambio y persistencia |
| `src/AtlasMap.tsx` | Raster, marcadores, selección, líneas y capas |
| `src/App.tsx` | Catálogo, ficha, herramientas y flujos |
| `src/PoiEditor.tsx` | Edición de metadatos |
| `src/ConfirmDialog.tsx` | Confirmaciones con foco nativo |
| `src/style.css` | Diseño responsive y movimiento reducido |
| `src/domain.test.ts` | Pruebas de lógica y persistencia |
| `vite.config.ts` | Servicio de assets y copia al build |

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Las pruebas cubren migración, validación, coordenadas, relación de aspecto, distancias, tiempos, modificadores, errores de escritura, importación y red. No hay prueba de búsqueda de rutas porque ese algoritmo no se implementa. La revisión en navegador se documenta en `VERIFICATION.md`.

No se añaden fuentes web, ilustraciones ni material externo de Dark Sun. El directorio recibido no contiene `.git`; no se han creado commits. `frontend/` solo contenía dependencias antiguas y no se usa.

## Referencias externas consultadas

- [DarkSun Atlas de Digital Wanderer](https://www.digitalwanderer.net/darksun/): referencia de navegación con Leaflet. La página atribuye los materiales de Dark Sun a Wizards of the Coast.
- [The Athasian Cartographers’ Guild — World Maps](https://ds.daegmorgan.net/worldmaps.php): índice de cartografía mundial/regional y herramientas de cartografía de la comunidad.

Consultadas el 5 de septiembre de 2026. Son recursos de consulta, no fuentes importadas de coordenadas ni una licencia para redistribuir sus assets. No se han descargado sus imágenes, fuentes o símbolos al proyecto. Las escalas y versiones de esos mapas no se presuponen compatibles con el raster local.
