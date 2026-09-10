import { z } from "zod";
import seed from "../poi.json";
import travelNetwork from "../travel-network.json";

export const WIDTH = 4589;
export const HEIGHT = 3080;
export const categories = seed.categories;
export const symbols: Record<string, string> = {
  city_state: "♜",
  city: "▣",
  town: "⌂",
  village: "⌂",
  fortress: "⚑",
  oasis: "♧",
  ruin: "◇",
  outpost: "⚐",
  region: "◎",
  natural_feature: "△",
  water_body: "≈",
  route: "↝",
  special_site: "✦",
};
export const pointSchema = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
});
export type Point = z.infer<typeof pointSchema>;
export const poiSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(120),
  type: z
    .string()
    .refine((v) => categories.some((c) => c.id === v), "Categoría desconocida"),
  region: z.string().max(160),
  importance: z.number().int().min(1).max(5),
  confidence: z.number().int().min(1).max(5),
  tags: z.array(z.string().max(80)).max(40),
  description: z.string().max(10000),
  coordinates: pointSchema.nullable(),
  placementRadius: z.number().positive().max(1).optional(),
  visible: z.boolean().default(true),
  notes: z.string().max(10000).default(""),
  source: z.string().max(1000).default("poi.json · catálogo original"),
  provenance: z
    .enum(["catalogue", "user", "mapa", "externa", "externa_aproximada"])
    .default("catalogue"),
  water: z.enum(["unknown", "none", "limited", "available"]).default("unknown"),
  danger: z.enum(["unknown", "low", "medium", "high"]).default("unknown"),
  faction: z.string().max(160).default(""),
});
export type Poi = z.infer<typeof poiSchema>;
export type PoiProvenance = Poi["provenance"];
export function provenanceLabel(provenance: PoiProvenance) {
  switch (provenance) {
    case "catalogue":
      return "Catálogo original";
    case "mapa":
      return "Inscripción del mapa";
    case "externa":
      return "Fuente externa · sin situar";
    case "externa_aproximada":
      return "Fuente externa · ubicación aproximada";
    case "user":
      return "Creación de campaña";
  }
}
const nodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  coordinates: pointSchema,
});
const edgeSchema = z.object({
  id: z.string().min(1),
  from: z.string(),
  to: z.string(),
  terrain: z.enum(["road", "sand", "rock", "mountain"]),
  cost: z.number().positive().finite(),
  distanceLabel: z.number().positive().finite().optional(),
  unit: z.string().max(80).nullable().default(null),
  source: z.string().max(1000).default(""),
  evidence: z.string().max(2000).default(""),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
  dangers: z.array(z.string()),
  traffic: z.enum(["low", "medium", "high"]),
  status: z.enum(["open", "closed", "uncertain"]),
  restrictions: z.array(z.string()),
  bidirectional: z.boolean(),
});
export const networkSchema = z
  .object({
    nodes: z.array(nodeSchema).max(5000),
    edges: z.array(edgeSchema).max(20000),
    source: z.string().max(1000),
  })
  .superRefine((n, ctx) => {
    const ids = new Set(n.nodes.map((v) => v.id));
    if (
      ids.size !== n.nodes.length ||
      new Set(n.edges.map((e) => e.id)).size !== n.edges.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Identificadores de red duplicados",
      });
    for (const e of n.edges)
      if (!ids.has(e.from) || !ids.has(e.to))
        ctx.addIssue({
          code: "custom",
          message: `Arista ${e.id}: nodo inexistente`,
        });
  });
