"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useDemo } from "@/components/DemoProvider";
import { FleetMap, type MapHandle } from "@/components/FleetMap";
import { VehicleDrawer } from "@/components/VehicleDrawer";
import { AlertFeed } from "@/components/AlertFeed";
import { StatusBadge, StatusIcon, Tag, btnSecondary, card, inputCls } from "@/components/ui";
import { fleetCsv, downloadCsv } from "@/lib/csv";
import { fmtDate, fmtKm, fmtTime } from "@/lib/format";
import { docState, isOpen, today, type VehicleView } from "@/lib/rules";
import { playbackView, type Playback } from "@/lib/playback";
import { STATUSES, type Category, type Filters, type Status } from "@/lib/types";

const CATEGORIES: Category[] = ["Heavy vehicle", "Large bus", "Small bus", "SUV", "Passenger car"];

const matches = (w: VehicleView, f: Filters) => {
  const q = f.q.trim().toLowerCase();
  return (
    (!q || w.v.id.toLowerCase().includes(q) || w.driverLabel.toLowerCase().includes(q) || w.v.driverId.toLowerCase().includes(q)) &&
    (!f.category || w.v.category === f.category) &&
    (!f.status || w.status === f.status) &&
    (!f.site || w.v.siteId === f.site)
  );
};

