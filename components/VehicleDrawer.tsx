import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useDemo } from "./DemoProvider";
import { AlertActions } from "./AlertFeed";
import { CAMERAS, CameraFeed } from "./CameraFeed";
import { DocBadge, SeverityBadge, StatusBadge, StatusIcon, Tag, WorkflowBadge, btn, btnPrimary, btnSecondary, inputCls, statusColor } from "./ui";
import { fmtAed, fmtDate, fmtDateTime, fmtHm, fmtKm, fmtTime } from "@/lib/format";
import { isOpen } from "@/lib/rules";
import { playbackView, type Playback } from "@/lib/playback";

type PlaybackProps = { pb: Playback | null; setPb: Dispatch<SetStateAction<Playback | null>> };
type Props = PlaybackProps & { id: string; autoFocus: boolean; onClose: () => void };
type Tab = "overview" | "history" | "records";
const FIVE_MIN = 300_000;

/**
 * The shell stays mounted while vehicles change, so it slides in once on open and
 * then swaps content instantly as the operator browses the list. From laptop width it
 * fills the alerts column; on tablets and phones it is a fixed panel on the right.
 */
export function VehicleDrawer({ id, autoFocus, onClose, pb, setPb }: Props) {
  const asideRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = useEffectEvent(onClose);
  const shouldFocus = useEffectEvent(() => autoFocus);

  // Focus moves in only when the panel was opened from outside the list (keyboard browsing keeps focus in the list).
  // Esc closes it unless a dialog is on top; focus goes back to the opener if it was inside the panel.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    if (shouldFocus()) closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) close();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const active = document.activeElement;
      if (!active || active === document.body || asideRef.current?.contains(active)) opener?.focus?.();
    };
  }, []);

  return (
    <aside
      ref={asideRef}
      aria-labelledby="drawer-title"
      className="drawer fixed bottom-0 right-0 top-0 z-[1150] flex w-full max-w-[440px] flex-col bg-white shadow-2xl ring-1 ring-slate-300 sm:top-[var(--header-h,96px)] sm:z-[1050] lg:absolute lg:inset-0 lg:z-30 lg:max-w-none lg:shadow-none lg:ring-0"
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        className={`${btn} absolute right-2 top-2.5 z-10 px-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900`}
        aria-label="Close vehicle details"
        title="Close (Esc)"
      >
        ✕
      </button>
      <DrawerBody key={id} id={id} pb={pb} setPb={setPb} />
    </aside>
  );
}

