"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useDemo } from "./DemoProvider";
import { Modal, btn, btnDanger, btnSecondary } from "./ui";
import { fmtTime } from "@/lib/format";
import { BUS_ID, OVERSPEED_ID, RESTORE_ID, SERVICE_ID } from "@/lib/sim";
import type { ScenarioState, Speed } from "@/lib/types";

const NAV = [
  { href: "/", label: "Control Room" },
  { href: "/maintenance/", label: "Maintenance" },
  { href: "/compliance/", label: "Compliance" },
];
const PRESENTED_BY = process.env.NEXT_PUBLIC_PRESENTED_BY;

export function Header() {
  const { s, dispatch, storage, restored, reset } = useDemo();
  const path = usePathname();
  const router = useRouter();
  const ref = useRef<HTMLElement>(null);
  const [controls, setControls] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // Expose the header height so fixed panels (vehicle drawer) sit below it.
  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty("--header-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { paused, speed } = s.clock;
  const focus = (id: string) => {
    dispatch({ type: "SELECT_VEHICLE", id });
    setControls(false);
    if (path !== "/") router.push("/");
  };
  const scenario = (key: "busDeparture" | "overspeed", vehicle: string) => {
    dispatch({ type: "RUN_SCENARIO", scenario: key });
    if (paused) dispatch({ type: "SET_PAUSED", paused: false });
    focus(vehicle);
  };

  return (
    <header ref={ref} className="relative z-[1100] bg-navy text-white shadow sm:sticky sm:top-0">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2">
        <div className="leading-tight">
          <div className="font-semibold tracking-tight">Fleet Control — Demonstration</div>
          {PRESENTED_BY && <div className="text-xs text-slate-300">{PRESENTED_BY}</div>}
        </div>
        <nav aria-label="Main" className="flex gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={path === n.href ? "page" : undefined}
              className="rounded-md px-3 py-1.5 text-sm text-slate-200 hover:bg-white/10 aria-[current=page]:bg-white/15 aria-[current=page]:text-white"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="tabular rounded-md bg-white/10 px-2.5 py-1 text-sm" aria-live="off">
            <span className="text-slate-300">Demo clock </span>
            <span className="font-medium">{fmtTime(s.clock.now)}</span>
            <span className="text-slate-300"> GST</span>
          </div>
          <button
            type="button"
            className={`${btn} min-w-[84px] bg-white/10 hover:bg-white/20`}
            onClick={() => dispatch({ type: "SET_PAUSED", paused: !paused })}
            aria-pressed={paused}
          >
            {paused ? "▶ Play" : "❚❚ Pause"}
          </button>
          <div role="group" aria-label="Simulation speed" className="flex overflow-hidden rounded-md ring-1 ring-white/20">
            {([1, 4, 16] as Speed[]).map((x) => (
              <button
                key={x}
                type="button"
                aria-pressed={speed === x}
                onClick={() => dispatch({ type: "SET_SPEED", speed: x })}
                className="tabular px-2.5 py-1.5 text-sm hover:bg-white/10 aria-pressed:bg-white aria-pressed:font-semibold aria-pressed:text-navy"
              >
                {x}×
              </button>
            ))}
          </div>
          <button type="button" className={`${btn} bg-white/10 hover:bg-white/20`} onClick={() => setControls(true)}>
            Demo controls
          </button>
          <button type="button" className={`${btn} text-slate-200 hover:bg-white/10`} onClick={() => setConfirmReset(true)}>
            Reset demo
          </button>
        </div>
      </div>
      {/* Always visible: in the header from sm up, pinned to the bottom edge on phones. */}
      <div className="fixed inset-x-0 bottom-0 z-[1300] bg-amber-300 px-4 py-1 text-center text-xs font-semibold text-amber-950 sm:static">
        Demo mode • 50 simulated vehicles • No live GPS connection
      </div>
      {storage === "session" && (
        <div role="status" className="bg-rose-100 px-4 py-1 text-center text-xs text-rose-900">
          Session only — changes will not survive refresh.
        </div>
      )}
      {storage === "incompatible" && (
        <div role="status" className="flex items-center justify-center gap-3 bg-rose-100 px-4 py-1 text-xs text-rose-900">
          Saved demo data is from an incompatible version, so it was not loaded.
          <button type="button" className="font-semibold underline" onClick={reset}>
            Reset demo
          </button>
        </div>
      )}
      {restored && paused && (
        <div role="status" className="bg-sky-100 px-4 py-1 text-center text-xs text-sky-900">
          Restored the saved demo session. It is paused — press Play to resume.
        </div>
      )}

      <Modal open={controls} onClose={() => setControls(false)} title="Demo controls">
        <div className="space-y-5 text-sm">
          <section>
            <h3 className="mb-2 font-semibold">Presenter scenarios</h3>
            <p className="mb-3 text-slate-600">
              Scenarios feed the same telemetry and rules as normal updates. Each runs once until you reset the demo. Use 16× to see
              movement at fleet zoom.
            </p>
            <ul className="space-y-2">
              <Scenario
                title="Bus leaves depot"
                detail={`${BUS_ID} departs Demo Depot A; one geofence-exit alert opens.`}
                state={s.scenarios.busDeparture}
                onRun={() => scenario("busDeparture", BUS_ID)}
              />
              <Scenario
                title="Overspeed example"
                detail={`${OVERSPEED_ID} exceeds the fictional 80 km/h threshold for four samples.`}
                state={s.scenarios.overspeed}
                onRun={() => scenario("overspeed", OVERSPEED_ID)}
              />
              <Scenario
                title="Service due"
                detail={`Focus ${SERVICE_ID}, stopped and due for service, ready for a work order.`}
                state="ready"
                onRun={() => focus(SERVICE_ID)}
                label="Focus"
              />
              <Scenario
                title="Restore device"
                detail={`Reconnect ${RESTORE_ID}; its last update and status recover.`}
                state={s.vehicles[RESTORE_ID].connected ? "done" : "ready"}
                onRun={() => {
                  dispatch({ type: "RUN_SCENARIO", scenario: "restoreDevice" });
                  focus(RESTORE_ID);
                }}
              />
            </ul>
          </section>
          <section>
            <h3 className="mb-2 font-semibold">Geofences (fictional demo sites)</h3>
            <p className="mb-2 text-slate-600">Changing a radius recalculates membership silently — it does not create entry or exit events.</p>
            {s.zones.map((z) => (
              <label key={z.id} className="mb-2 grid grid-cols-[130px_1fr_64px] items-center gap-3">
                <span>{z.name}</span>
                <input
                  type="range"
                  min={200}
                  max={1500}
                  step={50}
                  value={z.radiusM}
                  onChange={(e) => dispatch({ type: "SET_ZONE_RADIUS", id: z.id, radiusM: Number(e.target.value) })}
                />
                <span className="tabular text-right">{z.radiusM} m</span>
              </label>
            ))}
          </section>
          <section className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold">Map basemap</h3>
              <p className="text-slate-600">Rehearse the no-basemap fallback for offline presenting.</p>
            </div>
            <button
              type="button"
              className={btnSecondary}
              onClick={() => dispatch({ type: "SET_UI", ui: { basemap: s.ui.basemap === "osm" ? "schematic" : "osm" } })}
            >
              {s.ui.basemap === "osm" ? "Switch to schematic view" : "Use OpenStreetMap basemap"}
            </button>
          </section>
          <p className="border-t border-slate-200 pt-3 text-xs text-slate-500">
            Each browser runs an independent demo with no cross-device sync. All vehicles, people, documents, locations and thresholds are
            synthetic.
          </p>
        </div>
      </Modal>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Reset the demo?">
        <p className="text-sm text-slate-700">
          This restores the original fleet, the 09:00 demo clock, work orders, document dates, filters, alerts and scenarios. Saved changes
          in this browser are cleared.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={() => setConfirmReset(false)}>
            Cancel
          </button>
          <button
            type="button"
            className={btnDanger}
            onClick={() => {
              reset();
              setConfirmReset(false);
            }}
          >
            Reset demo
          </button>
        </div>
      </Modal>
    </header>
  );
}

function Scenario(props: { title: string; detail: string; state: ScenarioState; onRun: () => void; label?: string }) {
  const { title, detail, state, onRun, label = "Run" } = props;
  return (
    <li className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-xs text-slate-600">{detail}</div>
      </div>
      <button type="button" className={btnSecondary} disabled={state !== "ready"} onClick={onRun}>
        {state === "ready" ? label : state === "running" ? "Running…" : "Done"}
      </button>
    </li>
  );
}