export default function ControlRoom() {
  const { s, dispatch, views } = useDemo();
  const mapRef = useRef<MapHandle>(null);
  const [pb, setPb] = useState<Playback | null>(null);
  const f = s.ui.filters;
  const selected = s.ui.selectedVehicleId;

  const all = useMemo(() => [...views.values()], [views]);
  const shown = useMemo(() => all.filter((w) => matches(w, f)), [all, f]);
  const visible = useMemo(() => new Set(shown.map((w) => w.v.id)), [shown]);
  const filtered = shown.length !== all.length;

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

  const select = (id: string | null, centre = false) => {
    dispatch({ type: "SELECT_VEHICLE", id });
    setPb(null);
    if (id && centre) mapRef.current?.focus(id);
  };
  const setFilters = (patch: Partial<Filters>) => dispatch({ type: "SET_FILTERS", filters: patch });

  return (
    <div className={`space-y-3 p-3 sm:p-4 ${selected ? "min-[1600px]:pr-[456px]" : ""}`}>
      <section aria-label="Entire demo fleet" className={`${card} px-3 py-2`}>
        <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Entire demo fleet</h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-10">
          <Kpi label="Vehicles" value={all.length} />
          {STATUSES.map((st) => (
            <Kpi
              key={st}
              label={st}
              value={counts[st]}
              icon={<StatusIcon status={st} />}
              pressed={f.status === st}
              onClick={() => setFilters({ status: f.status === st ? "" : st })}
            />
          ))}
          <Kpi label="Open alerts" value={openAlerts} tone={openAlerts ? "rose" : undefined} />
          <Kpi label="Service due" value={serviceDue} href="/maintenance/" />
          <Kpi label="Expiring docs" value={docCounts.Expiring} href="/compliance/" />
          <Kpi label="Expired docs" value={docCounts.Expired} href="/compliance/" tone={docCounts.Expired ? "rose" : undefined} />
        </div>
      </section>

      <section aria-label="Filters" className="flex flex-wrap items-end gap-2">
        <input
          type="search"
          className={`${inputCls} w-full sm:w-56`}
          placeholder="Search vehicle ID or driver"
          aria-label="Search vehicle ID or driver"
          value={f.q}
          onChange={(e) => setFilters({ q: e.target.value })}
        />
        <select className={inputCls} aria-label="Category" value={f.category} onChange={(e) => setFilters({ category: e.target.value })}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select className={inputCls} aria-label="Status" value={f.status} onChange={(e) => setFilters({ status: e.target.value })}>
          <option value="">All statuses</option>
          {STATUSES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select className={inputCls} aria-label="Assigned site" value={f.site} onChange={(e) => setFilters({ site: e.target.value })}>
          <option value="">All sites</option>
          {s.zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
        <button type="button" className={btnSecondary} disabled={!filtered} onClick={() => dispatch({ type: "CLEAR_FILTERS" })}>
          Clear filters
        </button>
        <button type="button" className={btnSecondary} disabled={!shown.length} onClick={() => mapRef.current?.fit(shown.map((w) => w.v.id))}>
          Fit map to results
        </button>
        <span className="tabular px-1 py-1.5 text-sm font-medium text-slate-700" aria-live="polite">
          Showing {shown.length} of {all.length}
        </span>
        <button
          type="button"
          className={`${btnSecondary} ml-auto`}
          disabled={!shown.length}
          onClick={() => downloadCsv(fleetCsv(s, shown, filtered ? `filtered-${shown.length}-of-${all.length}` : `all-${all.length}`))}
        >
          ⬇ {filtered ? `Export filtered (${shown.length})` : `Export fleet (${all.length})`}
        </button>
      </section>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className={`${card} relative h-[320px] overflow-hidden sm:h-[clamp(340px,52vh,600px)]`}>
          <FleetMap
            ref={mapRef}
            views={all}
            visible={visible}
            selectedId={selected}
            zones={s.zones}
            basemap={s.ui.basemap}
            playback={overlay}
            onSelect={(id) => select(id)}
            onBasemapFail={() => dispatch({ type: "SET_UI", ui: { basemap: "schematic" } })}
          />
          {shown.length === 0 && (
            <div className="absolute inset-x-0 top-1/3 z-[600] mx-auto w-fit rounded-md bg-white px-4 py-2 text-sm shadow ring-1 ring-slate-200">
              No vehicles match these filters.
            </div>
          )}
        </div>
        <div className={`${card} h-[420px] overflow-hidden sm:h-[clamp(340px,52vh,600px)]`}>
          <AlertFeed onOpenVehicle={(id) => select(id, true)} />
        </div>
      </div>
      <Legend />

      <section aria-label="Fleet table" className={`${card} overflow-x-auto`}>
        <table className="w-full min-w-[860px] whitespace-nowrap text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {["Vehicle ID", "Category", "Driver", "Status", "Speed", "Assigned site", "Last update", "Next service"].map((h) => (
                <th key={h} scope="col" className="px-3 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((w) => (
              <tr
                key={w.v.id}
                aria-selected={w.v.id === selected}
                onClick={() => select(w.v.id, true)}
                className="tabular cursor-pointer hover:bg-slate-50 aria-selected:bg-sky-50"
              >
                <td className="px-3 py-1.5">
                  <button type="button" className="font-medium text-navy hover:underline" onClick={(e) => (e.stopPropagation(), select(w.v.id, true))}>
                    {w.v.id}
                  </button>
                </td>
                <td className="px-3 py-1.5">{w.v.category}</td>
                <td className="px-3 py-1.5">{w.driverLabel}</td>
                <td className="px-3 py-1.5">
                  <span className="flex flex-wrap gap-1">
                    <StatusBadge status={w.status} />
                    {w.status !== "Offline" && !w.v.connected && <Tag tone="rose">Device offline</Tag>}
                  </span>
                </td>
                <td className="px-3 py-1.5">{w.stale ? "—" : `${w.v.speedKph} km/h`}</td>
                <td className="px-3 py-1.5">{w.siteName}</td>
                <td className="px-3 py-1.5">
                  {fmtTime(w.v.lastSeen)}
                  {w.stale && <span className="text-xs text-rose-700"> last known</span>}
                </td>
                <td className="px-3 py-1.5">
                  {fmtKm(w.v.nextServiceKm)} · {fmtDate(w.v.nextServiceDate)} {w.due && <Tag tone="violet">Due</Tag>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="px-3 py-6 text-center text-sm text-slate-500">No vehicles match these filters.</p>}
      </section>

      {selected && (
        <VehicleDrawer key={selected} id={selected} onClose={() => select(null)} pb={pb} setPb={setPb} />
      )}
    </div>
  );
}

function Kpi(props: { label: string; value: number; icon?: ReactNode; pressed?: boolean; onClick?: () => void; href?: string; tone?: "rose" }) {
  const { label, value, icon, pressed, onClick, href, tone } = props;
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-xs text-slate-600">
        {icon}
        {label}
      </span>
      <span className={`tabular text-xl font-semibold ${tone === "rose" ? "text-rose-700" : "text-slate-900"}`}>{value}</span>
    </>
  );
  const cls = "flex flex-col items-start rounded-md px-2.5 py-1.5 text-left ring-1 ring-inset";
  if (onClick)
    return (
      <button type="button" aria-pressed={pressed} onClick={onClick} className={`${cls} ring-slate-200 hover:bg-slate-50 aria-pressed:bg-sky-50 aria-pressed:ring-sky-500`}>
        {body}
      </button>
    );
  if (href)
    return (
      <Link href={href} className={`${cls} ring-slate-200 hover:bg-slate-50`}>
        {body}
      </Link>
    );
  return <div className={`${cls} ring-transparent`}>{body}</div>;
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-slate-600">
      {STATUSES.map((st) => (
        <span key={st} className="flex items-center gap-1">
          <StatusIcon status={st} /> {st}
        </span>
      ))}
      <span className="flex items-center gap-1">
        <span className="inline-block size-2.5 rounded-full border border-white bg-rose-600" /> Device offline
      </span>
      <span>Dashed circles: fictional demo sites. Grey lines: illustrative routes.</span>
    </div>
  );
}
