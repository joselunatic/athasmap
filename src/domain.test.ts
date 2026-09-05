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
  saveState,
  loadState,
  parseImport,
  networkSchema,
  setEndpoint,
} from "./domain";

describe("Catálogo y validación", () => {
  it("migra los 114 registros sin fabricar posiciones ni perder metadatos", () => {
    const state = initialState();
    expect(state.pois).toHaveLength(114);
    expect(state.pois.every((p) => p.coordinates === null)).toBe(true);
    const tyr = state.pois.find((p) => p.id === "tyr")!;
    expect(tyr.tags).toContain("ciudad-libre");
    expect(tyr.source).toContain("poi.json");
    expect(tyr.provenance).toBe("catalogue");
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
  it("respeta la relación de aspecto en las distancias", () => {
    expect(distance({ x: 0, y: 0 }, { x: 1, y: 0 }, 1000)).toBe(1000);
    expect(distance({ x: 0, y: 0 }, { x: 0, y: 1 }, 1000)).toBeCloseTo(
      (1000 * HEIGHT) / WIDTH,
    );
    expect(distance({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, 1000)).toBe(0);
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
  const clear = {
    ...defaultTravel,
    scale: 100,
    terrain: "road" as const,
    heat: false,
  };
  it("calcula distancia, horas y jornadas desde la velocidad", () => {
    const j = journey(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      clear,
    );
    expect(j.miles).toBe(100);
    expect(j.hours).toBe(40);
    expect(j.days).toBe(5);
  });
  it("suma segmentos manuales sin confundirlos con la distancia directa", () => {
    const a = { x: 0, y: 0 },
      b = { x: 1, y: 0 },
      c = { x: 1, y: 1 };
    expect(journey([a, b, c], clear).miles).toBeCloseTo(
      100 + (100 * HEIGHT) / WIDTH,
    );
    expect(journey([a, b, c], clear).miles).toBeGreaterThan(
      distance(a, c, 100),
    );
  });
  it("calor, tormentas, agua y carga ralentizan y generan advertencias", () => {
    const points = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      base = journey(points, clear);
    for (const key of ["heat", "storm", "load", "scarceWater"] as const) {
      const r = journey(points, { ...clear, [key]: true });
      expect(r.days).toBeGreaterThan(base.days);
      expect(r.warnings.length).toBeGreaterThan(0);
    }
  });
  it("no duplica la bonificación de camino y limita entradas", () => {
    const p = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
    expect(journey(p, { ...clear, useRoad: true }).hours).toBe(
      journey(p, clear).hours,
    );
    expect(() => journey(p, { ...clear, hours: 0 })).toThrow();
    expect(() => journey(p, { ...clear, pace: 0 })).toThrow();
    expect(journey([], clear).days).toBe(0);
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
