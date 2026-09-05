import { useEffect, useRef, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import AtlasMap from "./AtlasMap";
import PoiEditor from "./PoiEditor";
import {
  categories,
  symbols,
  initialState,
  loadState,
  saveState,
  errorText,
  parseImport,
  poiSchema,
  journey,
  distance,
  setEndpoint,
  type AtlasState,
  type Poi,
  type Point,
  type Travel,
} from "./domain";

type Mode =
  | { kind: "place"; id: string }
  | { kind: "new" }
  | { kind: "origin" }
  | { kind: "destination" }
  | { kind: "draw" }
  | null;
const modeNames = {
  foot: "A pie",
  caravan: "Caravana",
  mount: "Montura",
  kank: "Kank",
  mekillot: "Mekillot",
};
const waterNames = {
  unknown: "Sin confirmar",
  none: "No disponible",
  limited: "Escasa",
  available: "Disponible",
};
const dangerNames = {
  unknown: "Sin confirmar",
  low: "Bajo",
  medium: "Medio",
  high: "Alto",
};
function download(name: string, data: unknown, raw = false) {
  const url = URL.createObjectURL(
    new Blob([raw ? String(data) : JSON.stringify(data, null, 2)], {
      type: "application/json",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export default function App() {
  const [boot] = useState(() => {
    try {
      return { state: loadState(localStorage), error: "" };
    } catch (e) {
      return {
        state: initialState(),
        error: `No se pudo abrir el guardado: ${errorText(e)}. El original sigue intacto. Exporta una copia antes de reemplazarlo.`,
      };
    }
  });
  const storageSnapshot = useRef<string | null>(null);
  useEffect(() => {
    try {
      storageSnapshot.current = localStorage.getItem("athas.atlas.v1");
    } catch {
      /* Boot already reports inaccessible storage. */
    }
  }, []);
  const [state, setState] = useState(boot.state),
    [error, setError] = useState(boot.error),
    [storageBlocked, setStorageBlocked] = useState(!!boot.error),
    [status, setStatus] = useState(
      boot.error ? "Guardado bloqueado" : "Guardado local disponible",
    );
  const [tab, setTab] = useState<"places" | "travel" | "layers" | "data">(
      "places",
    ),
    [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState(""),
    [region, setRegion] = useState(""),
    [tag, setTag] = useState(""),
    [importance, setImportance] = useState(0),
    [pending, setPending] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(),
    [editor, setEditor] = useState<Poi>(),
    [mode, setMode] = useState<Mode>(null),
    [home, setHome] = useState(0);
  const [showPois, setShowPois] = useState(true),
    [grid, setGrid] = useState(false),
    [experimental, setExperimental] = useState(false),
    [showNetwork, setShowNetwork] = useState(true);
  const [deleteId, setDeleteId] = useState<string>(),
    [imported, setImported] = useState<AtlasState>();
  const selected = state.pois.find((p) => p.id === selectedId),
    unplaced = state.pois.filter((p) => !p.coordinates).length;
  const filtered = state.pois.filter(
    (p) =>
      (!query ||
        normalize(`${p.name} ${p.description} ${p.tags.join(" ")}`).includes(
          normalize(query),
        )) &&
      (!category || p.type === category) &&
      (!region || p.region === region) &&
      (!tag || p.tags.includes(tag)) &&
      p.importance >= importance &&
      (!pending || !p.coordinates),
  );
  const result = journey(state.itinerary, state.travel);
  function commit(next: AtlasState) {
    if (storageBlocked) {
      setError(
        "El guardado está bloqueado. Abre Datos para recuperar o reemplazar el archivo local.",
      );
      return false;
    }
    try {
      if (localStorage.getItem("athas.atlas.v1") !== storageSnapshot.current)
        throw new Error(
          "Otra pestaña ha cambiado la campaña. Recarga la página antes de editar para conservar sus cambios.",
        );
      saveState(localStorage, next);
      storageSnapshot.current = localStorage.getItem("athas.atlas.v1");
      setState(next);
      setStatus("Guardado en este navegador");
      setError("");
      return true;
    } catch (e) {
      setError(
        `No se guardó el cambio: ${errorText(e)}. Exporta tus datos o libera espacio y vuelve a intentarlo.`,
      );
      setStatus("Error de guardado");
      return false;
    }
  }
  function updateTravel(p: Partial<Travel>) {
    commit({ ...state, travel: { ...state.travel, ...p } });
  }
  function select(id: string) {
    setSelectedId(id);
    setEditor(undefined);
    setTab("places");
    setMobileOpen(true);
  }
  function startMode(m: Mode) {
    setMode(m);
    setMobileOpen(false);
  }
  function onPick(p: Point) {
    if (mode?.kind === "place") {
      if (
        commit({
          ...state,
          pois: state.pois.map((v) =>
            v.id === mode.id ? { ...v, coordinates: p } : v,
          ),
        })
      ) {
        setMode(null);
        setMobileOpen(true);
      }
    }
    if (mode?.kind === "new") {
      setEditor(
        poiSchema.parse({
          id: crypto.randomUUID(),
          name: "Nuevo lugar",
          type: "outpost",
          region: "",
          importance: 2,
          confidence: 1,
          tags: [],
          description: "",
          coordinates: p,
          source: "Campaña personal",
          provenance: "user",
        }),
      );
      setMode(null);
      setTab("places");
      setMobileOpen(true);
    }
    if (mode?.kind === "origin") {
      if (
        commit({
          ...state,
          itinerary: setEndpoint(state.itinerary, "origin", p),
        })
      ) {
        setMode(null);
        setMobileOpen(true);
      }
    }
    if (mode?.kind === "destination") {
      const origin = state.itinerary[0];
      if (!origin) {
        setError("Selecciona primero un origen.");
        return;
      }
      if (
        commit({
          ...state,
          itinerary: setEndpoint(state.itinerary, "destination", p),
        })
      ) {
        setMode(null);
        setMobileOpen(true);
      }
    }
    if (mode?.kind === "draw")
      commit({
        ...state,
        routeKind: "manual",
        itinerary: [...state.itinerary, p],
      });
  }
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMode(null);
        setEditor(undefined);
        setDeleteId(undefined);
        setImported(undefined);
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  function exportData(kind: "all" | "pois" | "network") {
    download(
      `athas-${kind}.json`,
      kind === "all"
        ? state
        : {
            version: 1,
            coordinateSystem: state.coordinateSystem,
            [kind]: state[kind],
          },
    );
  }
  const modeLabel =
    mode?.kind === "place"
      ? `Ubicar ${state.pois.find((p) => p.id === mode.id)?.name}`
      : mode?.kind === "new"
        ? "Nuevo lugar"
        : mode?.kind === "origin"
          ? "Elegir origen"
          : mode?.kind === "destination"
            ? "Elegir destino"
            : "Dibujar recorrido";
  return (
    <div className="app">
      <header className="topbar">
        <button
          className="sheet-toggle"
          aria-expanded={mobileOpen}
          aria-controls="atlas-sheet"
          onClick={() => setMobileOpen((v) => !v)}
        >
          <span aria-hidden="true" className="sheet-toggle-icon">
            {mobileOpen ? "✕" : "☰"}
          </span>
          <span className="sheet-toggle-label">Lugares</span>
          <b className="sheet-toggle-count">{state.pois.length}</b>
        </button>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setHome((v) => v + 1);
          }}
        >
          <span className="sun" aria-hidden="true">
            ◉
          </span>
          <span>
            ATHAS<small>ATLAS DEL SOL OSCURO</small>
          </span>
        </a>
        <div className="header-actions">
          <span className="save-status" role="status">
            <i
              className={
                status.includes("Error") || storageBlocked ? "bad" : ""
              }
            />
            {status}
          </span>
          <button
            onClick={() => {
              setTab("data");
              setMobileOpen(true);
            }}
          >
            Datos <span aria-hidden="true">↗</span>
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside
          id="atlas-sheet"
          className={`sidebar ${mobileOpen ? "open" : ""}`}
          aria-label="Herramientas del atlas"
        >
          <nav className="tabs" aria-label="Secciones">
            {(
              [
                ["places", "Lugares"],
                ["travel", "Viaje"],
                ["layers", "Capas"],
                ["data", "Datos"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                aria-pressed={tab === id}
                className={tab === id ? "active" : ""}
                onClick={() => {
                  setTab(id);
                  setEditor(undefined);
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="panel-content">
            {tab === "places" &&
              (editor ? (
                <PoiEditor
                  key={editor.id}
                  poi={editor}
                  onCancel={() => setEditor(undefined)}
                  onSave={(p) => {
                    if (
                      commit({
                        ...state,
                        pois: state.pois.some((v) => v.id === p.id)
                          ? state.pois.map((v) => (v.id === p.id ? p : v))
                          : [...state.pois, p],
                      })
                    ) {
                      setEditor(undefined);
                      setSelectedId(p.id);
                    }
                  }}
                />
              ) : selected ? (
                <>
                  <button
                    className="back"
                    onClick={() => setSelectedId(undefined)}
                  >
                    ← Todos los lugares
                  </button>
                  <div className="detail-symbol">{symbols[selected.type]}</div>
                  <p className="eyebrow">
                    {categories.find((c) => c.id === selected.type)?.label}
                  </p>
                  <h1>{selected.name}</h1>
                  <p className="muted">{selected.region}</p>
                  <p className="description">
                    {selected.description ||
                      "Este lugar aún no tiene una descripción."}
                  </p>
                  <div className="tag-list">
                    {selected.tags.map((t, i) => (
                      <span key={i}>{t}</span>
                    ))}
                  </div>
                  <dl className="facts">
                    <div>
                      <dt>Importancia</dt>
                      <dd>{selected.importance} / 5</dd>
                    </div>
                    <div>
                      <dt>Confianza</dt>
                      <dd>{selected.confidence} / 5</dd>
                    </div>
                    <div>
                      <dt>Agua</dt>
                      <dd>{waterNames[selected.water]}</dd>
                    </div>
                    <div>
                      <dt>Peligro</dt>
                      <dd>{dangerNames[selected.danger]}</dd>
                    </div>
                    <div>
                      <dt>Facción</dt>
                      <dd>{selected.faction || "Sin confirmar"}</dd>
                    </div>
                    <div>
                      <dt>En el mapa</dt>
                      <dd>{selected.visible ? "Visible" : "Oculto"}</dd>
                    </div>
                  </dl>
                  <div className="placement-note">
                    <strong>
                      {selected.coordinates
                        ? "Posición de campaña"
                        : "Pendiente de ubicar"}
                    </strong>
                    <p>
                      {selected.coordinates
                        ? "Ubicación introducida por el usuario; no verificada como canónica."
                        : "Consulta el mapa y sitúa este lugar. El catálogo original no aporta coordenadas."}
                    </p>
                    <button
                      className="primary"
                      onClick={() =>
                        startMode({ kind: "place", id: selected.id })
                      }
                    >
                      {selected.coordinates
                        ? "Mover en el mapa"
                        : "Situar en el mapa"}{" "}
                      <span>↗</span>
                    </button>
                  </div>
                  {selected.coordinates && (
                    <div className="two">
                      <button
                        onClick={() => {
                          if (
                            commit({
                              ...state,
                              itinerary: setEndpoint(
                                state.itinerary,
                                "origin",
                                selected.coordinates!,
                              ),
                            })
                          )
                            setTab("travel");
                        }}
                      >
                        Usar como origen
                      </button>
                      <button
                        disabled={!state.itinerary.length}
                        onClick={() => {
                          if (
                            commit({
                              ...state,
                              itinerary: setEndpoint(
                                state.itinerary,
                                "destination",
                                selected.coordinates!,
                              ),
                            })
                          )
                            setTab("travel");
                        }}
                      >
                        Usar como destino
                      </button>
                    </div>
                  )}
                  {selected.notes && (
                    <>
                      <h3>Notas privadas</h3>
                      <p className="description">{selected.notes}</p>
                    </>
                  )}
                  <p className="source">
                    {selected.provenance === "catalogue"
                      ? "Catálogo original"
                      : "Creación de campaña"}{" "}
                    · Fuente: {selected.source}
                  </p>
                  <div className="two">
                    <button onClick={() => setEditor(selected)}>
                      Editar lugar
                    </button>
                    <button
                      className="danger"
                      onClick={() => setDeleteId(selected.id)}
                    >
                      Eliminar
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="eyebrow">BAJO EL SOL OSCURO</p>
                  <div className="section-heading">
                    <h1>Explorar Athas</h1>
                    <span className="count">{state.pois.length}</span>
                  </div>
                  <p className="intro">
                    Un atlas para encontrar tu próximo destino.
                  </p>
                  <label className="search">
                    <span aria-hidden="true">⌕</span>
                    <input
                      aria-label="Buscar lugares"
                      placeholder="Buscar un lugar, una historia…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <span aria-hidden="true">⌘</span>
                  </label>
                  <div className="two">
                    <label>
                      Categoría
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                      >
                        <option value="">Todas las categorías</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Región
                      <select
                        value={region}
                        onChange={(e) => setRegion(e.target.value)}
                      >
                        <option value="">Todas las regiones</option>
                        {[...new Set(state.pois.map((p) => p.region))]
                          .sort()
                          .map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                      </select>
                    </label>
                  </div>
                  <details className="filters">
                    <summary>
                      Más filtros{tag || importance ? " · activos" : ""}
                    </summary>
                    <div className="two">
                      <label>
                        Etiqueta
                        <select
                          value={tag}
                          onChange={(e) => setTag(e.target.value)}
                        >
                          <option value="">Todas</option>
                          {[...new Set(state.pois.flatMap((p) => p.tags))]
                            .sort()
                            .map((t) => (
                              <option key={t}>{t}</option>
                            ))}
                        </select>
                      </label>
                      <label>
                        Importancia mínima
                        <select
                          value={importance}
                          onChange={(e) =>
                            setImportance(Number(e.target.value))
                          }
                        >
                          <option value={0}>Cualquiera</option>
                          {[1, 2, 3, 4, 5].map((i) => (
                            <option key={i} value={i}>
                              {i} / 5
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </details>
                  <button
                    className={`pending ${pending ? "active" : ""}`}
                    aria-pressed={pending}
                    onClick={() => setPending((v) => !v)}
                  >
                    <span>◎</span>
                    <span>
                      <strong>{unplaced} lugares pendientes</strong>
                      <small>Coloca el catálogo sobre el mapa</small>
                    </span>
                    <span>→</span>
                  </button>
                  <div className="list-heading">
                    <span>{filtered.length} LUGARES</span>
                    <button
                      className="text-button"
                      onClick={() => startMode({ kind: "new" })}
                    >
                      + Añadir lugar
                    </button>
                  </div>
                  <div className="poi-list">
                    {filtered.map((p) => (
                      <button
                        className="poi-row"
                        key={p.id}
                        onClick={() => select(p.id)}
                      >
                        <span className={`list-symbol ${p.type}`}>
                          {symbols[p.type]}
                        </span>
                        <span>
                          <strong>{p.name}</strong>
                          <small>
                            {categories.find((c) => c.id === p.type)?.label} ·{" "}
                            {p.region}
                          </small>
                        </span>
                        <span
                          className="location-status"
                          title={p.coordinates ? "Ubicado" : "Pendiente"}
                        >
                          {p.coordinates ? "●" : "○"}
                        </span>
                      </button>
                    ))}
                  </div>
                  {!filtered.length && (
                    <div className="empty">
                      <h3>No hay lugares coincidentes</h3>
                      <button
                        onClick={() => {
                          setQuery("");
                          setCategory("");
                          setRegion("");
                          setTag("");
                          setImportance(0);
                          setPending(false);
                        }}
                      >
                        Limpiar filtros
                      </button>
                    </div>
                  )}
                </>
              ))}
            {tab === "travel" && (
              <>
                <p className="eyebrow">CUADERNO DE EXPEDICIÓN</p>
                <h1>Preparar el viaje</h1>
                <p className="intro">Traza un camino. Cuenta el agua.</p>
                <label>
                  Tipo de recorrido
                  <select
                    value={state.routeKind}
                    onChange={(e) => {
                      setMode(null);
                      commit({
                        ...state,
                        routeKind: e.target.value as AtlasState["routeKind"],
                        itinerary:
                          state.itinerary.length > 1
                            ? [state.itinerary[0], state.itinerary.at(-1)!]
                            : state.itinerary,
                      });
                    }}
                  >
                    <option value="direct">
                      Distancia directa · línea recta
                    </option>
                    <option value="manual">
                      Ruta manual · puntos dibujados
                    </option>
                  </select>
                </label>
                <p className="hint">
                  {state.routeKind === "direct"
                    ? "La línea recta no evita montañas ni peligros."
                    : "Añade puntos en orden. El último será el destino."}{" "}
                  La navegación por red aún no está disponible.
                </p>
                {(["origin", "destination"] as const).map((kind, i) => (
                  <div className="endpoint" key={kind}>
                    <span className="endpoint-letter">{i ? "B" : "A"}</span>
                    <div>
                      <label>
                        {i ? "Destino" : "Origen"}
                        <select
                          aria-label={i ? "POI de destino" : "POI de origen"}
                          value=""
                          onChange={(e) => {
                            const p = state.pois.find(
                              (v) => v.id === e.target.value,
                            )?.coordinates;
                            if (p) {
                              if (i && !state.itinerary.length) {
                                setError("Selecciona primero un origen.");
                                return;
                              }
                              commit({
                                ...state,
                                itinerary: setEndpoint(
                                  state.itinerary,
                                  kind,
                                  p,
                                ),
                              });
                            }
                          }}
                        >
                          <option value="">
                            {state.itinerary[
                              i === 0 ? 0 : state.itinerary.length - 1
                            ] &&
                            (i === 0 || state.itinerary.length > 1)
                              ? "Punto seleccionado ✓"
                              : "Elegir un lugar ubicado"}
                          </option>
                          {state.pois
                            .filter((p) => p.coordinates)
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button
                        className="text-button"
                        disabled={i === 1 && !state.itinerary.length}
                        onClick={() => startMode({ kind })}
                      >
                        Elegir en el mapa ↗
                      </button>
                    </div>
                  </div>
                ))}
                {state.routeKind === "manual" && (
                  <button
                    className="primary full"
                    onClick={() => startMode({ kind: "draw" })}
                  >
                    + Dibujar puntos en el mapa
                  </button>
                )}
                {!!state.itinerary.length && (
                  <div className="two">
                    <button
                      onClick={() =>
                        commit({
                          ...state,
                          itinerary: state.itinerary.slice(0, -1),
                        })
                      }
                    >
                      Deshacer punto
                    </button>
                    <button
                      onClick={() => {
                        if (commit({ ...state, itinerary: [] })) setMode(null);
                      }}
                    >
                      Borrar recorrido
                    </button>
                  </div>
                )}
                <h3>Condiciones de marcha</h3>
                <label>
                  Modo de viaje
                  <select
                    value={state.travel.mode}
                    onChange={(e) => {
                      const m = e.target.value as Travel["mode"];
                      updateTravel({
                        mode: m,
                        pace: {
                          foot: 2.5,
                          caravan: 2,
                          mount: 4,
                          kank: 3,
                          mekillot: 1.5,
                        }[m],
                      });
                    }}
                  >
                    {Object.entries(modeNames).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="two">
                  <label>
                    Millas / hora
                    <input
                      type="number"
                      min="0.1"
                      max="30"
                      step="0.1"
                      value={state.travel.pace}
                      onChange={(e) => {
                        if (e.target.validity.valid)
                          updateTravel({ pace: Number(e.target.value) });
                      }}
                    />
                  </label>
                  <label>
                    Horas / jornada
                    <input
                      type="number"
                      min="1"
                      max="16"
                      value={state.travel.hours}
                      onChange={(e) => {
                        if (e.target.validity.valid)
                          updateTravel({ hours: Number(e.target.value) });
                      }}
                    />
                  </label>
                </div>
                <label>
                  Terreno
                  <select
                    value={state.travel.terrain}
                    onChange={(e) =>
                      updateTravel({
                        terrain: e.target.value as Travel["terrain"],
                      })
                    }
                  >
                    <option value="road">Camino firme</option>
                    <option value="sand">Arena y dunas</option>
                    <option value="rock">Erial rocoso</option>
                    <option value="mountain">Montañas</option>
                  </select>
                </label>
                <div className="conditions">
                  {(
                    [
                      ["heat", "Calor extremo"],
                      ["storm", "Tormenta de arena"],
                      ["load", "Carga pesada"],
                      ["scarceWater", "Agua escasa"],
                      ["useRoad", "Seguir rutas conocidas"],
                    ] as const
                  ).map(([k, label]) => (
                    <label className="check" key={k}>
                      <input
                        type="checkbox"
                        checked={state.travel[k]}
                        onChange={(e) =>
                          updateTravel({ [k]: e.target.checked })
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <details>
                  <summary>Escala de campaña</summary>
                  <label>
                    Millas en todo el ancho del mapa
                    <input
                      type="number"
                      min="1"
                      max="100000"
                      value={state.travel.scale}
                      onChange={(e) => {
                        if (e.target.validity.valid)
                          updateTravel({ scale: Number(e.target.value) });
                      }}
                    />
                  </label>
                  <p className="hint">
                    Valor inicial hipotético: 1.000 millas. Ajusta la escala a
                    tu campaña; no es una medición canónica.
                  </p>
                </details>
                <div className="travel-result">
                  <p className="eyebrow">
                    {state.routeKind === "manual"
                      ? "TRAZADO MANUAL"
                      : "DISTANCIA DIRECTA"}
                  </p>
                  {state.itinerary.length < 2 ? (
                    <p>
                      Selecciona origen y destino para calcular la expedición.
                    </p>
                  ) : (
                    <>
                      <div className="result-number">
                        {result.days.toFixed(1)} <span>jornadas</span>
                      </div>
                      <p>
                        ≈ {Math.ceil(result.days)} días de marcha ·{" "}
                        {result.miles.toFixed(1)} millas
                      </p>
                      <div className="result-meta">
                        {result.hours.toFixed(1)} h en movimiento ·{" "}
                        {result.daily.toFixed(1)} mi / jornada
                      </div>
                      {state.routeKind === "manual" && (
                        <p className="hint">
                          En línea recta:{" "}
                          {distance(
                            state.itinerary[0],
                            state.itinerary.at(-1)!,
                            state.travel.scale,
                          ).toFixed(1)}{" "}
                          mi · {state.itinerary.length} puntos
                        </p>
                      )}
                    </>
                  )}
                </div>
                {result.warnings.map((w) => (
                  <p className="warning" key={w}>
                    △ {w}
                  </p>
                ))}
                <p className="hint">
                  Estimación de campaña, no reglas oficiales. Sin descansos
                  adicionales, encuentros ni desvíos imprevistos.
                </p>
              </>
            )}
            {tab === "layers" && (
              <>
                <p className="eyebrow">LECTURA DEL TERRITORIO</p>
                <h1>Capas del atlas</h1>
                <p className="intro">Elige qué acompaña al mapa.</p>
                {[
                  [
                    showPois,
                    setShowPois,
                    "Lugares de campaña",
                    "Símbolos según categoría. Los filtros del catálogo también se aplican al mapa.",
                  ],
                  [
                    grid,
                    setGrid,
                    "Cuadrícula de referencia",
                    "Diez divisiones por eje para orientar y comparar.",
                  ],
                  [
                    showNetwork,
                    setShowNetwork,
                    "Red de viaje importada",
                    `${state.network.nodes.length} nodos · ${state.network.edges.length} aristas. Solo referencia; sin cálculo automático.`,
                  ],
                  [
                    experimental,
                    setExperimental,
                    "Trazos extraídos · experimental",
                    "Segmentos rojos detectados por imagen. No forman una red navegable.",
                  ],
                ].map(([value, setter, title, description]) => (
                  <label className="layer-row" key={String(title)}>
                    <input
                      type="checkbox"
                      checked={value as boolean}
                      onChange={(e) =>
                        (setter as (v: boolean) => void)(e.target.checked)
                      }
                    />
                    <span>
                      <strong>{title as string}</strong>
                      <small>{description as string}</small>
                    </span>
                  </label>
                ))}
                <div className="placement-note">
                  <strong>Mapa ilustrado original</strong>
                  <p>
                    Los caminos y nombres impresos forman parte del raster y no
                    pueden ocultarse por separado.
                  </p>
                </div>
                <h3>Leyenda de lugares</h3>
                <div className="legend">
                  {categories.map((c) => (
                    <div key={c.id}>
                      <span className={`list-symbol ${c.id}`}>
                        {symbols[c.id]}
                      </span>
                      {c.label}
                    </div>
                  ))}
                </div>
              </>
            )}
            {tab === "data" && (
              <>
                <p className="eyebrow">ARCHIVO DE CAMPAÑA</p>
                <h1>Tus datos</h1>
                <p className="intro">
                  Guardados en este navegador, para este origen web. Exporta
                  copias para conservarlos.
                </p>
                <dl className="facts">
                  <div>
                    <dt>Lugares</dt>
                    <dd>{state.pois.length}</dd>
                  </div>
                  <div>
                    <dt>Ubicados</dt>
                    <dd>{state.pois.length - unplaced}</dd>
                  </div>
                  <div>
                    <dt>Red</dt>
                    <dd>{state.network.edges.length} aristas</dd>
                  </div>
                </dl>
                <button
                  className="primary full"
                  onClick={() => exportData("all")}
                >
                  ↓ Exportar campaña completa
                </button>
                <div className="two">
                  <button onClick={() => exportData("pois")}>
                    Exportar POIs
                  </button>
                  <button onClick={() => exportData("network")}>
                    Exportar red
                  </button>
                </div>
                <p className="hint">
                  Los archivos exportados incluyen notas privadas. Revísalos
                  antes de compartir.
                </p>
                <h3>Importar JSON</h3>
                <p className="hint">
                  Acepta campañas completas, POIs o redes del atlas con
                  coordenadas normalizadas. Podrás revisar el reemplazo antes de
                  aplicarlo.
                </p>
                <label className="import-input">
                  Seleccionar archivo
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      try {
                        if (f.size > 10 * 1024 * 1024)
                          throw new Error("El archivo supera 10 MB.");
                        setImported(
                          parseImport(JSON.parse(await f.text()), state),
                        );
                        setError("");
                      } catch (err) {
                        setError(`Importación rechazada: ${errorText(err)}`);
                      }
                    }}
                  />
                </label>
                <h3>Datos y procedencia</h3>
                <p className="description">
                  Los 114 registros iniciales proceden de poi.json. Sus
                  posiciones están vacías. Las ubicaciones y notas que añadas
                  pertenecen a tu campaña.
                </p>
                <p className="description">
                  El mapa utiliza coordenadas de imagen, no latitud y longitud.
                  Los trazos extraídos son experimentales. No hay una red curada
                  incluida.
                </p>
                <p className="hint">
                  Formato JSON propio: athas-image-normalized-v1. GeoJSON
                  geográfico no se importa porque interpretaría estas posiciones
                  como coordenadas terrestres.
                </p>
                {storageBlocked && (
                  <div className="placement-note">
                    <h3>Recuperar guardado</h3>
                    <button
                      onClick={() => {
                        try {
                          const raw = localStorage.getItem("athas.atlas.v1");
                          if (raw === null)
                            throw new Error("No existe un guardado accesible.");
                          download("athas-guardado-original.json", raw, true);
                        } catch (e) {
                          setError(errorText(e));
                        }
                      }}
                    >
                      Descargar guardado original
                    </button>
                    <button
                      className="danger"
                      onClick={() => {
                        if (
                          window.confirm(
                            "¿Reemplazar el guardado no válido por los datos visibles? Exporta el original primero.",
                          )
                        ) {
                          try {
                            saveState(localStorage, state);
                            storageSnapshot.current =
                              localStorage.getItem("athas.atlas.v1");
                            setStorageBlocked(false);
                            setError("");
                            setStatus("Guardado recuperado");
                          } catch (e) {
                            setError(errorText(e));
                          }
                        }
                      }}
                    >
                      Reemplazar guardado
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          <footer className="sidebar-footer">
            <span>DARK SUN</span>
            <span>Atlas personal · v1.0</span>
          </footer>
        </aside>
        <main className="map-workspace">
          <AtlasMap
            pois={filtered}
            selected={selected}
            points={state.itinerary}
            manual={state.routeKind === "manual"}
            pick={!!mode}
            grid={grid}
            showPois={showPois}
            experimental={experimental}
            network={state.network}
            showNetwork={showNetwork}
            home={home}
            onPick={onPick}
            onSelect={select}
            onError={setError}
          />
          <div className="map-tools">
            <button
              title="Volver a vista general"
              aria-label="Volver a vista general"
              onClick={() => {
                setHome((v) => v + 1);
                setSelectedId(undefined);
              }}
            >
              ⌂
            </button>
            <button
              title="Añadir lugar desde el mapa"
              aria-label="Añadir lugar desde el mapa"
              className={mode?.kind === "new" ? "active" : ""}
              onClick={() => startMode({ kind: "new" })}
            >
              ＋
            </button>
            <button
              title="Planificar viaje"
              aria-label="Planificar viaje"
              onClick={() => {
                setTab("travel");
                setMobileOpen(true);
              }}
            >
              ↝
            </button>
          </div>
          {mode && (
            <div className="mode-banner" role="status">
              <span>
                <strong>{modeLabel}</strong>
                <small>
                  Toca el mapa o un marcador. Teclado: flechas y Enter en el
                  centro.
                  {mode.kind === "draw"
                    ? " Añade puntos en orden."
                    : " Esc cancela."}
                </small>
              </span>
              <button
                onClick={() => {
                  setMode(null);
                  setMobileOpen(true);
                }}
              >
                {mode.kind === "draw" ? "Terminar" : "Cancelar"}
              </button>
            </div>
          )}
          {!mode && unplaced === state.pois.length && (
            <div className="map-onboarding">
              <span>◎</span>
              <div>
                <strong>Tu campaña empieza en el mapa.</strong>
                <small>
                  Elige un lugar del catálogo para situarlo, o añade el tuyo.
                </small>
              </div>
              <button
                onClick={() => {
                  setTab("places");
                  setPending(true);
                  setSelectedId(undefined);
                  setMobileOpen(true);
                }}
              >
                Ubicar lugares →
              </button>
            </div>
          )}
          <div className="map-bottom">
            <span>◈ MAPA ILUSTRADO DE ATHAS · LAS TABLELANDS</span>
            <span>
              {experimental
                ? "TRAZOS EXPERIMENTALES · SIN NAVEGACIÓN"
                : "POSICIONES DE CAMPAÑA · ESCALA CONFIGURABLE"}
            </span>
          </div>
        </main>
      </div>
      {error && (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          <button aria-label="Cerrar aviso" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      {(deleteId || imported) && (
        <ConfirmDialog
          onClose={() => {
            setDeleteId(undefined);
            setImported(undefined);
          }}
        >
          <h2 id="confirm-title">
            {deleteId ? "Eliminar lugar" : "Importar campaña"}
          </h2>
          <p>
            {deleteId
              ? `¿Eliminar ${state.pois.find((p) => p.id === deleteId)?.name}? Se borrarán su posición y sus notas.`
              : `Se reemplazarán los datos correspondientes. El resultado tendrá ${imported!.pois.length} lugares y ${imported!.network.edges.length} aristas.`}
          </p>
          {imported && (
            <button onClick={() => exportData("all")}>
              Exportar copia antes de importar
            </button>
          )}
          <div className="two">
            <button
              autoFocus
              onClick={() => {
                setDeleteId(undefined);
                setImported(undefined);
              }}
            >
              Cancelar
            </button>
            <button
              className="primary"
              onClick={() => {
                if (deleteId) {
                  if (
                    commit({
                      ...state,
                      pois: state.pois.filter((p) => p.id !== deleteId),
                    })
                  ) {
                    setDeleteId(undefined);
                    setSelectedId(undefined);
                  }
                } else if (imported && commit(imported)) {
                  setImported(undefined);
                  setSelectedId(undefined);
                  setEditor(undefined);
                  setMode(null);
                }
              }}
            >
              {deleteId ? "Eliminar" : "Aplicar importación"}
            </button>
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}
