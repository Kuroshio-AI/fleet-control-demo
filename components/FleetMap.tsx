import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState, type Ref } from "react";
import { ROUTES, type LatLng } from "@/lib/routes";
import type { VehicleView } from "@/lib/rules";
import type { Zone } from "@/lib/types";
import { STATUSES } from "@/lib/types";
import { StatusIcon, markerSvg } from "./ui";

export type MapHandle = {
  focus: (id: string, animate?: boolean) => void;
  fit: (ids: string[]) => void;
  highlight: (id: string | null) => void;
};
export type PlaybackOverlay = { segments: LatLng[][]; cursor: LatLng | null; marks: { at: LatLng; label: string }[] };

type Props = {
  ref?: Ref<MapHandle>;
  views: VehicleView[];
  visible: Set<string>;
  selectedId: string | null;
  zones: Zone[];
  basemap: "osm" | "schematic";
  playback: PlaybackOverlay | null;
  onSelect: (id: string) => void;
  onBasemapFail: () => void;
};

type L = typeof Leaflet;
const CENTER: LatLng = [24.36, 54.6];

const icon = (L: L, w: VehicleView, selected: boolean) =>
  L.divIcon({
    className: "",
    html: `<div class="vm vm-${w.status.toLowerCase()}${selected ? " vm-sel" : ""}${w.v.connected ? "" : " vm-nolink"}">${markerSvg(w.status)}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

export function FleetMap({ ref, views, visible, selectedId, zones, basemap, playback, onSelect, onBasemapFail }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const [lib, setLib] = useState<{ L: L; map: Leaflet.Map } | null>(null);
  const markers = useRef(new Map<string, { m: Leaflet.Marker; key: string }>());
  const fitted = useRef(false);
  const hovered = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const select = useEffectEvent(onSelect);
  const basemapFailed = useEffectEvent(onBasemapFail);

  // Leaflet touches `window` on import, so it loads only in the browser.
  useEffect(() => {
    let cancelled = false;
    let map: Leaflet.Map | undefined;
    import("leaflet").then(({ default: L }) => {
      if (cancelled || !el.current) return;
      map = L.map(el.current, { center: CENTER, zoom: 12, zoomSnap: 0.5 });
      for (const r of ROUTES.filter((r) => r.loop))
        L.polyline(r.pts, { color: "#334155", weight: 2.5, opacity: 0.35, interactive: false }).addTo(map);
      setLib({ L, map });
    });
    // Leaflet only watches window resizes; also redraw when the container changes (drawer, layout).
    const ro = new ResizeObserver(() => map?.invalidateSize());
    ro.observe(el.current!);
    return () => {
      cancelled = true;
      ro.disconnect();
      map?.remove();
      markers.current.clear();
      fitted.current = false;
    };
  }, []);

  const fit = (ids: Iterable<string>) => {
    const pts = [...ids].map((id) => markers.current.get(id)?.m.getLatLng()).filter((p): p is Leaflet.LatLng => !!p);
    if (lib && pts.length) lib.map.fitBounds(lib.L.latLngBounds(pts), { padding: [30, 30], maxZoom: 15 });
  };
  const zIndexFor = (id: string) => (id === hovered.current ? 2000 : id === selectedRef.current ? 1000 : 0);

  useImperativeHandle(
    ref,
    () => ({
      // Clicks glide to the vehicle; keyboard browsing jumps instantly (no animation on repeated key presses).
      focus(id, animate = true) {
        const m = markers.current.get(id)?.m;
        if (!lib || !m) return;
        const zoom = Math.max(lib.map.getZoom(), 13);
        if (!animate || matchMedia("(prefers-reduced-motion: reduce)").matches) lib.map.setView(m.getLatLng(), zoom, { animate: false });
        else lib.map.flyTo(m.getLatLng(), zoom, { duration: 0.45 });
      },
      fit,
      highlight(id) {
        const prev = hovered.current;
        if (prev === id) return;
        hovered.current = id;
        for (const key of [prev, id]) {
          const entry = key && markers.current.get(key);
          if (!entry) continue;
          entry.m.getElement()?.querySelector(".vm")?.classList.toggle("vm-hover", key === id);
          entry.m.setZIndexOffset(zIndexFor(key));
        }
      },
    }),
    [lib],
  );

  // Basemap: OpenStreetMap tiles, or a schematic grid when tiles are unavailable.
  useEffect(() => {
    if (!lib) return;
    const { L, map } = lib;
    map.getContainer().classList.toggle("schematic", basemap === "schematic");
    if (basemap === "osm") {
      if (!navigator.onLine) basemapFailed();
      let loaded = 0;
      let failed = 0;
      const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      })
        .on("tileload", () => loaded++)
        .on("tileerror", () => {
          if (++failed >= 4 && loaded === 0) basemapFailed();
        })
        .addTo(map);
      return () => {
        tiles.remove();
      };
    }
    const grid = L.layerGroup();
    const line = { color: "#cbd5e1", weight: 1, interactive: false };
    for (let lat = 24.1; lat <= 24.7; lat += 0.02) L.polyline([[lat, 54.2], [lat, 55.0]], line).addTo(grid);
    for (let lng = 54.2; lng <= 55.0; lng += 0.02) L.polyline([[24.1, lng], [24.7, lng]], line).addTo(grid);
    grid.addTo(map);
    return () => {
      grid.remove();
    };
  }, [lib, basemap]);

  useEffect(() => {
    if (!lib) return;
    const { L, map } = lib;
    const circles = zones.map((z) =>
      L.circle(z.center, { radius: z.radiusM, color: "#0f766e", weight: 1.5, dashArray: "5 4", fillColor: "#14b8a6", fillOpacity: 0.08, interactive: false })
        .bindTooltip(`${z.name} (fictional)`, { permanent: true, direction: "top", className: "zone-label" })
        .addTo(map),
    );
    return () => circles.forEach((c) => c.remove());
  }, [lib, zones]);

  // Markers are created once and moved in place each tick; icons rebuild only when status/selection changes.
  useEffect(() => {
    if (!lib) return;
    const { L, map } = lib;
    selectedRef.current = selectedId;
    for (const w of views) {
      const id = w.v.id;
      const selected = id === selectedId;
      const key = `${w.status}|${selected}|${w.v.connected}`;
      let entry = markers.current.get(id);
      if (!entry) {
        const m = L.marker([w.v.lat, w.v.lng], { icon: icon(L, w, selected), keyboard: true }).on("click", () => select(id));
        entry = { m, key };
        markers.current.set(id, entry);
      } else {
        entry.m.setLatLng([w.v.lat, w.v.lng]);
        if (entry.key !== key) {
          entry.m.setIcon(icon(L, w, selected));
          entry.key = key;
        }
      }
      entry.m.setZIndexOffset(zIndexFor(id));
      const show = visible.has(id);
      if (show && !map.hasLayer(entry.m)) entry.m.addTo(map);
      if (!show && map.hasLayer(entry.m)) entry.m.remove();
      const node = entry.m.getElement();
      if (node) {
        node.style.setProperty("--h", `${w.v.heading}deg`);
        node.querySelector(".vm")?.classList.toggle("vm-hover", id === hovered.current);
        const label = `${id} — ${w.status}${w.v.connected ? "" : ", device offline"}`;
        node.title = label;
        node.setAttribute("aria-label", label);
      }
    }
    if (!fitted.current) {
      fitted.current = true;
      const sel = selectedId && markers.current.get(selectedId)?.m;
      if (sel) map.setView(sel.getLatLng(), 14);
      else map.fitBounds(L.latLngBounds(views.map((w) => [w.v.lat, w.v.lng] as LatLng)), { padding: [48, 48] });
    }
  }, [lib, views, visible, selectedId]);

  useEffect(() => {
    if (!lib || !playback) return;
    const { L, map } = lib;
    const g = L.layerGroup().addTo(map);
    for (const seg of playback.segments) L.polyline(seg, { color: "#0284c7", weight: 4, opacity: 0.85 }).addTo(g);
    for (const m of playback.marks)
      L.circleMarker(m.at, { radius: 6, color: "#0f172a", weight: 1.5, fillColor: "#fbbf24", fillOpacity: 1 }).bindTooltip(m.label).addTo(g);
    if (playback.cursor) L.circleMarker(playback.cursor, { radius: 9, color: "#0284c7", weight: 3, fillColor: "#fff", fillOpacity: 1 }).addTo(g);
    return () => {
      g.remove();
    };
  }, [lib, playback]);

  return (
    <div className="relative h-full w-full">
      <div ref={el} className="h-full w-full" role="application" aria-label="Fleet map (simulated positions)" />
      {basemap === "schematic" && (
        <div className="pointer-events-none absolute left-12 top-2.5 z-[500] rounded bg-white/90 px-2 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-300">
          Schematic demo view — basemap unavailable
        </div>
      )}
      <button
        type="button"
        onClick={() => fit(visible)}
        disabled={visible.size === 0}
        className="absolute right-2.5 top-2.5 z-[500] flex items-center gap-1.5 rounded-md bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow-sm ring-1 ring-slate-300 transition-[transform,background-color] duration-150 ease-out hover:bg-white active:scale-[0.97] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-signal"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5 fill-none stroke-current stroke-[1.6]">
          <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" />
        </svg>
        Fit to {visible.size === views.length ? "fleet" : `${visible.size} shown`}
      </button>
      <div className="pointer-events-none absolute bottom-2 left-2 z-[500] flex max-w-[calc(100%-200px)] flex-wrap items-center gap-x-2.5 gap-y-0.5 rounded-md bg-white/90 px-2 py-1 text-[11px] text-slate-700 shadow-sm ring-1 ring-slate-200">
        <span className="font-semibold uppercase tracking-wider text-slate-500">Simulated data</span>
        {STATUSES.map((st) => (
          <span key={st} className="hidden items-center gap-1 sm:flex">
            <StatusIcon status={st} className="size-3" />
            {st}
          </span>
        ))}
        <span className="hidden items-center gap-1 sm:flex">
          <i className="inline-block size-2 rounded-full bg-rose-600" />
          Device offline
        </span>
      </div>
    </div>
  );
}
