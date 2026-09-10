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
