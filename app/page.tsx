"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useDemo } from "@/components/DemoProvider";
import { FleetMap, type MapHandle } from "@/components/FleetMap";
import { VehicleDrawer } from "@/components/VehicleDrawer";
import { VehicleList, type SelectVia } from "@/components/VehicleList";
import { AlertFeed } from "@/components/AlertFeed";
import { StatusIcon, statusColor } from "@/components/ui";
import { docState, isOpen, today, type VehicleView } from "@/lib/rules";
import { playbackView, type Playback } from "@/lib/playback";
import { STATUSES, type Filters, type Status } from "@/lib/types";

const matches = (w: VehicleView, f: Filters) => {
  const q = f.q.trim().toLowerCase();
  return (
    (!q || w.v.id.toLowerCase().includes(q) || w.driverLabel.toLowerCase().includes(q) || w.v.driverId.toLowerCase().includes(q)) &&
    (!f.category || w.v.category === f.category) &&
    (!f.status || w.status === f.status) &&
    (!f.site || w.v.siteId === f.site)
  );
};

const PANEL = "overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200";
// Paper-coloured spread around the pinned map masks the gutter while the list scrolls underneath.
const APRON = "max-lg:shadow-[0_0_0_12px_var(--color-paper)]";

/*
 * Laptop and up (lg): a fixed console — list | map | alerts/details — that fills the viewport.
 * The page never scrolls; only the vehicle rows and the alert/detail panel do.
 * Tablets and phones: the map pins under the header and the list's search/filters pin under the map
 * while the rows scroll. --map-top / --map-h / --list-head also set the rows' scroll margin so a
 * scrolled-to row never hides behind the pinned map or filter bar.
 */
const CONSOLE = [
  "flex min-h-0 flex-col gap-3",
  "[--map-top:0px] [--map-h:40vh] [--list-head:130px] sm:[--map-top:var(--header-h,96px)] sm:[--map-h:42vh]",
  "lg:grid lg:flex-1 lg:grid-rows-[minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)_300px] lg:[--map-h:0px] lg:[--map-top:0px] lg:[--list-head:0px]",
  "laptop:grid-cols-[320px_minmax(0,1fr)_340px] xl:grid-cols-[360px_minmax(0,1fr)_360px] wide:grid-cols-[400px_minmax(0,1fr)_400px]",
].join(" ");

