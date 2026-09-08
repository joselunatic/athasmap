# Verificación · 5 de septiembre de 2026

## Comprobaciones automáticas

- `npm test`: **15 pruebas superadas** (Vitest).
- `npm run typecheck`: TypeScript estricto sin errores; también se ejecuta dentro de `npm run build`.
- `npm run lint`: salida 0, sin errores.
- `npm run build`: salida 0. Bundle JS de 478,37 kB (143,12 kB gzip), CSS de 29,73 kB (10,37 kB gzip).
- Avisos no bloqueantes: Rollup retira dos anotaciones de comentarios de Zod que no puede interpretar; no hay errores de compilación.
- `npm install`: auditoría inicial con 0 vulnerabilidades reportadas. Versiones exactas en `package-lock.json`.
- Producción con `npm run preview -- --port 4173`: HTML, teselas de zoom 0/5 y `routes.geojson` responden HTTP 200 con tipos correctos.
- Las **326 teselas** copiadas a `dist/tiles_new` coinciden byte por byte (SHA-256) con los originales. El GeoJSON copiado también es idéntico.

## Navegador

Revisión real mediante Playwright CLI/Chromium, escritorio 1440 × 1000 y móvil 390 × 844. No sustituye a pruebas en dispositivos físicos.

Flujos ejecutados:

1. Carga del raster y vista general.
2. Búsqueda de Tyr, apertura de ficha y colocación por clic.
3. Edición de notas privadas y recarga: marcador y nota siguen presentes.
4. Selección de origen por POI y destino por punto libre; cálculo de millas, horas y jornadas.
5. Activación de tormenta y actualización de advertencias.
6. Ruta manual con tres puntos. Cambio de destino desde selector conservando los tres puntos.
7. Navegación móvil, apertura/cierre del panel y acceso a Datos.
8. Creación de un oasis desde el mapa en móvil; eliminación mediante diálogo de confirmación.
9. Exportación de campaña a JSON; archivo inspeccionado con 42 POIs y tres puntos de itinerario.
10. Rechazo de JSON mal formado, con aviso visible.
11. Reimportación de la campaña exportada tras confirmar el resumen.
12. Importación parcial de una red sintética de dos nodos y una arista; conserva los 42 POIs. Los datos de prueba se limitan al perfil de navegador de QA y no se incluyen en el catálogo inicial.
13. Activación de cuadrícula y trazos experimentales. Los trazos presentan abundantes falsos positivos, coherentes con su condición experimental.
14. Consola tras recarga y prueba de capas: cero errores y cero advertencias.

## Regresiones corregidas durante la revisión

- Datos era inaccesible en móvil porque solo existía en la cabecera oculta: se añadió a las pestañas.
- Elegir un destino por POI eliminaba puntos intermedios: todos los controles usan ahora `setEndpoint`; una prueba específica cubre el caso.
- El panel móvil cerrado quedaba desplazado pero seguía aceptando foco: ahora se oculta también con `visibility`.
- El favicon ausente producía un 404 inicial: se incluyó un favicon SVG propio incrustado.

## Evidencia visual

Capturas locales de la revisión (no contienen posiciones canónicas):

- `output/playwright/desktop-final.png`: versión compilada en escritorio.
- `output/playwright/mobile-map.png`: mapa y recorrido de prueba en móvil.
- `output/playwright/mobile-layers.png`: cuadrícula y extracción experimental, mostrando sus falsos positivos.

Los snapshots, archivos JSON de prueba y capturas de QA están ignorados para control de versiones.

## Límites de esta versión

No hay coordenadas canónicas inventadas, red curada ni algoritmo de navegación. La escala y los ritmos son supuestos de campaña editables. El intercambio es JSON propio, no GeoJSON terrestre. Persistencia local por navegador/origen, sin sincronización, cifrado o servicio offline. Las condiciones de viaje se aplican globalmente al trayecto. No se ha realizado auditoría de lector de pantalla ni validación en Safari/Firefox o dispositivos físicos.

La navegación con flechas y Enter está implementada para colocar el centro del mapa con teclado; no se ha realizado una auditoría integral de todos los recorridos de foco.

## Ampliación del catálogo (6 de septiembre de 2026)

