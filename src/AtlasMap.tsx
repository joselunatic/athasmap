import { useEffect, useRef } from "react";
import L from "leaflet";
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
  draft?: Point;
  selected?: Poi;
  points: Point[];
  manual: boolean;
  pick: boolean;
  network: Network;
  home: number;
  onPick: (p: Point) => void;
  onSelect: (id: string) => void;
  onError: (message: string) => void;
};
const bounds = L.latLngBounds([-HEIGHT / 32, 0], [0, WIDTH / 32]);

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
        position: "bottomright",
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
    for (const p of props.pois.filter((p) => p.visible && p.coordinates)) {
      const marker = L.marker(toMap(p.coordinates!), {
        title: p.name,
        alt: p.name,
        icon: L.divIcon({
          className: `poi-marker ${p.type} ${p.provenance === "externa_aproximada" ? "approximate" : ""} ${p.id === props.selected?.id ? "selected" : ""}`,
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
      if (p.provenance === "externa_aproximada" && p.placementRadius)
        L.circle(toMap(p.coordinates!), {
          radius: (Math.max(WIDTH, HEIGHT) * p.placementRadius) / 32,
          color: "#a12924",
          weight: 1,
          dashArray: "4 5",
          fillColor: "#a12924",
          fillOpacity: 0.08,
          interactive: false,
        }).addTo(layer);
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
    for (const e of props.network.edges) {
      const a = props.network.nodes.find((n) => n.id === e.from)!,
        b = props.network.nodes.find((n) => n.id === e.to)!;
      const line = L.polyline([toMap(a.coordinates), toMap(b.coordinates)], {
        color: e.status === "open" ? "#805e27" : "#615b54",
        weight: 3,
        dashArray: e.status === "open" ? undefined : "4 6",
      });
      const label = document.createElement("span");
      const value = e.distanceLabel ?? e.cost;
      label.textContent = `${a.name} ↔ ${b.name} · ${value} ${e.unit ?? "(unidad pendiente)"} · tramo conceptual`;
      line.bindTooltip(label).addTo(layer);
    }
    if (props.draft)
      L.marker(toMap(props.draft), {
        interactive: false,
        zIndexOffset: 1000,
        icon: L.divIcon({
          className: "draft-marker",
          html: "<span></span>",
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        }),
      }).addTo(layer);
    return () => {
      layer.remove();
    };
  }, [
    props.pois,
    props.draft,
    props.selected?.id,
    props.points,
    props.manual,
    props.network,
  ]);
  return (
    <div
      ref={el}
      className={`map ${props.pick ? "picking" : ""}`}
      role="region"
      aria-label="Mapa interactivo de Athas. Usa los controles de zoom y las flechas para explorar."
    />
  );
}
