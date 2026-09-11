# Athas Atlas — POIs externos y rutas semánticas

## Resultado
Mostrar lugares adicionales descubiertos en el mapa de viaje de forma trazable, y sustituir los trazos automáticos no fiables por una red de tramos semánticos verificables.

## Usuarios
Personas que consultan el atlas para preparar o dirigir partidas en Athas.

## Alcance
- Revisar candidatos PDF frente a `poi.json` y el raster local.
- Marcar cada ubicación como `mapa`, `externa_aproximada` o pendiente, con fuente visible.
- Modelar rutas PDF como aristas conceptuales entre POIs con evidencia y valor sin unidad inventada.
- Retirar de la UI la capa de extracción raster experimental mientras no exista una red curada.

## No objetivos
- No modificar `tiles_new/` ni redibujar el arte base.
- No transferir coordenadas ni geometrías píxel a píxel desde el PDF.
- No afirmar unidades de distancia ni calcular jornadas.
- No representar candidatos sin evidencia suficiente como posiciones exactas.

## Criterios de aceptación
1. Cada POI nuevo tiene ID canónico, categoría, fuente y estado de colocación explícito.
2. Los rótulos/símbolos visibles en el raster se registran como `mapa`; las inferencias contextuales como `externa_aproximada` con radio de incertidumbre; los dudosos siguen sin coordenadas.
3. La red visible contiene solo aristas con ambos extremos, evidencia y confianza revisadas.
4. La opción de trazos automáticos no se muestra al usuario mientras `routes.geojson` siga siendo un experimento de detección de color.
5. Tests, typecheck, lint, build y comprobación visual pasan.
6. `main` remoto contiene la entrega integrada sin conflictos ni artefactos de investigación.
7. Un escáner global de rótulos y símbolos produce inventario de candidatos con crops, anchors, scores y deduplicación, sin mutar el catálogo.
8. La reconciliación separa texto puntual, rutas y accidentes; solo un manifiesto revisado puede publicar `provenance: mapa`.
9. Las coordenadas aceptadas se derivan del símbolo nativo en la caja útil 4589×3080 y se verifican visualmente.
10. El estado final debe pasar tests, typecheck, lint, build y QA visual antes de desplegar.