- `poi.json` pasa de 42 a **114 POIs**: se añaden 72 registros de *The Wanderer's Chronicle* (Athas.org) extraídos del DarkSun Atlas de Digital Wanderer. Los 42 originales no se modifican; las entradas nuevas citan su fuente en `source` y entran como Pendientes (`coordinates: null`). Extracción y criterios en `output/dw-extract/README.md` (carpeta ignorada por git).
- `npm test`: 15 pruebas superadas con el nuevo conteo (114).
- `npm run typecheck`, `npm run lint`, `npm run build`: sin errores.
- Backup de la fusión: `poi.json.bak-20260906-005551`.

## Reconocimiento de inscripciones del mapa (6 de septiembre de 2026)

- Barrido del raster local (4589×3080) en crops nativos con visión + cruce contra el catálogo: se reconocieron y **validaron las 7 ciudades-estado** (Tyr, Urik, Raam, Draj, Nibenay, Gulg, Balic). Tyr se confirmó por correspondencia de plantilla con un recorte de tile del usuario + comparación visual; el resto por doble lectura de crops de validación con su símbolo de ciudad (anillo rojo).
- `provenance` gana el valor `mapa`; las 7 entradas llevan `coordinates` (normalizadas sobre la caja 4589×3080) y `source: Inscripción del mapa «The Tyr Region» (TSR 1991)`. El resto del catálogo sigue pendiente (107 sin coordenadas).
- Método y candidatos de una sola lectura (fortalezas, oasis, pueblos: Fort Inix, Kled, Bodach, Lost Oasis, Walis, Giustenal, Ledopolus, Grak's Pool…) en `output/dw-extract/ocr-pois.json` (carpeta ignorada por git). La visión transcribe mal ciertas tipografías («T88» por TYR) y alucina topónimos; por eso cada punto requiere doble lectura y el cruce con el catálogo.
- Verificación visual: los 7 marcadores aparecen dispersos sobre tierra firme en la vista general.

## Segunda pasada de reconocimiento (6 de septiembre de 2026)

- Validación por doble lectura de los candidatos de una sola lectura: **14 nuevos POIs situados** (Fort Inix, Hidden Village, Bodach, Kled, Lost Oasis, Grak's Pool, North y South Ledopolus, Giustenal, Estuary of the Forked Tongue, Fort Melidor, Altaruk, Oasis of Kemalok, Dragon's Bowl). Total: **21 POIs con coordenadas** (provenance `mapa`), 93 pendientes.
- Hallazgos del mapa que NO casan con el catálogo (documentados, sin integrar): el fuerte de (3445,646) se rotula **«Fort Firstwatch»** en el mapa (5 lecturas, una letra a letra) — no Eastwatch; «Fort Iron» (1729,1332) junto a The Iron Road no está en el catálogo; «Dragon's Palate» (sur) no es Dragon's Bowl (que está en el norte); Fort Crescent, Fort Vordon, Oasis of Tyr, Celik y Ledopolus Oasis no se han localizado como inscripciones. Candidatos y notas en `output/dw-extract/ocr-pois.json` y `output/dw-extract/ui-sketches/`.
- Verificación visual: 21 marcadores sobre tierra firme, sin puntos en el mar ni fuera del mapa.

## Fuentes externas y mapa de viaje (8 de septiembre de 2026)

- Inspección de `391_Athas_Travel_hi-res.pdf`: PDF rasterizado con dos Optional Content Groups (`Test 3 Roads`, 21 cápsulas; `Test 3 Wilds`, 28 cápsulas). Los valores se extraen como evidencias, pero la geometría no se transfiere por píxel al raster local.
- Tres revisores independientes Luna/xhigh analizaron oeste, centro y este/sur. Consolidación: 35 lecturas → 29 topónimos únicos; se importaron solo los **22 de confianza alta**. Los 7 restantes permanecen en `output/external-poi-workers/consolidated-candidates.json` para revisión posterior.
- `poi.json`: 114 → **136 POIs**. Los 22 nuevos tienen `provenance: externa`, `coordinates: null` y fuente explícita del PDF. No se presentan como posiciones nativas ni aproximadas.
- Se añaden `externa` y `externa_aproximada` al dominio; la UI etiqueta ambas de manera explícita. Arquitectura, pipeline y criterios en `docs/TRAVEL_AND_EXTERNAL_POIS.md`.
- Red semántica investigada, no integrada aún: Urik—Dragon's Bowl (Roads 200), Altaruk—Grak's Pool (Roads 80), Grak's Pool—South Ledopolus (Roads 75), Raam—Draj (Roads 160); dataset en `output/athas-travel-workers/reviewed-travel-network.v0.json`.
- Validación: `npm test` (17/17), `npm run typecheck`, `npm run lint`, `npm run build` superados.
