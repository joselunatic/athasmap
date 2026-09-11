# Plan de implementación

## 1. Reconciliar datos (bloqueante)
- Canonicalizar IDs de hallazgos (`echoing_mine` → `echoing-mine`, etc.).
- Revisar Black Waters, Cromlin y Roqom, que tienen evidencia nueva pero no están en el lote publicado.
- Aplicar solo posiciones que superen la revisión: `mapa` si hay rótulo local; `externa_aproximada` si solo hay contexto.
- Mantener Freedom y Shault con coordenadas nulas.

**Aceptación:** conteos e invariantes actualizados; fuente y procedencia visibles; sin coordenadas inventadas.

## 2. Sustituir la capa experimental (bloqueante para UI)
- Eliminar el interruptor y renderizado de `routes.geojson` del flujo de usuario.
- Mantener el archivo fuera de la lógica de producto.

**Aceptación:** no hay trazos automáticos al activar capas; filtros/selección conservan comportamiento.

## 3. Red semántica curada
- Crear esquema y dataset separado para los cuatro tramos PDF ya revisados.
- Renderizarlo como capa conmutable y rotulada como conceptual.

**Aceptación:** cada arista tiene extremos existentes, evidencia, valor y unidad nula; no se dibujan geometrías PDF.

## 4. Verificación e integración
- Ejecutar tests, typecheck, lint, build y QA visual local.
- Revisar diff, commit, push y lectura de `origin/main`.

## Modelo de ejecución
Hermes directo para reconciliación y UI (archivos compartidos). Revisión independiente de solo lectura antes de publicar porque cambia datos y representación cartográfica. Sin nuevos worktrees ni Kanban: trabajo acotado, un integrador y sin dependencias duraderas.

## 5. Inventario global de inscripciones
- Recorrer `tiles_new/zoom5_composite.png` en ventanas globales con solape.
- Ejecutar OCR en vistas de color/gris/contraste y traducir cajas al lienzo 4589×3080.
- Asociar cada rótulo a un símbolo nativo, guardar crop y deduplicar lecturas.

**Aceptación:** `output/poi-scan/candidates.json` contiene canvas, parámetros, anchors, puntuaciones y evidencia; ningún candidato modifica `poi.json`.

## 6. Revisión y reconciliación
- Cruzar candidatos contra el catálogo y calcular desplazamientos.
- Revisar visualmente las propuestas nuevas y los POIs desplazados.
- Clasificar rutas, regiones y accidentes extensos fuera del modelo puntual.

**Aceptación:** un manifiesto separado enumera cada alta/corrección, evidencia y decisión; solo las entradas aceptadas se aplican con backup.

## 7. Integración verificada
- Actualizar invariantes, documentación y migración de snapshots.
- Ejecutar tests, typecheck, lint, build y QA visual de los anchors publicados.

**Aceptación:** 162 POIs, 57 `mapa`, 3 `externa_aproximada`, 3 externos sin situar; no se solicitan `routes.geojson`.

## 9. Escáner global de inscripciones
- Ejecutar gris y color sobre la caja útil de 4589×3080 con ventanas solapadas.
- Unir por nombre normalizado y distancia de anchor; separar punto, ruta y paisaje.
- Exigir crop nativo y símbolo para `mapa`; el detector nunca publica directamente.
- Aplicar manifiestos idempotentes con backup y ejecutar los gates completos.

**Estado:** implementado. Dos pasadas reales produjeron 310 candidatos únicos; 13 altas y un ajuste de coordenada fueron aceptados tras revisión visual. Los candidatos restantes quedan en `output/poi-scan/combined-review.json`.

## 10. Límites pendientes
- Refinar detecciones parciales como `Krikik's Pack` y distinguir `Iron Mines` de `Fort Iron`.
- No promover lecturas fuzzy ni nombres de carreteras/regiones sin crop inequívoco y símbolo puntual.
