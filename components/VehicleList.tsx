import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from "react";
import { useDemo } from "./DemoProvider";
import { StatusIcon, Tag, btnSecondary, statusColor } from "./ui";
import { downloadCsv, fleetCsv } from "@/lib/csv";
import { fmtDate, fmtHm, fmtKm, fmtTime } from "@/lib/format";
import { SPEED_LIMIT_KPH, type VehicleView } from "@/lib/rules";
import { STATUSES, type Category, type Filters, type Status } from "@/lib/types";

export type SelectVia = "pointer" | "keyboard";

const CATEGORIES: Category[] = ["Heavy vehicle", "Large bus", "Small bus", "SUV", "Passenger car"];

const STATUS_TEXT: Record<Status, string> = {
  Moving: "text-emerald-700",
  Idle: "text-amber-700",
  Stopped: "text-slate-600",
  Offline: "text-rose-700",
  Maintenance: "text-violet-700",
};

// One markup, two arrangements: a compact three-line card in a narrow panel,
// a single-line row with one column per field once the panel is wide (container query).
const WIDE_COLS =
  "@[920px]:grid-cols-[28px_minmax(110px,1fr)_minmax(96px,0.9fr)_minmax(104px,1fr)_minmax(84px,0.8fr)_72px_minmax(104px,1fr)_72px_minmax(172px,1.3fr)] @[920px]:gap-x-2.5";

const ROW = [
  "relative grid cursor-pointer grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-px px-3 py-1.5 outline-none",
  "border-b border-slate-100 @[620px]:odd:border-r @[920px]:odd:border-r-0",
  "transition-[background-color] duration-100 ease-out hover:bg-slate-50",
  "aria-selected:bg-[#e8eff9] aria-selected:shadow-[inset_3px_0_0_var(--color-navy)] aria-selected:transition-none",
  "focus-visible:shadow-[inset_0_0_0_2px_var(--color-signal)] aria-selected:focus-visible:shadow-[inset_3px_0_0_var(--color-navy),inset_0_0_0_2px_var(--color-signal)]",
  "scroll-mt-[calc(var(--map-top,0px)+var(--map-h,0px)+12px)]",
  `@[920px]:items-center @[920px]:py-1.5 ${WIDE_COLS}`,
].join(" ");

const selectCls =
  "h-7 min-w-0 rounded-md bg-white px-1.5 text-xs text-slate-800 ring-1 ring-inset ring-slate-300 outline-none focus:ring-2 focus:ring-signal";

type Props = {
  shown: VehicleView[];
  total: number;
  selectedId: string | null;
  onSelect: (id: string, via: SelectVia) => void;
  onHover: (id: string | null) => void;
};