export default function ControlRoom() {
  const { s, dispatch, views } = useDemo();
  const mapRef = useRef<MapHandle>(null);
  const [pb, setPb] = useState<Playback | null>(null);
  const [drawerFocus, setDrawerFocus] = useState(true);
  const f = s.ui.filters;
  const selected = s.ui.selectedVehicleId;

  const all = useMemo(() => [...views.values()], [views]);
  const shown = useMemo(() => all.filter((w) => matches(w, f)), [all, f]);
  const visible = useMemo(() => new Set(shown.map((w) => w.v.id)), [shown]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUSES.map((st) => [st, 0])) as Record<Status, number>;
    for (const w of all) c[w.status]++;
    return c;
  }, [all]);
  const date = today(s);
  const docCounts = useMemo(() => {
    const c = { Expiring: 0, Expired: 0 };
    for (const d of s.docs) {
      const st = docState(d, date).status;
      if (st !== "Valid") c[st]++;
    }
    return c;
  }, [s.docs, date]);
  const openAlerts = s.alerts.filter(isOpen).length;
  const serviceDue = all.filter((w) => w.due).length;

  const history = selected ? s.history[selected] : undefined;
  const overlay = useMemo(() => {
    if (!pb || !history) return null;
    const view = playbackView(history, pb, s.zones, s.clock.now);
    return { segments: view.segments, marks: view.marks, cursor: view.cursor ? ([view.cursor.lat, view.cursor.lng] as [number, number]) : null };
  }, [pb, history, s.zones, s.clock.now]);

  // Clicks glide the map to the vehicle, arrow keys jump instantly, map clicks leave the view alone.
  const select = (id: string | null, via?: SelectVia | "map" | "alert") => {
    dispatch({ type: "SELECT_VEHICLE", id });
    setPb(null);
    setDrawerFocus(via !== "pointer" && via !== "keyboard");
    if (id && via && via !== "map") mapRef.current?.focus(id, via !== "keyboard");
  };

  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4 lg:h-[calc(100dvh-var(--header-h,96px))] lg:min-h-[600px] lg:overflow-hidden">
      <section aria-label="Entire demo fleet" className={`${PANEL} shrink-0 px-3 pb-2 pt-1.5`}>
        <div className="mb-1.5 flex items-center gap-3">
          <h2 className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Entire demo fleet</h2>
          <PartitionBar counts={counts} total={all.length} />
        </div>
        <div className="grid grid-cols-5 gap-1.5 lg:grid-cols-10">
          <Kpi label="Vehicles" value={all.length} />
          {STATUSES.map((st) => (
            <Kpi
              key={st}
              label={st}
              value={counts[st]}
              icon={<StatusIcon status={st} className="size-3" />}
              pressed={f.status === st}
              onClick={() => dispatch({ type: "SET_FILTERS", filters: { status: f.status === st ? "" : st } })}
            />
          ))}
          <Kpi label="Open alerts" value={openAlerts} alert={openAlerts > 0} />
          <Kpi label="Service due" value={serviceDue} href="/maintenance/" />
          <Kpi label="Expiring docs" value={docCounts.Expiring} href="/compliance/" />
          <Kpi label="Expired docs" value={docCounts.Expired} href="/compliance/" alert={docCounts.Expired > 0} />
        </div>
      </section>

      <div className={CONSOLE}>
        <section
          aria-label="Fleet map"
          className={`${PANEL} ${APRON} sticky top-[var(--map-top)] z-20 order-1 h-[var(--map-h)] min-h-[240px] lg:static lg:order-none lg:col-start-2 lg:row-start-1 lg:h-auto`}
        >
          <FleetMap
            ref={mapRef}
            views={all}
            visible={visible}
            selectedId={selected}
            zones={s.zones}
            basemap={s.ui.basemap}
            playback={overlay}
            onSelect={(id) => select(id, "map")}
            onBasemapFail={() => dispatch({ type: "SET_UI", ui: { basemap: "schematic" } })}
          />
        </section>

        <section
          aria-label="Alerts and vehicle details"
          className={`${PANEL} relative order-3 h-[440px] lg:order-none lg:col-start-3 lg:row-start-1 lg:h-auto`}
        >
          <AlertFeed onOpenVehicle={(id) => select(id, "alert")} />
          {selected && (
            <VehicleDrawer id={selected} autoFocus={drawerFocus} onClose={() => select(null)} pb={pb} setPb={setPb} />
          )}
        </section>

        <section
          aria-label="Vehicle list"
          className="@container order-2 flex flex-col overflow-clip rounded-lg bg-white shadow-sm ring-1 ring-slate-200 lg:order-none lg:col-start-1 lg:row-start-1 lg:min-h-0"
        >
          <VehicleList
            shown={shown}
            total={all.length}
            selectedId={selected}
            onSelect={(id, via) => select(id, via)}
            onHover={(id) => mapRef.current?.highlight(id)}
          />
        </section>
      </div>
    </div>
  );
}

function PartitionBar({ counts, total }: { counts: Record<Status, number>; total: number }) {
  return (
    <div
      role="img"
      aria-label={`Status split: ${STATUSES.map((st) => `${counts[st]} ${st}`).join(", ")}`}
      className="flex h-1.5 w-full max-w-[340px] overflow-hidden rounded-full bg-slate-100"
    >
      {STATUSES.map((st) => (
        <span
          key={st}
          title={`${st}: ${counts[st]} of ${total}`}
          className="h-full basis-0 border-r border-white transition-[flex-grow] duration-200 ease-out last:border-r-0"
          style={{ flexGrow: counts[st], backgroundColor: statusColor(st) }}
        />
      ))}
    </div>
  );
}

function Kpi(props: { label: string; value: number; icon?: ReactNode; pressed?: boolean; onClick?: () => void; href?: string; alert?: boolean }) {
  const { label, value, icon, pressed, onClick, href, alert } = props;
  const body = (
    <>
      <span className="flex items-center gap-1 text-[10.5px] font-semibold uppercase leading-tight tracking-wider text-slate-500 group-aria-pressed:text-white/75">
        {icon}
        {label}
      </span>
      <span className={`tabular font-mono text-lg font-semibold leading-tight group-aria-pressed:text-white ${alert ? "text-rose-700" : "text-slate-900"}`}>
        {value}
      </span>
    </>
  );
  const base = "group flex min-w-0 flex-col items-start rounded-md px-2 py-1 text-left ring-1 ring-inset";
  const press =
    "transition-[transform,background-color] duration-150 ease-out active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal";
  if (onClick)
    return (
      <button
        type="button"
        aria-pressed={pressed}
        onClick={onClick}
        className={`${base} ${press} ring-slate-200 hover:bg-slate-50 aria-pressed:bg-navy aria-pressed:ring-navy aria-pressed:hover:bg-navy-2`}
      >
        {body}
      </button>
    );
  if (href)
    return (
      <Link href={href} className={`${base} ${press} ring-slate-200 hover:bg-slate-50`}>
        {body}
      </Link>
    );
  return <div className={`${base} ring-transparent`}>{body}</div>;
}
