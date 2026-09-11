# Prompt maestro — 14 ilustraciones de ciudad (Athas Atlas)

Copia todo lo que hay entre las líneas en `gpt-5.6-luna`. Trabaja sobre el repo `C:\Users\JoseAntonioHernandez\Repos\athas`.

---

## Rol y objetivo

Eres el operador de generación de imágenes del proyecto Athas Atlas. Debes producir **una ilustración por cada una de las 14 ciudades** que alimentan el popup de ciudad de la webapp. El resultado son 14 archivos JPEG que se dejan en `cities/`, listos para el build.

El requisito central no es la calidad de una imagen suelta: es que **las 14 parezcan de la misma mano y del mismo mundo**. Ese es el criterio con el que se te va a juzgar.

## Modelo y llamadas

1. Comprueba primero qué identificadores tienes disponibles (`GET /v1/models`) y **no inventes nombres**. Si existe, usa **GPT-Image 2.5 Sunburst** (`gpt-image-2.5-sunburst`), que es el perfil de calidad; `gpt-image-2.5-flare` solo para pruebas rápidas; `gpt-image-2` como último recurso.
2. Generación desde texto: `POST /v1/images/generations`.
3. Generación **con referencia de estilo**: `POST /v1/images/edits` con `image=["cities/_style-anchor.png"]` y **sin `mask`**. Omitir la máscara es lo que cambia la semántica: sin máscara, la imagen de entrada es una *guía de estilo* para un render nuevo, no un lienzo a repintar. Esta es la pieza clave de la coherencia.
4. `quality: "high"`. Tamaño `1536x1024`; si el modelo admite tamaños flexibles, usa `1536x864` (16:9 exacto). Si solo acepta `1536x1024`, compón dejando aire arriba y abajo: el popup recorta a 16:9 con `object-fit: cover`.
5. **Una generación por imagen**: 14 llamadas, 14 archivos. Nunca `n > 1`, nunca una rejilla, collage, hoja de contactos ni una escena con varias ciudades. Si dudas, genera de nuevo en llamada aparte.
6. La clave de API se lee de su variable de entorno. **No la imprimas, no la registres en logs y no la escribas en ningún archivo ni en tu respuesta.**

## Coherencia de estilo (obligatorio)

No basta con describir el estilo en texto. Usa el mecanismo de referencia del modelo, en este orden:

1. **Fase 0 — ancla de estilo.** Genera UNA imagen `cities/_style-anchor.png` con `images/generations`. No es ninguna de las 14 ciudades: es un skyline genérico de Athas cuya única misión es fijar paleta, luz, materiales y acabado. Prompt del ancla:

   > Vista panorámica de una ciudad-estado genérica de Athas al atardecer, sin rasgos que la identifiquen con ninguna ciudad conocida: murallas erosionadas de adobe, cúpulas y torres de piedra, un zigurat inacabado al fondo, dunas y polvo en suspensión. `<BLOQUE DE ESTILO>`. Sin texto, sin logotipos, sin marcas de agua, sin marcos, sin personas mirando a cámara. Composición 16:9.

2. **Fase 1–14.** Para cada ciudad, `images/edits` con `image=["cities/_style-anchor.png"]`, sin máscara, y prompt compuesto así:

   > `<imagePrompt de la ciudad, verbatim>`. Mantén exactamente la paleta, la luz, los materiales y el acabado del ancla de estilo; **no copies su composición**. Sin texto, sin logotipos, sin marcas de agua, sin marcos, sin personas mirando a cámara. Composición 16:9, encuadre amplio que muestre la ciudad completa.

3. **Texto verbatim.** Lee el campo `imagePrompt` de cada guía en `city-guides.json` y úsalo tal cual: no parafrasees, no reordenes, no "mejores" la redacción y no lo traduzcas. El bloque de estilo debe ser **idéntico carácter a carácter** en las 14 llamadas; la única variable es el sujeto.
4. **Cadencia de re-anclaje.** Cada 4 imágenes, compara la última con `_style-anchor.png` (paleta, contraste, temperatura de luz, acabado). Si se ha desviado, repite esa generación con el mismo prompt y la misma referencia. Si el desvío persiste en varias, regenera el ancla y continúa desde ahí.
5. Si usas la Responses API con `previous_response_id` para refinar, recuerda que **cada ciudad sigue siendo una generación propia** y que el ancla debe estar presente en la llamada.

## Bloque de estilo (idéntico siempre)

```text
ilustración digital de fantasía oscura al estilo de la pintura TSR de Dark Sun de los 90 (Brom, Baxa): paleta terrosa y desaturada de ocre, bronce, óxido y sombras violáceas bajo un cielo de ceniza, luz de sol bajo y duro con polvo en suspensión y sombras marcadas, cámara cinematográfica amplia a tres cuartos y elevada que muestra la silueta completa de la ciudad contra el paisaje de Athas, arquitectura monumental y erosionada de piedra, adobe, hueso y obsidiana, atmósfera opresiva y grandiosa, detalle alto
```

Es el campo `imageStyle` de `city-guides.json`; si por lo que sea difieren, manda el JSON.

## Fuente y destino

- Lee `city-guides.json` → `guides[]`. De cada guía usa `id` e `imagePrompt`.
- Guarda cada resultado como `cities/<id>.jpg` (JPEG, calidad ~90, sin bordes añadidos). Los 14 ids:

```text
tyr  urik  nibenay  gulg  raam  draj  balic  celik
eldaarich  kurn  new-kurn  saragar  thamasku  ur-draxa
```

- No sobrescribas `cities/_style-anchor.png` y no toques `cities/README.md`.

## Verificación antes de terminar

1. `ls cities/*.jpg` → exactamente 14, uno por id, ninguno de otra extensión.
2. Comprueba dimensiones y que ninguna imagen trae texto, logotipo, firma ni marca de agua.
3. Monta una **hoja de contactos local** con ImageMagick (`montage cities/*.jpg -tile 4x4 -geometry +4+4 cities/_contact-sheet.jpg`) y revísala. Es una composición local para revisión, no una generación del modelo. Debe verse como un mismo mundo: misma paleta, misma luz, mismo acabado.
4. Reporta: modelo usado, ruta de los 14 archivos, tamaño, cuántas regeneraste y por qué, y cualquier ciudad cuyo resultado no te convenza.

## Prohibiciones

- No collages, ni rejillas, ni varias ciudades en una imagen.
- No cambiar el bloque de estilo entre llamadas.
- No añadir personas ni criaturas en primer plano.
- No modificar `poi.json`, `city-guides.json` ni el código de la webapp.
- No imprimir, registrar ni guardar credenciales.
