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

`dist/` puede servirse en la raíz de un servidor estático. Incluye teselas 0–5 y los trazos experimentales; no copia el composite de referencia de 33 MB. No uses `file://`.

## Uso

- **Lugares:** busca por nombre, descripción o etiquetas y filtra por categoría, región, etiqueta e importancia. «Pendientes» muestra registros sin coordenadas. Los filtros también afectan a los marcadores.
- **Situar/mover:** abre una ficha, pulsa «Situar en el mapa» y elige una posición. Cancelar/Escape conserva la posición anterior hasta el clic. Con teclado, enfoca el mapa, desplázalo con flechas y pulsa Enter para elegir el centro.
- **Crear:** botón `+`, clic en el mapa, completa el formulario y guarda. Cancelar no crea el registro.
- **Editar:** metadatos, visibilidad, agua, peligro, facción, fuentes y notas privadas. La eliminación exige confirmación.
- **Viaje:** selecciona POIs ubicados o puntos libres. «Ruta manual» permite añadir puntos en orden, deshacer el último y terminar conservando el trazado. La alternativa directa dibuja una línea entre extremos.
- **Capas:** POIs, cuadrícula, red importada y trazos experimentales. Caminos y nombres impresos son parte inseparable del raster.
- **Datos:** exporta campaña completa, POIs o red. La importación muestra un resumen y pide confirmar el reemplazo; puedes exportar una copia previa.

En móvil, «Abrir herramientas» muestra el panel y «Ver mapa» lo oculta. Iniciar una colocación deja libre el mapa.

## Procedencia y coordenadas

Los originales `routes.geojson`, `tiles/`, `tiles_new/` y `scripts/` no se modifican. El catálogo `poi.json` conserva sus 42 registros iniciales y añade 72 más procedentes de *The Wanderer's Chronicle* (Athas.org), extraídos del DarkSun Atlas de Digital Wanderer (5 de septiembre de 2026; ver `output/dw-extract/`). `initialState()` migra determinísticamente los **123 POIs**, conserva sus campos y añade valores por defecto. Nueve lugares proceden del historial de campaña `result.json`: Fuerte Hierro y Ablath tienen rótulo cartográfico confirmado; los demás quedan pendientes de asociar por el DM. Ninguna posición de campaña se presenta como canónica. «Catálogo original» indica procedencia, no verificación editorial independiente; las entradas de la remesa citan su fuente en el campo `source`.

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

## Distancia y tiempo

La escala inicial es una **hipótesis de 1.000 millas para todo el ancho**, editable en Viaje → Escala de campaña; no una calibración oficial.

```text
distancia = escala × hypot(Δx, Δy × 3080 / 4589)
velocidad efectiva = ritmo × terreno × calor × tormenta × carga × agua × camino
horas = suma de distancias de segmentos / velocidad efectiva
jornadas = horas / horas de marcha diarias
días de marcha = ceil(jornadas)
```

Valores de campaña, no reglas oficiales:

| Ajuste | Valor |
|---|---|
| Ritmo a pie / caravana / montura / kank / mekillot | 2,5 / 2 / 4 / 3 / 1,5 mi/h |
| Horas iniciales por jornada | 8 |
| Camino / arena / roca / montaña | ×1 / ×0,7 / ×0,8 / ×0,45 |
| Calor / tormenta / carga / agua escasa | ×0,75 / ×0,4 / ×0,75 / ×0,7 |
| Seguir rutas conocidas | ×1,15, excepto en camino firme |

El ritmo es editable y se muestra el avance diario efectivo. Las condiciones afectan a todo el recorrido. La línea directa no evita obstáculos; la ruta manual suma segmentos y también muestra la distancia directa entre extremos. No hay detección automática del terreno, raciones, descansos, encuentros ni optimización de caminos.

## Red extensible

`networkSchema` define nodos `{id,name,coordinates}` y aristas `{id,from,to,terrain,cost,dangers,traffic,status,restrictions,bidirectional}`. Terreno: road/sand/rock/mountain; estados: open/closed/uncertain; tránsito: low/medium/high. `cost` es un factor positivo reservado para un futuro motor. Se validan nodos referenciados e identificadores únicos.

La red se importa, exporta y visualiza uniendo nodos con segmentos rectos. No hay algoritmo de navegación porque no existe una red curada fiable. Formato vacío válido:

```json
{
  "version": 1,
  "coordinateSystem": "athas-image-normalized-v1",
  "network": { "nodes": [], "edges": [], "source": "Mi campaña" }
}
```

`routes.geojson` es una capa experimental bajo demanda. Se invierte la función `tile_px_to_lonlat` de `scripts/extract_routes_tiles.py` con sus constantes, sin Web Mercator. No se convierte en navegación. Sus miles de segmentos se dibujan con Canvas y pueden tardar en equipos modestos.

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
