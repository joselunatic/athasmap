import { useEffect, useRef } from "react";
import L from "leaflet";
import { z } from "zod";
import {
  WIDTH,
  HEIGHT,
  toMap,
  fromMap,
  symbols,
  type Point,
  type Poi,
  type Network,
} from "./domain";

type Props = {
  pois: Poi[];
  selected?: Poi;
  points: Point[];
  manual: boolean;
  pick: boolean;
  grid: boolean;
  showPois: boolean;
  experimental: boolean;
  network: Network;
  showNetwork: boolean;
  home: number;
  onPick: (p: Point) => void;
  onSelect: (id: string) => void;
  onError: (message: string) => void;
};
const bounds = L.latLngBounds([-HEIGHT / 32, 0], [0, WIDTH / 32]);
const extractedSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(
    z.object({
      geometry: z.object({
        type: z.literal("LineString"),
        coordinates: z
          .array(z.tuple([z.number().finite(), z.number().finite()]))
          .min(2),
      }),
    }),
  ),
});

export default function AtlasMap(props: Props) {
  const el = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null);
  const current = useRef(props);
  current.current = props;
  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, {
      crs: L.CRS.Simple,
      minZoom: 0,
      maxZoom: 6,
      zoomSnap: 0.25,
      maxBounds: bounds.pad(0.12),
      maxBoundsViscosity: 0.85,
      attributionControl: false,
      zoomControl: false,
    });
    map.current = m;
    const tiles = L.tileLayer("/tiles_new/{z}/{x}/{y}.png", {
      tileSize: 256,
      minZoom: 0,
      maxNativeZoom: 5,
      maxZoom: 6,
      noWrap: true,
      bounds,
    });
    tiles.on("tileerror", () =>
      current.current.onError(
        "No se pudo cargar una tesela del mapa. Comprueba la conexión con el servidor.",
      ),
    );
    tiles.addTo(m);
    m.fitBounds(bounds, { padding: [18, 18] });
    L.control
      .zoom({
        position: "topright",
        zoomInTitle: "Acercar",
        zoomOutTitle: "Alejar",
      })
      .addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => {
      if (current.current.pick && bounds.contains(e.latlng))
        current.current.onPick(fromMap(e.latlng.lat, e.latlng.lng));
    });
    const keyboardPick = (e: KeyboardEvent) => {
      if (
        e.key === "Enter" &&
        e.target === m.getContainer() &&
        current.current.pick
      ) {
        const p = m.getCenter();
        if (bounds.contains(p)) {
          e.preventDefault();
          current.current.onPick(fromMap(p.lat, p.lng));
        }
      }
    };
    m.getContainer().addEventListener("keydown", keyboardPick);
    const resize = new ResizeObserver(() => {
      m.invalidateSize();
    });
    resize.observe(el.current);
    return () => {
      resize.disconnect();
      m.getContainer().removeEventListener("keydown", keyboardPick);
      m.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    map.current?.fitBounds(bounds, { padding: [18, 18], animate: true });
  }, [props.home]);
  useEffect(() => {
    if (props.selected?.coordinates)
      map.current?.flyTo(
        toMap(props.selected.coordinates),
        Math.max(map.current.getZoom(), 3),
        { duration: 0.5 },
      );
  }, [props.selected?.id, props.selected?.coordinates]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const layer = L.layerGroup().addTo(m);
    if (props.showPois)
      for (const p of props.pois.filter((p) => p.visible && p.coordinates)) {
        const marker = L.marker(toMap(p.coordinates!), {
          title: p.name,
          alt: p.name,
          icon: L.divIcon({
            className: `poi-marker ${p.type} ${p.id === props.selected?.id ? "selected" : ""}`,
            html: `<span>${symbols[p.type] ?? "◇"}</span>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          }),
        });
        const label = document.createElement("span");
        label.textContent = p.name;
        marker.bindTooltip(label, { direction: "top", offset: [0, -12] });
        marker.on("click", () => {
          if (current.current.pick) current.current.onPick(p.coordinates!);
          else current.current.onSelect(p.id);
        });
        layer.addLayer(marker);
        marker.getElement()?.setAttribute("aria-label", p.name);
      }
    if (props.points.length > 1)
      L.polyline(props.points.map(toMap), {
        color: "#772f24",
        weight: 4,
        dashArray: props.manual ? undefined : "9 8",
      }).addTo(layer);
    props.points.forEach((p, i) => {
      L.marker(toMap(p), {
        interactive: false,
        icon: L.divIcon({
          className: "route-marker",
          html: String(i + 1),
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
      }).addTo(layer);
    });
    if (props.grid)
      for (let i = 1; i < 10; i++) {
        L.polyline([toMap({ x: i / 10, y: 0 }), toMap({ x: i / 10, y: 1 })], {
          color: "#40372a",
          weight: 1,
          opacity: 0.5,
          interactive: false,
        }).addTo(layer);
        L.polyline([toMap({ x: 0, y: i / 10 }), toMap({ x: 1, y: i / 10 })], {
          color: "#40372a",
          weight: 1,
          opacity: 0.5,
          interactive: false,
        }).addTo(layer);
      }
    if (props.showNetwork)
      for (const e of props.network.edges) {
        const a = props.network.nodes.find((n) => n.id === e.from)!,
          b = props.network.nodes.find((n) => n.id === e.to)!;
        const line = L.polyline([toMap(a.coordinates), toMap(b.coordinates)], {
          color: e.status === "open" ? "#805e27" : "#615b54",
          weight: 3,
          dashArray: e.status === "open" ? undefined : "4 6",
        });
        const label = document.createElement("span");
        label.textContent = `${a.name} → ${b.name} · ${e.status}`;
        line.bindTooltip(label).addTo(layer);
      }
    return () => {
      layer.remove();
    };
  }, [
    props.pois,
    props.selected?.id,
    props.points,
    props.manual,
    props.grid,
    props.showPois,
    props.network,
    props.showNetwork,
  ]);
  useEffect(() => {
    const m = map.current;
    if (!m || !props.experimental) return;
    const group = L.layerGroup().addTo(m),
      controller = new AbortController();
    const renderer = L.canvas({ padding: 0.5 });
    void (async () => {
      try {
        const response = await fetch("/routes.geojson", {
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error("No se pudieron leer los trazos experimentales.");
        const data = extractedSchema.parse(await response.json());
        if (controller.signal.aborted) return;
        for (const f of data.features) {
          // Exact inverse of extract_routes_tiles.py, not a geographic projection.
          const pts = f.geometry.coordinates.map(([x, y]): [number, number] => [
            (-(87.17 - y) / (87.17 - 64.02)) * 256,
            ((x + 182.337) / (21.463 + 182.337)) * 256,
          ]);
          L.polyline(pts, {
            renderer,
            color: "#a12924",
            weight: 1.5,
            opacity: 0.65,
            interactive: false,
          }).addTo(group);
        }
      } catch (e) {
        if (!controller.signal.aborted)
          current.current.onError(
            e instanceof Error ? e.message : "Error en trazos experimentales",
          );
      }
    })();
    return () => {
      controller.abort();
      group.remove();
      renderer.remove();
    };
  }, [props.experimental]);
  return (
    <div
      ref={el}
      className={`map ${props.pick ? "picking" : ""}`}
      role="region"
      aria-label="Mapa interactivo de Athas. Usa los controles de zoom y las flechas para explorar."
    />
  );
}
