# Escáner global de POIs

## Objetivo

`scan_poi_candidates.py` recorre una sola vez la caja útil del raster local y produce propuestas revisables. No modifica `poi.json`.

La fuente canónica es `tiles_new/zoom5_composite.png`; sus píxeles útiles son 4589 × 3080, con origen arriba a la izquierda. Las coordenadas se guardan como píxel global y como `athas-image-normalized-v1`.

## Flujo

1. Se divide la caja útil en ventanas solapadas. El solape permite que un rótulo que cruza un límite se detecte más de una vez.
2. RapidOCR analiza variantes de color/gris/contraste. El barrido rápido usa `--variants gray`; las variantes pesadas se reservan para crops dudosos.
3. Cada lectura se traduce inmediatamente de coordenadas locales de ventana a coordenadas globales.
4. Se intenta asociar un símbolo oscuro cercano al rótulo. Si existe, el anchor es el centro del símbolo; el centro del texto solo se conserva como fallback de baja confianza.
5. Se normaliza la lectura y se compara con el diccionario del catálogo y de los resultados PDF. El matching propone nombres, no autoriza procedencia `mapa`.
6. Se deduplican lecturas con el mismo nombre y anchor próximo procedentes de solapes o variantes.
7. Se guarda un crop de evidencia por candidato en `output/poi-scan/crops/` y un índice en `output/poi-scan/candidates.json`.

## Revisión

- `mapa`: lectura local inequívoca y símbolo/anchor estable.
- `externa_aproximada`: contexto útil, pero la etiqueta local no confirma el nombre.
- pendiente: lectura parcial, símbolo ambiguo o nombre sin correspondencia segura.
- `route_or_region`: etiqueta de carretera, región, cañón u otro rasgo no puntual; no se convierte en POI.

Solo los candidatos aceptados tras revisión visual se incorporan mediante un script separado con backup y `--apply` explícito.

## Ejemplo

```sh
python scripts/scan_poi_candidates.py \
  --raster tiles_new/zoom5_composite.png \
  --output output/poi-scan \
  --tile 1280 --overlap 0.15 \
  --variants gray
```

Para revisar una lectura concreta, volver a ejecutar su crop con `colour,gray,blackhat,adaptive` y comparar la posición del símbolo. No usar la posición de una captura de navegador como coordenada canónica.