export function VehicleList({ shown, total, selectedId, onSelect, onHover }: Props) {
  const { s, dispatch } = useDemo();
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const f = s.ui.filters;
  const filtered = shown.length !== total;
  const setFilters = (patch: Partial<Filters>) => dispatch({ type: "SET_FILTERS", filters: patch });
  const selectedShown = shown.some((w) => w.v.id === selectedId);

  // A vehicle picked on the map or in an alert scrolls its row into view; keyboard focus already keeps it visible.
  useEffect(() => {
    const row = selectedId ? listRef.current?.querySelector<HTMLElement>(`[data-id="${selectedId}"]`) : null;
    if (!row || row === document.activeElement) return;
    row.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [selectedId]);

  // "/" jumps to search from anywhere outside a field or dialog.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement).closest("input, textarea, select") || document.querySelector("dialog[open]")) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const rows = () => [...(listRef.current?.querySelectorAll<HTMLElement>("[data-id]") ?? [])];
  const go = (row: HTMLElement | undefined) => {
    if (!row) return;
    row.focus();
    onSelect(row.dataset.id!, "keyboard");
  };
  // Selection follows focus: arrows browse vehicles and the map and details follow instantly.
  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const all = rows();
    const i = all.indexOf(document.activeElement as HTMLElement);
    const target = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: all.length - 1 }[e.key];
    if (target === undefined) return;
    e.preventDefault();
    go(all[Math.min(all.length - 1, Math.max(0, target))]);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-slate-200 px-3 pb-2.5 pt-3">
        <h2 className="text-[15px] font-semibold tracking-tight text-navy">Vehicles</h2>
        <span aria-live="polite" className="tabular text-xs text-slate-500">
          Showing <span className="font-mono font-semibold text-slate-900">{shown.length}</span> of {total}
        </span>
        {filtered && (
          <button type="button" className="text-xs font-semibold text-navy underline-offset-2 hover:underline" onClick={() => dispatch({ type: "CLEAR_FILTERS" })}>
            Clear filters
          </button>
        )}
        <button
          type="button"
          className={`${btnSecondary} ml-auto h-7 px-2 text-xs @[920px]:order-last`}
          disabled={!shown.length}
          title="Download the listed vehicles as CSV"
          onClick={() => downloadCsv(fleetCsv(s, shown, filtered ? `filtered-${shown.length}-of-${total}` : `all-${total}`))}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5 fill-none stroke-current stroke-[1.6]">
            <path d="M8 2v8m-3.5-3.5L8 10l3.5-3.5M3 13h10" />
          </svg>
          {filtered ? `Export ${shown.length} shown` : `Export all ${total}`}
        </button>
        <label className="relative w-full @[920px]:w-60">
          <span className="sr-only">Search vehicle ID or driver</span>
          <svg viewBox="0 0 16 16" aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 fill-none stroke-slate-400 stroke-[1.8]">
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" />
          </svg>
          <input
            ref={searchRef}
            type="search"
            value={f.q}
            onChange={(e) => setFilters({ q: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                go(rows()[0]);
              }
            }}
            placeholder="Search vehicle ID or driver"
            className="h-8 w-full rounded-md bg-slate-50 pl-8 pr-8 text-[13px] text-slate-900 ring-1 ring-inset ring-slate-200 outline-none placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-signal"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-slate-300 bg-white px-1 font-mono text-[10px] leading-4 text-slate-500">
            /
          </kbd>
        </label>
        <div className="grid w-full grid-cols-3 gap-1.5 @[920px]:flex @[920px]:w-auto">
          <select className={selectCls} aria-label="Category" value={f.category} onChange={(e) => setFilters({ category: e.target.value })}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select className={selectCls} aria-label="Status" value={f.status} onChange={(e) => setFilters({ status: e.target.value })}>
            <option value="">All statuses</option>
            {STATUSES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select className={selectCls} aria-label="Assigned site" value={f.site} onChange={(e) => setFilters({ site: e.target.value })}>
            <option value="">All sites</option>
            {s.zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        aria-hidden="true"
        className={`hidden border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 @[920px]:grid ${WIDE_COLS}`}
      >
        <span />
        {["Vehicle", "Category", "Driver", "Status", "Speed", "Assigned site", "Updated", "Next service"].map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>

      <ul
        ref={listRef}
        role="listbox"
        aria-label="Vehicles"
        onKeyDown={onListKey}
        className="@[620px]:grid @[620px]:grid-cols-2 @[920px]:grid-cols-1 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain"
      >
        {shown.map((w, i) => (
          <Row
            key={w.v.id}
            w={w}
            selected={w.v.id === selectedId}
            focusable={selectedShown ? w.v.id === selectedId : i === 0}
            onSelect={onSelect}
            onHover={onHover}
          />
        ))}
      </ul>
      {shown.length === 0 && (
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center text-sm text-slate-500">
          No vehicles match these filters.
          <button type="button" className={btnSecondary} onClick={() => dispatch({ type: "CLEAR_FILTERS" })}>
            Clear filters
          </button>
        </div>
      )}
    </>
  );
}

type RowProps = {
  w: VehicleView;
  selected: boolean;
  focusable: boolean;
  onSelect: (id: string, via: SelectVia) => void;
  onHover: (id: string | null) => void;
};

function Row({ w, selected, focusable, onSelect, onHover }: RowProps) {
  const v = w.v;
  const dot = <span className="text-slate-300 @[920px]:hidden">·</span>;
  return (
    <li
      data-id={v.id}
      role="option"
      aria-selected={selected}
      tabIndex={focusable ? 0 : -1}
      onClick={() => onSelect(v.id, "pointer")}
      onMouseEnter={() => onHover(v.id)}
      onMouseLeave={() => onHover(null)}
      className={ROW}
    >
      <span
        className="row-span-3 flex size-7 items-center justify-center rounded-md @[920px]:row-span-1"
        style={{ backgroundColor: `color-mix(in srgb, ${statusColor(w.status)} 14%, white)` }}
      >
        <StatusIcon status={w.status} className="size-4" heading={w.status === "Moving" ? v.heading : undefined} />
      </span>

      <span className="col-start-2 row-start-1 flex min-w-0 items-baseline gap-2 @[920px]:contents">
        <span className="font-mono text-[13px] font-semibold text-navy @[920px]:col-start-2 @[920px]:row-start-1">{v.id}</span>
        <span className={`truncate text-[11px] font-semibold uppercase tracking-wider @[920px]:col-start-5 @[920px]:row-start-1 ${STATUS_TEXT[w.status]}`}>
          {w.status}
          {!v.connected && w.status !== "Offline" && <span className="ml-1 normal-case tracking-normal text-rose-700">· no link</span>}
        </span>
      </span>

      <span className="col-start-3 row-span-2 row-start-1 flex flex-col items-end gap-1 pt-0.5 @[920px]:col-start-6 @[920px]:row-span-1 @[920px]:items-start @[920px]:pt-0">
        <span className="tabular font-mono text-[13px] font-semibold text-slate-900">
          {w.stale ? "—" : v.speedKph}
          {!w.stale && <span className="ml-0.5 font-sans text-[11px] font-medium text-slate-500">km/h</span>}
        </span>
        {!w.stale && (
          <span className="speedbar" data-over={v.speedKph > SPEED_LIMIT_KPH || undefined} style={{ "--v": Math.min(v.speedKph / 100, 1) } as CSSProperties}>
            <i />
          </span>
        )}
      </span>

      <span className="col-start-2 row-start-2 truncate text-[12.5px] leading-4 text-slate-600 @[920px]:contents @[920px]:text-[13px]">
        <span className="@[920px]:col-start-3 @[920px]:row-start-1 @[920px]:truncate">{v.category}</span> {dot}{" "}
        <span className="@[920px]:col-start-4 @[920px]:row-start-1 @[920px]:truncate">{w.driverLabel}</span>
      </span>

      <span className="col-span-2 col-start-2 row-start-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] leading-4 text-slate-500 @[920px]:contents @[920px]:text-[13px]">
        <span className="@[920px]:col-start-7 @[920px]:row-start-1 @[920px]:truncate @[920px]:text-slate-600">{w.siteName}</span>
        {dot}
        <span className={`tabular font-mono @[920px]:col-start-8 @[920px]:row-start-1 @[920px]:text-xs ${w.stale ? "text-rose-700" : ""}`}>
          {w.stale ? (
            <span title="Last seen (stale telemetry)">
              <span className="@[920px]:hidden">last seen </span>
              {fmtHm(v.lastSeen)}
            </span>
          ) : (
            fmtTime(v.lastSeen)
          )}
        </span>
        {dot}
        <span className="flex items-center gap-1.5 whitespace-nowrap @[920px]:col-start-9 @[920px]:row-start-1 @[920px]:text-slate-600">
          <span className="tabular">
            <span className="@[920px]:hidden">Service </span>
            <span className="hidden @[920px]:inline">{fmtKm(v.nextServiceKm)} · </span>
            {fmtDate(v.nextServiceDate)}
          </span>
          {w.due && <Tag tone="violet">Due</Tag>}
        </span>
      </span>
    </li>
  );
}
