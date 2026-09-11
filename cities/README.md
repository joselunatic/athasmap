# Imágenes de ciudad

Aquí van las ilustraciones del popup de ciudad. **Un archivo por ciudad**, nombrado con el `id` de `city-guides.json`:

```text
cities/
  tyr.jpg
  urik.jpg
  nibenay.jpg
  gulg.jpg
  raam.jpg
  draj.jpg
  balic.jpg
  celik.jpg
  eldaarich.jpg
  kurn.jpg
  new-kurn.jpg
  saragar.jpg
  thamasku.jpg
  ur-draxa.jpg
```

- Formatos admitidos: `.jpg`, `.jpeg`, `.png`, `.webp`.
- Proporción recomendada: **16:9** (el popup la recorta a esa ratio con `object-fit: cover`).
- Si falta la imagen, el popup muestra un marcador con el símbolo ◈; no se rompe.
- En desarrollo, Vite sirve `/cities/<archivo>`; en el build se copian a `dist/cities/`.

El prompt de generación de cada ciudad está en `city-guides.json` (campo `imagePrompt`), con un `imageStyle` común para que todas las ilustraciones compartan estilo.
