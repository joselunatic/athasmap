import { describe, it, expect } from "vitest";
import {
  initialState,
  poiSchema,
  stateSchema,
  pointSchema,
  toMap,
  fromMap,
  distance,
  journey,
  defaultTravel,
  HEIGHT,
  WIDTH,
  MAP_WIDTH_MILES,
  saveState,
  loadState,
  parseImport,
  networkSchema,
  setEndpoint,
  mergeSeedState,
  provenanceLabel,
  symbols,
} from "./domain";

describe("Catálogo y validación", () => {
  it("incluye 162 lugares: 57 inscritos, 3 aproximados y 3 externos sin situar", () => {
    const state = initialState();
    expect(state.pois).toHaveLength(162);
    expect(state.pois.filter((p) => p.coordinates === null)).toHaveLength(102);
    expect(state.pois.filter((p) => p.provenance === "externa")).toHaveLength(3);
    expect(state.pois.filter((p) => p.provenance === "externa_aproximada")).toHaveLength(3);
    expect(state.pois.filter((p) => p.provenance === "mapa")).toHaveLength(57);
    const situados = state.pois.filter((p) => p.coordinates !== null);
    expect(situados).toHaveLength(60);
    expect(situados.every((p) => p.provenance !== "user")).toBe(true);
    expect(state.pois.find((p) => p.id === "roqom")?.coordinates).toBeNull();
    expect(state.pois.find((p) => p.id === "roqom")?.provenance).toBe("externa");
    const tyr = state.pois.find((p) => p.id === "tyr")!;
    expect(tyr.tags).toContain("ciudad-libre");
    expect(tyr.coordinates).toEqual({ x: 0.2787, y: 0.389 });
    expect(tyr.provenance).toBe("mapa");
    expect(tyr.source).toContain("Inscripción del mapa");
    expect(state.pois.find((p) => p.id === "fort_iron")?.coordinates).not.toBeNull();
    for (const id of [
      "gunginwald",
      "fort_butcher",
      "miras_halo",
      "fort_skonz",
      "kled",
      "fort_ebon",
      "fort_ianto",
      "fort_sandol",
      "fort_adro",
      "fort_harbeth",
      "fort_fyra",
      "fort_courage",
      "fort_firstwatch",
      "utba",
      "jhazlim",
    ]) {
      expect(state.pois.find((p) => p.id === id)?.provenance).toBe("mapa");
      expect(state.pois.find((p) => p.id === id)?.coordinates).not.toBeNull();
    }
    expect(state.pois.find((p) => p.id === "hoja_rota")?.coordinates).toBeNull();
    expect(state.pois.find((p) => p.id === "gunginwald")?.coordinates).toEqual({
      x: 0.289169754,
      y: 0.334577922,
    });
    expect(state.pois.find((p) => p.id === "fort_butcher")?.type).toBe("fortress");
    expect(state.pois.find((p) => p.id === "miras_halo")?.type).toBe("special_site");
    expect(state.pois.find((p) => p.id === "fort_skonz")?.coordinates).toEqual({
      x: 0.334937895,
      y: 0.449857143,
    });
    expect(state.pois.find((p) => p.id === "kled")?.coordinates).toEqual({
      x: 0.360209196,
      y: 0.354730519,
    });
  });
  it("carga la red semántica curada con cuatro tramos y unidad pendiente", () => {
    const network = initialState().network;
    expect(network.nodes).toHaveLength(7);
    expect(network.edges).toHaveLength(4);
    expect(network.edges.every((edge) => edge.distanceLabel && edge.source && edge.evidence)).toBe(true);
    expect(network.edges.every((edge) => edge.unit === null)).toBe(true);
  });
  it("migra snapshots antiguos sin perder cambios manuales", () => {
    const current = initialState();
    const stale = stateSchema.parse({
      ...current,
      pois: current.pois
        .filter((poi) => !["black-waters", "cromlin", "roqom", "shault"].includes(poi.id))
        .map((poi) =>
          poi.id === "yaramuke"
            ? { ...poi, coordinates: null, provenance: "externa", notes: "Nota del DJ" }
            : poi,
        ),
      network: { nodes: [], edges: [], source: "Sin red curada" },
    });
    const migrated = mergeSeedState(stale);
    expect(migrated.pois).toHaveLength(162);
    expect(migrated.pois.find((poi) => poi.id === "yaramuke")?.coordinates).toEqual(
      current.pois.find((poi) => poi.id === "yaramuke")?.coordinates,
    );
    expect(migrated.pois.find((poi) => poi.id === "yaramuke")?.notes).toBe("Nota del DJ");
    expect(migrated.network.edges).toHaveLength(4);
  });
  it("acepta procedencias externas separadas de una inscripción del mapa", () => {
    const p = initialState().pois[0];
    expect(poiSchema.safeParse({ ...p, provenance: "externa" }).success).toBe(true);
    expect(
      poiSchema.safeParse({ ...p, provenance: "externa_aproximada" }).success,
    ).toBe(true);
  });
  it("etiqueta las procedencias externas sin confundirlas con el catálogo", () => {
    expect(provenanceLabel("externa")).toBe("Fuente externa · sin situar");
    expect(provenanceLabel("externa_aproximada")).toBe(
      "Fuente externa · ubicación aproximada",
    );
  });
  it("conserva el radio de incertidumbre de las ubicaciones aproximadas", () => {
    const p = initialState().pois.find((poi) => poi.id === "oco")!;
    expect(p.provenance).toBe("externa_aproximada");
    expect(p.placementRadius).toBeGreaterThan(0);
    expect(poiSchema.safeParse({ ...p, placementRadius: 0 }).success).toBe(false);
    expect(poiSchema.safeParse({ ...p, placementRadius: 1.1 }).success).toBe(false);
  });
  it("da un símbolo propio a los sitios especiales", () => {
    expect(symbols.special_site).toBe("✦");
  });
  it("rechaza categorías desconocidas, nombres vacíos y puntuaciones inválidas", () => {
    const p = initialState().pois[0];
    for (const change of [
      { type: "bad" },
      { name: " " },
      { importance: 6 },
      { confidence: 0 },
      { notes: 42 },
      { visible: "yes" },
    ])
      expect(poiSchema.safeParse({ ...p, ...change }).success).toBe(false);
  });
  it("rechaza identificadores repetidos", () => {
    const s = initialState();
    s.pois.push(s.pois[0]);
    expect(stateSchema.safeParse(s).success).toBe(false);
  });
});
describe("Coordenadas de imagen", () => {
  it("conserva esquinas y posiciones interiores en ambas direcciones", () => {
    for (const p of [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 0.42, y: 0.73 },
    ]) {
      const [lat, lng] = toMap(p);
      const q = fromMap(lat, lng);
      expect(q.x).toBeCloseTo(p.x);
      expect(q.y).toBeCloseTo(p.y);
    }
    expect(toMap({ x: 1, y: 1 })).toEqual([-HEIGHT / 32, WIDTH / 32]);
  });
  it("rechaza posiciones no finitas, terrestres y fuera de la imagen", () => {
    for (const p of [
      { x: NaN, y: 0 },
      { x: Infinity, y: 0 },
      { x: 1.1, y: 0 },
      { x: 0, y: -0.1 },
      { lat: 80, lng: 10 },
    ])
      expect(pointSchema.safeParse(p).success).toBe(false);
  });
  it("calibra la distancia desde la barra de escala del raster (408 mi de ancho)", () => {
    expect(MAP_WIDTH_MILES).toBe(408);
    expect(distance({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(408, 5);
    expect(distance({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(
      (408 * HEIGHT) / WIDTH,
      5,
    );
    expect(distance({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 })).toBe(0);
  });
  it("mantiene isotropía: N píxeles horizontales y verticales son la misma distancia", () => {
    const horizontal = distance({ x: 0, y: 0 }, { x: 1, y: 0 });
    const vertical = distance({ x: 0, y: 0 }, { x: 0, y: WIDTH / HEIGHT });
    expect(vertical).toBeCloseTo(horizontal, 5);
  });
});
describe("Expedición", () => {
  it("cambiar destino conserva los puntos intermedios de una ruta manual", () => {
    const a = { x: 0, y: 0 },
      b = { x: 0.2, y: 0.5 },
      c = { x: 0.8, y: 0.7 },
      d = { x: 1, y: 1 };
    expect(setEndpoint([a, b, c], "destination", d)).toEqual([a, b, d]);
    expect(setEndpoint([a, b, c], "origin", d)).toEqual([d, b, c]);
    expect(setEndpoint([a], "destination", d)).toEqual([a, d]);
    expect(() => setEndpoint([], "destination", d)).toThrow();
  });
  it("usa la tabla diaria de 5e como fuente de verdad (slow 18 / normal 24 / fast 30 mi)", () => {
    const day = (pace: "slow" | "normal" | "fast") =>
      journey(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
        { ...defaultTravel, pace },
      );
    expect(day("normal").daily).toBeCloseTo(24, 5);
    expect(day("slow").daily).toBeCloseTo(18, 5);
    expect(day("fast").daily).toBeCloseTo(30, 5);
  });
  it("calcula jornadas = millas / ritmo diario", () => {
    const to = (miles: number) => [
      { x: 0, y: 0 },
      { x: miles / MAP_WIDTH_MILES, y: 0 },
    ];
    expect(journey(to(170), { ...defaultTravel, pace: "normal" }).days).toBeCloseTo(
      170 / 24,
      4,
    );
    expect(journey(to(170), { ...defaultTravel, pace: "fast" }).days).toBeCloseTo(
      170 / 30,
      4,
    );
    expect(journey(to(170), { ...defaultTravel, pace: "slow" }).days).toBeCloseTo(
      170 / 18,
      4,
    );
  });
  it("el terreno difícil (no carretera) reduce a la mitad; la carretera es normal", () => {
    const to = (miles: number) => [
      { x: 0, y: 0 },
      { x: miles / MAP_WIDTH_MILES, y: 0 },
    ];
    expect(journey(to(24), { ...defaultTravel, terrain: "road" }).days).toBeCloseTo(1, 5);
    expect(journey(to(24), { ...defaultTravel, terrain: "sand" }).days).toBeCloseTo(2, 5);
    expect(journey(to(24), { ...defaultTravel, terrain: "mountain" }).days).toBeCloseTo(2, 5);
  });
  it("marcha forzada solo por encima de 8 horas", () => {
    const p = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
    expect(journey(p, { ...defaultTravel, hours: 8 }).forcedMarch).toBe(false);
    expect(journey(p, { ...defaultTravel, hours: 9 }).forcedMarch).toBe(true);
    expect(journey(p, { ...defaultTravel, hours: 16 }).forcedMarch).toBe(true);
    expect(journey(p, { ...defaultTravel, hours: 16 }).forcedMarchHours).toBe(8);
  });
  it("los modificadores legacy ya no alteran las jornadas: solo avisos", () => {
    const p = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
    const base = journey(p, defaultTravel);
    for (const key of ["heat", "storm", "load", "scarceWater"] as const) {
      const r = journey(p, { ...defaultTravel, [key]: true });
      expect(r.days).toBe(base.days);
      expect(r.warnings.length).toBeGreaterThan(0);
    }
  });
  it("los modos de montura usan valores homebrew aislados (no calibran la escala)", () => {
    const to = (miles: number) => [
      { x: 0, y: 0 },
      { x: miles / MAP_WIDTH_MILES, y: 0 },
    ];
    expect(journey(to(32), { ...defaultTravel, mode: "mount" }).days).toBeCloseTo(1, 5);
    expect(journey(to(16), { ...defaultTravel, mode: "caravan" }).days).toBeCloseTo(1, 5);
  });
  it("suma segmentos manuales sin confundirlos con la distancia directa", () => {
    const a = { x: 0, y: 0 },
      b = { x: 1, y: 0 },
      c = { x: 1, y: 1 };
    expect(journey([a, b, c], defaultTravel).miles).toBeCloseTo(
      408 + (408 * HEIGHT) / WIDTH,
      5,
    );
    expect(journey([a, b, c], defaultTravel).miles).toBeGreaterThan(distance(a, c));
  });
  it("calcula por tramo: cada segmento usa su propio terreno", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 12 / MAP_WIDTH_MILES, y: 0 },
      { x: 24 / MAP_WIDTH_MILES, y: 0, terrain: "sand" as const },
    ];
    expect(journey(pts, defaultTravel).days).toBeCloseTo(1.5, 5);
  });
  it("valida entradas y permite itinerario vacío", () => {
    const p = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
    expect(() => journey(p, { ...defaultTravel, hours: 0 })).toThrow();
    expect(journey([], defaultTravel).days).toBe(0);
  });
});

describe("Migración del estado de viaje", () => {
  it("convierte el formato antiguo (scale + pace en mph) al nuevo", () => {
    const legacy = {
      mode: "foot",
      pace: 2.5,
      hours: 8,
      scale: 1000,
      terrain: "sand",
      heat: true,
      storm: false,
      load: false,
      scarceWater: false,
      useRoad: false,
    };
    const storage = {
      getItem: () =>
        JSON.stringify({
          version: 1,
          coordinateSystem: "athas-image-normalized-v1",
          pois: initialState().pois,
          network: initialState().network,
          travel: legacy,
          itinerary: [],
          routeKind: "direct",
        }),
    };
    const s = loadState(storage);
    expect(s.travel).not.toHaveProperty("scale");
    expect(s.travel.pace).toBe("custom");
    expect(s.travel.customMph).toBe(2.5);
  });
});
describe("Persistencia e intercambio", () => {
  it("restaura colocaciones, notas y expedición", () => {
    let raw: string | null = null;
    const storage = {
      setItem: (_k: string, v: string) => {
        raw = v;
      },
      getItem: () => raw,
    };
    const s = initialState();
    s.pois[0].coordinates = { x: 0.3, y: 0.4 };
    s.pois[0].notes = "Solo DJ";
    s.itinerary = [
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 0.2 },
    ];
    saveState(storage, s);
    expect(loadState(storage)).toEqual(s);
  });
  it("propaga errores de cuota y corrupción sin sobrescribir el original", () => {
    expect(() =>
      saveState(
        {
          setItem: () => {
            throw new Error("QuotaExceeded");
          },
        },
        initialState(),
      ),
    ).toThrow("QuotaExceeded");
    expect(() => loadState({ getItem: () => "{broken" })).toThrow();
  });
  it("importa campañas y POIs parciales pero exige sistema de coordenadas", () => {
    const s = initialState();
    expect(parseImport(s, s)).toEqual(s);
    expect(
      parseImport(
        { version: 1, coordinateSystem: s.coordinateSystem, pois: [] },
        s,
      ).pois,
    ).toEqual([]);
    expect(() => parseImport({ pois: s.pois }, s)).toThrow();
    expect(() =>
      parseImport({ type: "FeatureCollection", features: [] }, s),
    ).toThrow();
  });
  it("valida nodos, referencias, costes, estados y duplicados de la futura red", () => {
    const network = {
      source: "Ejemplo de test, no canónico",
      nodes: [
        { id: "a", name: "A", coordinates: { x: 0, y: 0 } },
        { id: "b", name: "B", coordinates: { x: 1, y: 1 } },
      ],
      edges: [
        {
          id: "ab",
          from: "a",
          to: "b",
          terrain: "road",
          cost: 1,
          dangers: [],
          traffic: "low",
          status: "open",
          restrictions: [],
          bidirectional: true,
        },
      ],
    };
    expect(networkSchema.safeParse(network).success).toBe(true);
    for (const edge of [
      { ...network.edges[0], to: "missing" },
      { ...network.edges[0], cost: -1 },
      { ...network.edges[0], status: "bad" },
    ])
      expect(
        networkSchema.safeParse({ ...network, edges: [edge] }).success,
      ).toBe(false);
    expect(
      networkSchema.safeParse({
        ...network,
        nodes: [network.nodes[0], network.nodes[0]],
      }).success,
    ).toBe(false);
  });
});