function DrawerBody({ id, pb, setPb }: PlaybackProps & { id: string }) {
  const { s, views } = useDemo();
  const w = views.get(id)!;
  const [tab, setTab] = useState<Tab>("overview");

  const choose = (t: Tab) => {
    setTab(t);
    if (t !== "history") return setPb(null);
    const now = s.clock.now;
    const start = Math.floor((now - 60 * 60_000) / FIVE_MIN) * FIVE_MIN;
    setPb({ start, end: Math.ceil(now / FIVE_MIN) * FIVE_MIN, cursor: start, playing: false, rate: 2 });
  };

  return (
    <>
      <div className="border-b border-slate-200 px-4 pb-2 pt-3">
        <div className="flex items-center gap-3 pr-8">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `color-mix(in srgb, ${statusColor(w.status)} 14%, white)` }}
          >
            <StatusIcon status={w.status} className="size-5" heading={w.status === "Moving" ? w.v.heading : undefined} />
          </span>
          <div className="min-w-0">
            <h2 id="drawer-title" className="font-mono text-base font-semibold text-navy">
              {id}
            </h2>
            <p className="truncate text-[13px] text-slate-600">
              {w.v.category} · <span title="Synthetic registration">{w.v.registration}</span> · {w.siteName}
            </p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <StatusBadge status={w.status} />
          {(!w.v.connected || w.stale) && <Tag tone="rose">Device offline</Tag>}
          {w.blockers.length ? <Tag tone="rose">Unavailable</Tag> : <Tag tone="emerald">Available</Tag>}
          {w.due && <Tag tone="violet">Service due</Tag>}
        </div>
        <div role="tablist" aria-label="Vehicle record" className="mt-3 flex gap-1">
          {(["overview", "history", "records"] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => choose(t)}
              className="rounded-md px-3 py-1.5 text-sm font-medium capitalize text-slate-600 transition-[background-color,color] duration-150 hover:bg-slate-100 aria-selected:bg-navy aria-selected:text-white"
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div role="tabpanel" className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 text-sm">
        {tab === "overview" && <Overview id={id} />}
        {tab === "history" && pb && <History id={id} pb={pb} setPb={setPb} />}
        {tab === "records" && <Records id={id} />}
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[118px_minmax(0,1fr)] gap-x-3 gap-y-1">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-slate-500">{k}</dt>
          <dd className="tabular">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const NA = <span className="text-slate-400">Not available in demo</span>;

function Overview({ id }: { id: string }) {
  const { s, dispatch, views } = useDemo();
  const router = useRouter();
  const w = views.get(id)!;
  const v = w.v;
  const lastKnown = w.stale ? " (last known)" : "";
  const trips = s.trips.filter((t) => t.vehicleId === id);
  const current = trips.find((t) => t.status === "Active") ?? trips.find((t) => t.status === "Scheduled");
  const last = trips.filter((t) => t.status === "Completed").sort((a, b) => (b.actualEnd ?? 0) - (a.actualEnd ?? 0))[0];
  const openOrders = s.workOrders.filter((o) => o.vehicleId === id && o.status !== "Completed");
  const alerts = s.alerts.filter((a) => a.vehicleId === id && isOpen(a));
  const routeName = (rid: string) => (rid.startsWith("R") ? `route ${rid}` : rid);

  return (
    <>
      {id in CAMERAS && (
        <Section title="Road camera (sample footage)">
          <CameraFeed id={id} />
        </Section>
      )}

      <Section title="Telemetry (simulated)">
        <Rows
          rows={[
            ["Last update", <>{fmtTime(v.lastSeen)} GST{lastKnown}</>],
            ["Speed", w.stale ? "—" : `${v.speedKph} km/h`],
            ["Heading", `${v.heading}°${lastKnown}`],
            ["Ignition", `${v.ignition ? "On" : "Off"}${lastKnown}`],
            ["Odometer", fmtKm(v.odometerKm)],
            ["Engine hours", v.engineHours === null ? NA : `${Math.round(v.engineHours).toLocaleString("en-US")} h (sample)`],
            ["Fuel", v.fuelPercent === null ? NA : `${Math.round(v.fuelPercent)} % (sample)`],
            ["Position", `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}${lastKnown}`],
          ]}
        />
      </Section>

      <Section title="Driver and trip">
        <Rows
          rows={[
            ["Assigned driver", `${w.driverLabel} (${v.driverId})`],
            [
              current?.status === "Active" ? "Current trip" : "Next trip",
              current ? `${current.id} · ${routeName(current.routeId)} · ${current.status === "Active" ? `since ${fmtHm(current.actualStart!)}` : `planned ${fmtHm(current.plannedStart)}`}` : "None",
            ],
            ["Last trip", last ? `${last.id} · ${fmtHm(last.actualStart!)}–${fmtHm(last.actualEnd!)}` : "None"],
          ]}
        />
      </Section>

      <Section title="Availability">
        {w.blockers.length ? (
          <ul className="list-inside list-disc text-rose-800">
            {w.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        ) : (
          <p className="text-emerald-800">Available: no active trip, no hold, telemetry current, documents in date.</p>
        )}
      </Section>

      <Section title="Maintenance">
        <Rows
          rows={[
            ["Next service", `${fmtKm(v.nextServiceKm)} or ${fmtDate(v.nextServiceDate)}`],
            ["Open work orders", openOrders.length ? openOrders.map((o) => `${o.id} (${o.status})`).join(", ") : "None"],
          ]}
        />
        {w.due && (
          <div className="mt-2 rounded-md bg-violet-50 p-2.5 ring-1 ring-violet-200">
            <p className="mb-2 text-violet-900">Service due — {w.due}</p>
            {openOrders.length ? (
              <button type="button" className={btnSecondary} onClick={() => router.push("/maintenance/")}>
                View {openOrders[0].id}
              </button>
            ) : (
              <button
                type="button"
                className={btnPrimary}
                onClick={() => {
                  dispatch({ type: "SET_UI", ui: { createWorkOrderFor: id } });
                  router.push("/maintenance/");
                }}
              >
                Create work order
              </button>
            )}
          </div>
        )}
      </Section>

      <Section title="Compliance">
        <ul className="divide-y divide-slate-100">
          {w.docs.map((r) => (
            <li key={r.doc.id} className="flex items-center justify-between gap-2 py-1">
              <button
                type="button"
                className="text-left hover:underline"
                onClick={() => {
                  dispatch({ type: "SET_UI", ui: { complianceFocus: r.doc.id } });
                  router.push("/compliance/");
                }}
              >
                {r.doc.type}
                {r.doc.ownerType === "Driver" && <span className="text-slate-500"> (driver)</span>}
                <span className="block text-xs text-slate-500">expires {fmtDate(r.doc.expiryDate)}</span>
              </button>
              <DocBadge status={r.status} />
            </li>
          ))}
        </ul>
      </Section>

      <Section title={`Open alerts (${alerts.length})`}>
        {alerts.length ? (
          <ul className="space-y-1.5">
            {alerts.map((a) => (
              <li key={a.id} className="rounded-md bg-slate-50 p-2 ring-1 ring-slate-200">
                <div className="flex items-start gap-2">
                  <SeverityBadge severity={a.severity} />
                  <span className="flex-1">
                    {a.type} <span className="text-slate-500">· {fmtHm(a.at)}</span>
                  </span>
                  <WorkflowBadge workflow={a.workflow} />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <AlertActions alert={a} />
                  {a.conditionActive && <span className="text-[11px] text-slate-500">Resolve after recovery</span>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-500">No open alerts.</p>
        )}
      </Section>
    </>
  );
}

function History({ id, pb, setPb }: { id: string; pb: Playback; setPb: Dispatch<SetStateAction<Playback | null>> }) {
  const { s } = useDemo();
  const now = s.clock.now;
  const points = s.history[id] ?? [];
  const view = playbackView(points, pb, s.zones, now);
  const end = Math.min(pb.end, now);

  useEffect(() => {
    if (!pb.playing) return;
    const timer = setInterval(
      () =>
        setPb((p) => {
          if (!p) return p;
          const cursor = Math.min(Math.min(p.end, now), p.cursor + 20_000 * p.rate);
          return { ...p, cursor, playing: cursor < Math.min(p.end, now) };
        }),
      250,
    );
    return () => clearInterval(timer);
  }, [pb.playing, setPb, now]);

  const first = Math.floor(Math.min(points[0]?.t ?? now, now - 60 * 60_000) / FIVE_MIN) * FIVE_MIN;
  const options: number[] = [];
  for (let t = first; t <= Math.ceil(now / FIVE_MIN) * FIVE_MIN; t += FIVE_MIN) options.push(t);
  const setRange = (start: number, endT: number) => setPb({ ...pb, start, end: endT, cursor: start, playing: false });

  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">From</span>
          <select className={inputCls} value={pb.start} onChange={(e) => setRange(Number(e.target.value), pb.end)}>
            {options.filter((t) => t < pb.end).map((t) => (
              <option key={t} value={t}>
                {fmtHm(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">To</span>
          <select className={inputCls} value={pb.end} onChange={(e) => setRange(pb.start, Number(e.target.value))}>
            {options.filter((t) => t > pb.start).map((t) => (
              <option key={t} value={t}>
                {fmtHm(t)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {view.pts.length === 0 ? (
        <p className="rounded-md bg-slate-100 p-3 text-slate-700">No telemetry in this interval.</p>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-2">
            <button
              type="button"
              className={btnPrimary}
              onClick={() => setPb({ ...pb, playing: !pb.playing, cursor: pb.cursor >= end ? pb.start : pb.cursor })}
            >
              {pb.playing ? "❚❚ Pause" : "▶ Play"}
            </button>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              Speed
              <select className={inputCls} value={pb.rate} onChange={(e) => setPb({ ...pb, rate: Number(e.target.value) as Playback["rate"] })}>
                {[1, 2, 4, 8].map((r) => (
                  <option key={r} value={r}>
                    {r}×
                  </option>
                ))}
              </select>
            </label>
          </div>
          <input
            type="range"
            className="w-full accent-sky-600"
            min={pb.start}
            max={end}
            step={10_000}
            value={Math.min(pb.cursor, end)}
            aria-label="Playback position"
            aria-valuetext={fmtTime(pb.cursor)}
            onChange={(e) => setPb({ ...pb, cursor: Number(e.target.value), playing: false })}
          />
          <div className="tabular mt-2 rounded-md bg-sky-50 p-2.5 ring-1 ring-sky-200">
            <div className="font-semibold">{fmtTime(pb.cursor)} GST (history)</div>
            {view.cursor ? (
              <div>
                {view.cursor.lat.toFixed(5)}, {view.cursor.lng.toFixed(5)} · {view.cursor.speedKph} km/h · ignition{" "}
                {view.cursor.ignition ? "on" : "off"}
              </div>
            ) : (
              <div className="text-slate-600">No telemetry at this time (gap).</div>
            )}
          </div>
          {view.gaps.length > 0 && (
            <Section title="Telemetry gaps">
              <ul>
                {view.gaps.map(([a, b]) => (
                  <li key={a}>
                    {fmtHm(a)} → {fmtHm(b)}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {view.marks.length > 0 && (
            <Section title="Events on this route (annotations)">
              <ul>
                {view.marks.map((m) => (
                  <li key={m.label}>{m.label}</li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Playback uses its own cursor — live positions, fleet totals and alerts are unaffected. History after page load is kept for this
        browser session only. Illustrative positions, not a GPS vendor import.
      </p>
    </>
  );
}

function Records({ id }: { id: string }) {
  const { s } = useDemo();
  const orders = s.workOrders.filter((o) => o.vehicleId === id);
  const events = s.activity.filter((e) => e.vehicleId === id).sort((a, b) => b.at - a.at || b.id.localeCompare(a.id));
  return (
    <>
      <Section title="Work orders">
        {orders.length ? (
          <ul className="divide-y divide-slate-100">
            {orders.map((o) => (
              <li key={o.id} className="py-1.5">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">
                    {o.id} · {o.type}
                  </span>
                  <span>{o.status}</span>
                </div>
                <div className="text-xs text-slate-600">
                  {o.reason} · {fmtAed(o.partsCost + o.labourCost)}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-500">No work orders.</p>
        )}
      </Section>
      <Section title="Activity timeline">
        <ol className="space-y-2 border-l-2 border-slate-200 pl-3">
          {events.map((e) => (
            <li key={e.id}>
              <div className="text-xs text-slate-500">
                {fmtDateTime(e.at)} · {e.actor}
              </div>
              <div className="font-medium">{e.action}</div>
              <div className="text-slate-700">{e.summary}</div>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-slate-500">Local demo activity records — not a tamper-proof audit trail.</p>
      </Section>
    </>
  );
}