export type Network = z.infer<typeof networkSchema>;
export const travelSchema = z.object({
  mode: z.enum(["foot", "caravan", "mount", "kank", "mekillot"]),
  pace: z.number().min(0.1).max(30),
  hours: z.number().min(1).max(16),
  scale: z.number().min(1).max(100000),
  terrain: z.enum(["road", "sand", "rock", "mountain"]),
  heat: z.boolean(),
  storm: z.boolean(),
  load: z.boolean(),
  scarceWater: z.boolean(),
  useRoad: z.boolean(),
});
export type Travel = z.infer<typeof travelSchema>;
export const defaultTravel: Travel = {
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
export const stateSchema = z
  .object({
    version: z.literal(1),
    coordinateSystem: z.literal("athas-image-normalized-v1"),
    pois: z.array(poiSchema).max(10000),
    network: networkSchema,
    travel: travelSchema,
    itinerary: z.array(pointSchema).max(2000),
    routeKind: z.enum(["direct", "manual"]),
  })
  .superRefine((s, ctx) => {
    if (new Set(s.pois.map((p) => p.id)).size !== s.pois.length)
      ctx.addIssue({
        code: "custom",
        message: "Identificadores de POI duplicados",
      });
    if (s.routeKind === "direct" && s.itinerary.length > 2)
      ctx.addIssue({
        code: "custom",
        message: "Un trayecto directo admite dos puntos",
      });
  });
export type AtlasState = z.infer<typeof stateSchema>;
export function initialState(): AtlasState {
  return stateSchema.parse({
    version: 1,
    coordinateSystem: "athas-image-normalized-v1",
    pois: seed.pois,
    network: travelNetwork,
    travel: defaultTravel,
    itinerary: [],
    routeKind: "direct",
  });
}
export function toMap(p: Point): [number, number] {
  return [(-p.y * HEIGHT) / 32, (p.x * WIDTH) / 32];
}
export function fromMap(lat: number, lng: number): Point {
  return pointSchema.parse({ x: (lng * 32) / WIDTH, y: (-lat * 32) / HEIGHT });
}
export function distance(a: Point, b: Point, scale: number) {
  return Math.hypot(a.x - b.x, ((a.y - b.y) * HEIGHT) / WIDTH) * scale;
}
export function setEndpoint(
  points: Point[],
  endpoint: "origin" | "destination",
  point: Point,
): Point[] {
  pointSchema.parse(point);
  if (endpoint === "origin") return [point, ...points.slice(1)];
  if (!points.length) throw new Error("Selecciona primero un origen.");
  return points.length === 1
    ? [points[0], point]
    : [...points.slice(0, -1), point];
}
export function journey(points: Point[], t: Travel) {
  travelSchema.parse(t);
  points.forEach((p) => pointSchema.parse(p));
  const miles = points
    .slice(1)
    .reduce((sum, p, i) => sum + distance(points[i], p, t.scale), 0);
  const terrain = { road: 1, sand: 0.7, rock: 0.8, mountain: 0.45 }[t.terrain];
  const speed =
    t.pace *
    terrain *
    (t.heat ? 0.75 : 1) *
    (t.storm ? 0.4 : 1) *
    (t.load ? 0.75 : 1) *
    (t.scarceWater ? 0.7 : 1) *
    (t.useRoad && t.terrain !== "road" ? 1.15 : 1);
  const hours = miles / speed;
  return {
    miles,
    hours,
    days: hours / t.hours,
    daily: speed * t.hours,
    warnings: [
      ...(t.heat
        ? ["Calor extremo: viaja al amanecer y busca refugio al mediodía."]
        : []),
      ...(t.storm
        ? ["Tormenta de arena: considera detener la expedición."]
        : []),
      ...(t.scarceWater
        ? [
            "Agua escasa: establece un punto de reabastecimiento antes de partir.",
          ]
        : []),
      ...(t.load ? ["La carga reduce el avance de la expedición."] : []),
    ],
  };
}
export function mergeSeedState(current: AtlasState): AtlasState {
  const canonical = initialState();
  const canonicalById = new Map(canonical.pois.map((poi) => [poi.id, poi]));
  const merged = current.pois.map((poi) => {
    const seedPoi = canonicalById.get(poi.id);
    const staleExternal =
      seedPoi &&
      poi.coordinates === null &&
      seedPoi.coordinates !== null &&
      (poi.provenance === "externa" || poi.source.includes("391_Athas_Travel_hi-res.pdf"));
    return staleExternal ? { ...seedPoi, notes: poi.notes, visible: poi.visible } : poi;
  });
  const currentIds = new Set(current.pois.map((poi) => poi.id));
  for (const poi of canonical.pois)
    if (!currentIds.has(poi.id)) merged.push(poi);
  return stateSchema.parse({
    ...current,
    pois: merged,
    network: current.network.edges.length ? current.network : canonical.network,
  });
}

export const STORAGE_KEY = "athas.atlas.v1";

export function saveState(
  storage: Pick<Storage, "setItem">,
  state: AtlasState,
) {
  storage.setItem(STORAGE_KEY, JSON.stringify(stateSchema.parse(state)));
}
export function loadState(storage: Pick<Storage, "getItem">): AtlasState {
  const raw = storage.getItem(STORAGE_KEY);
  return raw ? stateSchema.parse(JSON.parse(raw)) : initialState();
}
export function errorText(e: unknown) {
  return e instanceof z.ZodError
    ? e.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(" · ")
    : e instanceof Error
      ? e.message
      : "Error desconocido";
}
export function parseImport(raw: unknown, current: AtlasState): AtlasState {
  // A complete snapshot or a POI/network-only JSON exchange. Geographic GeoJSON is deliberately rejected.
  if (typeof raw !== "object" || raw === null)
    throw new Error("Se esperaba un objeto JSON del atlas.");
  const header = z
    .object({
      version: z.literal(1),
      coordinateSystem: z.literal("athas-image-normalized-v1"),
    })
    .passthrough()
    .parse(raw);
  if ("travel" in header) return stateSchema.parse(raw);
  const partial = z
    .object({
      version: z.literal(1),
      coordinateSystem: z.literal("athas-image-normalized-v1"),
      pois: z.array(poiSchema).optional(),
      network: networkSchema.optional(),
    })
    .strict()
    .parse(raw);
  if (!partial.pois && !partial.network)
    throw new Error("El archivo no contiene POIs ni red de viaje.");
  return stateSchema.parse({ ...current, ...partial });
}
