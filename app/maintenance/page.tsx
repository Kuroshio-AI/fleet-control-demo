"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useDemo } from "@/components/DemoProvider";
import { ErrorText, Field, Modal, StatusIcon, Tag, btnPrimary, btnSecondary, card, inputCls, statusColor } from "@/components/ui";
import { dubaiDate, fmtAed, fmtDate, fmtDuration, fmtHm, fmtKm } from "@/lib/format";
import { heldVehicleIds, serviceProgress, today, type VehicleView } from "@/lib/rules";
import { completionError, costError, nextWorkOrderId, parseAmount, workOrderError, type WorkOrderInput } from "@/lib/store";
import type { WorkOrder } from "@/lib/types";

const TECHNICIANS = ["Technician T-01", "Technician T-02", "Technician T-03", "Technician T-04"];
// Illustrative checklist; all items ticked = the quality check the reducer requires.
const QC_ITEMS = ["Brakes and tyres inspected", "Fluids and leaks checked", "Road test passed"];
const STEPS = ["Raised", "Started", "QC", "Released"];
const DAY = 86_400_000;

type Progress = ReturnType<typeof serviceProgress> & { w: VehicleView };
type Outcome = { id: string; kind: "raised" | "started" | "released" };

const stepsDone = (o: WorkOrder) => (o.status === "Completed" ? 4 : o.status === "In progress" ? 2 : 1);
const aed = (n: number) => `AED ${Math.round(n).toLocaleString("en-US")}`;

export default function MaintenancePage() {
  const { s, dispatch, views } = useDemo();
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [intervalOpen, setIntervalOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const date = today(s);
  const now = s.clock.now;

  // Each step shows what changed for the fleet, and the card that moved gets a brief signal ring.
  const land = (o: Outcome) => {
    setOutcome(o);
    setFlash(o.id);
    window.setTimeout(() => setFlash((f) => (f === o.id ? null : f)), 1600);
  };
  const raise = (vehicleId: string) => dispatch({ type: "SET_UI", ui: { createWorkOrderFor: vehicleId } });
  const start = (id: string) => {
    dispatch({ type: "START_WORK", id });
    land({ id, kind: "started" });
  };
  const viewVehicle = (id: string) => {
    dispatch({ type: "SELECT_VEHICLE", id });
    router.push("/");
  };

  const all = useMemo(() => [...views.values()], [views]);
  const progress: Progress[] = useMemo(
    () => all.map((w) => ({ w, ...serviceProgress(w.v, s.serviceInterval, date) })),
    [all, s.serviceInterval, date],
  );
  const onHold = new Set(s.workOrders.filter((o) => o.status !== "Completed").map((o) => o.vehicleId));
  const due = progress.filter((p) => p.w.due && !onHold.has(p.w.v.id)).sort((a, b) => b.used - a.used);
  const scheduled = s.workOrders.filter((o) => o.status === "Open").sort((a, b) => b.createdAt - a.createdAt);
  const inWorkshop = s.workOrders.filter((o) => o.status === "In progress").sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
  const completed = s.workOrders.filter((o) => o.status === "Completed").sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  const releasedToday = completed.filter((o) => dubaiDate(o.completedAt!) === date);

  const held = heldVehicleIds(s).size;
  const inService = all.length - held;
  const overdue = progress.filter((p) => p.w.due).length;
  const dueSoon = progress.filter((p) => !p.w.due && (p.kmLeft <= 1000 || p.daysLeft <= 30)).length;
  const spend = { Preventive: 0, Corrective: 0 };
  for (const o of completed) if (now - o.completedAt! <= 30 * DAY) spend[o.type] += o.partsCost + o.labourCost;
  const turnaround = completed.length ? completed.reduce((t, o) => t + (o.completedAt! - o.createdAt), 0) / completed.length : null;
  const order = openId ? s.workOrders.find((o) => o.id === openId) : undefined;

  return (
    <div className="mx-auto max-w-[1440px] space-y-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-xl font-semibold tracking-tight text-navy">Maintenance workshop</h1>
          <p className="text-sm text-slate-600">
            Service due → work order → start → quality check → release. Simplified demo: no inventory, purchasing or approvals.
          </p>
        </div>
        <button type="button" className={btnSecondary} onClick={() => setIntervalOpen(true)}>
          <span className="text-slate-500">Service interval</span>
          <span className="tabular font-mono text-[13px]">
            {s.serviceInterval.km.toLocaleString("en-US")} km · {s.serviceInterval.days} d
          </span>
        </button>
        <button type="button" className={btnPrimary} onClick={() => raise("")}>
          + Corrective work order
        </button>
      </div>

      {outcome && <OutcomeBanner outcome={outcome} inService={inService} total={all.length} onClose={() => setOutcome(null)} />}

      <section aria-label="Workshop indicators" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Fleet in service" value={`${Math.round((inService / all.length) * 100)}%`} sub={`${inService} of ${all.length} · ${held} off road for maintenance`}>
          <Bar value={inService / all.length} tone="bg-emerald-500" />
        </Kpi>
        <Kpi label="Service overdue" value={overdue} sub="By mileage or date" accent="text-violet-700" />
        <Kpi label="Due in 30 days" value={dueSoon} sub="Plan workshop slots" />
        <Kpi label="Open work orders" value={scheduled.length + inWorkshop.length} sub={`${scheduled.length} scheduled · ${inWorkshop.length} in workshop`} />
        <Kpi label="Avg turnaround" value={turnaround === null ? "—" : fmtDuration(turnaround)} sub="Raised → released" />
        <Kpi label="Spend · 30 days" value={aed(spend.Preventive + spend.Corrective)} sub={`Preventive ${aed(spend.Preventive)} · Corrective ${aed(spend.Corrective)}`}>
          <SplitBar a={spend.Preventive} b={spend.Corrective} />
        </Kpi>
      </section>

      <section aria-label="Workshop board">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold tracking-tight text-navy">Workshop board</h2>
          <p className="text-xs text-slate-500">Cards move left to right. Scheduled and in-workshop vehicles are on maintenance hold.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Lane title="Due for service" dot="bg-violet-600" count={due.length} empty="No vehicles waiting for service.">
            {due.map((p) => (
              <DueCard key={p.w.v.id} p={p} onRaise={() => raise(p.w.v.id)} onView={() => viewVehicle(p.w.v.id)} />
            ))}
          </Lane>
          <Lane title="Scheduled" dot="bg-slate-500" count={scheduled.length} empty="Create a work order from a due vehicle.">
            {scheduled.map((o) => (
              <OrderCard key={o.id} o={o} now={now} flash={flash === o.id} onOpen={() => setOpenId(o.id)} onStart={() => start(o.id)} />
            ))}
          </Lane>
          <Lane title="In workshop" dot="bg-amber-500" count={inWorkshop.length} empty="Nothing in the workshop.">
            {inWorkshop.map((o) => (
              <OrderCard key={o.id} o={o} now={now} flash={flash === o.id} onOpen={() => setOpenId(o.id)} />
            ))}
          </Lane>
          <Lane title="Released today" dot="bg-emerald-600" count={releasedToday.length} empty="Completed work lands here.">
            {releasedToday.map((o) => (
              <OrderCard key={o.id} o={o} now={now} flash={flash === o.id} onOpen={() => setOpenId(o.id)} />
            ))}
          </Lane>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Forecast progress={progress} interval={s.serviceInterval} onView={viewVehicle} />
        <History orders={completed} onOpen={setOpenId} />
      </div>

      <Modal open={s.ui.createWorkOrderFor !== null} onClose={() => dispatch({ type: "SET_UI", ui: { createWorkOrderFor: null } })} title="Create work order">
        <CreateForm
          vehicleId={s.ui.createWorkOrderFor ?? ""}
          onCreated={(id) => {
            dispatch({ type: "SET_UI", ui: { createWorkOrderFor: null } });
            land({ id, kind: "raised" });
          }}
        />
      </Modal>
      <Modal open={!!order} onClose={() => setOpenId(null)} title={order ? `${order.id} · ${order.vehicleId}` : "Work order"}>
        {order && (
          <Detail
            order={order}
            onViewVehicle={viewVehicle}
            onStart={() => start(order.id)}
            onCompleted={() => {
              setOpenId(null);
              land({ id: order.id, kind: "released" });
            }}
          />
        )}
      </Modal>
      <Modal open={intervalOpen} onClose={() => setIntervalOpen(false)} title="Demo service interval">
        <ServiceInterval onSaved={() => setIntervalOpen(false)} />
      </Modal>
    </div>
  );
}

function OutcomeBanner({ outcome, inService, total, onClose }: { outcome: Outcome; inService: number; total: number; onClose: () => void }) {
  const { s } = useDemo();
  const o = s.workOrders.find((x) => x.id === outcome.id);
  if (!o) return null;
  const v = s.vehicles[o.vehicleId];
  const text =
    outcome.kind === "raised"
      ? `${o.id} raised for ${o.vehicleId}. The vehicle is on maintenance hold and shows as Maintenance on the map.`
      : outcome.kind === "started"
        ? `${o.id}: work started by ${o.technician}.`
        : `${o.id} quality-checked and completed. ${o.vehicleId} is released to service${
            o.type === "Preventive" ? `; next service at ${fmtKm(v.nextServiceKm)} or ${fmtDate(v.nextServiceDate)}` : ""
          }.`;
  return (
    <div role="status" className="flex items-start gap-3 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-950 ring-1 ring-emerald-200">
      <span aria-hidden="true" className="font-semibold text-emerald-700">
        ✓
      </span>
      <p className="flex-1">
        {text}{" "}
        <span className="font-semibold">
          Fleet in service: {inService} of {total}.
        </span>
      </p>
      <button type="button" onClick={onClose} aria-label="Dismiss" className="text-emerald-800 hover:text-emerald-950">
        ✕
      </button>
    </div>
  );
}

function Kpi(props: { label: string; value: ReactNode; sub: string; accent?: string; children?: ReactNode }) {
  const { label, value, sub, accent = "text-slate-900", children } = props;
  return (
    <div className={`${card} flex flex-col gap-1.5 px-3 py-2.5`}>
      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <span className={`tabular font-mono text-[22px] font-semibold leading-none ${accent}`}>{value}</span>
      {children}
      <span className="text-xs leading-snug text-slate-500">{sub}</span>
    </div>
  );
}

const Bar = ({ value, tone }: { value: number; tone: string }) => (
  <span className="block h-1.5 overflow-hidden rounded-full bg-slate-100">
    <i className={`block h-full transition-[width] duration-300 ease-out ${tone}`} style={{ width: `${Math.min(value, 1) * 100}%` }} />
  </span>
);

const SplitBar = ({ a, b }: { a: number; b: number }) => (
  <span className="flex h-1.5 overflow-hidden rounded-full bg-slate-100" title="Preventive vs corrective">
    <i className="h-full bg-sky-500 transition-[flex-grow] duration-300 ease-out" style={{ flexGrow: a }} />
    <i className="h-full bg-rose-500 transition-[flex-grow] duration-300 ease-out" style={{ flexGrow: b }} />
  </span>
);

function Lane({ title, dot, count, empty, children }: { title: string; dot: string; count: number; empty: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[180px] flex-col rounded-xl bg-slate-200/50 p-2 ring-1 ring-inset ring-slate-200">
      <div className="flex items-center gap-2 px-1.5 pb-2 pt-1">
        <i className={`size-2 rounded-full ${dot}`} />
        <h3 className="text-[13px] font-semibold text-slate-800">{title}</h3>
        <span className="tabular ml-auto rounded-full bg-white px-1.5 font-mono text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
          {count}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        {count ? (
          children
        ) : (
          <p className="m-0.5 flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
            {empty}
          </p>
        )}
      </div>
    </div>
  );
}

const Tile = ({ w }: { w: VehicleView }) => (
  <span
    className="flex size-8 shrink-0 items-center justify-center rounded-md"
    style={{ backgroundColor: `color-mix(in srgb, ${statusColor(w.status)} 14%, white)` }}
  >
    <StatusIcon status={w.status} className="size-4" heading={w.status === "Moving" ? w.v.heading : undefined} />
  </span>
);

const TypeChip = ({ type }: { type: WorkOrder["type"] }) => (
  <span
    className={`rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider ${
      type === "Preventive" ? "bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200" : "bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-200"
    }`}
  >
    {type}
  </span>
);

function DueCard({ p, onRaise, onView }: { p: Progress; onRaise: () => void; onView: () => void }) {
  const { w, kmLeft, daysLeft } = p;
  const why = kmLeft <= 0 ? `${fmtKm(-kmLeft)} past the service point` : daysLeft < 0 ? `${-daysLeft} day${daysLeft === -1 ? "" : "s"} overdue` : "Due today";
  return (
    // The action sits beside the vehicle in a roomy lane and drops below it in a narrow one.
    <article className="card-enter @container rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center gap-2.5">
        <Tile w={w} />
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onView} className="font-mono text-[13px] font-semibold text-navy hover:underline">
            {w.v.id}
          </button>
          <div className="truncate text-xs text-slate-500">
            {w.status} · {w.siteName}
          </div>
        </div>
        <span className="hidden shrink-0 @[300px]:block">
          <button type="button" className={`${btnPrimary} h-7 px-2.5 text-xs`} onClick={onRaise}>
            Create work order
          </button>
        </span>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold text-violet-700">{why}</span>
        <span className="tabular font-mono text-slate-600" title="Odometer">
          {fmtKm(w.v.odometerKm)}
        </span>
      </div>
      <p className="tabular mt-0.5 text-[11px] text-slate-500">
        Service point {fmtKm(w.v.nextServiceKm)} · {fmtDate(w.v.nextServiceDate)}
      </p>
      <span className="mt-2 block @[300px]:hidden">
        <button type="button" className={`${btnPrimary} h-7 w-full text-xs`} onClick={onRaise}>
          Create work order
        </button>
      </span>
    </article>
  );
}

function Stepper({ o, times = false }: { o: WorkOrder; times?: boolean }) {
  const done = stepsDone(o);
  const at = [o.createdAt, o.startedAt, o.completedAt, o.completedAt];
  return (
    <ol className="mt-2.5 grid grid-cols-4 gap-1.5" aria-label={`Progress: ${STEPS[done - 1]}`}>
      {STEPS.map((label, i) => (
        <li key={label} className="min-w-0">
          <span className={`block h-1 rounded-full ${i < done ? "bg-emerald-500" : i === done ? "bg-amber-400" : "bg-slate-200"}`} />
          <span className={`mt-1 block truncate text-[10px] font-semibold uppercase tracking-wider ${i < done ? "text-slate-700" : "text-slate-400"}`}>
            {label}
          </span>
          {times && <span className="tabular block font-mono text-[11px] text-slate-500">{i < done && at[i] ? fmtHm(at[i]!) : "—"}</span>}
        </li>
      ))}
    </ol>
  );
}

function OrderCard(props: { o: WorkOrder; now: number; flash: boolean; onOpen: () => void; onStart?: () => void }) {
  const { o, now, flash, onOpen, onStart } = props;
  const timing =
    o.status === "Open"
      ? `Raised ${fmtHm(o.createdAt)}`
      : o.status === "In progress"
        ? `In workshop ${fmtDuration(now - (o.startedAt ?? now))}`
        : `Released ${fmtHm(o.completedAt!)} · ${fmtDuration(o.completedAt! - o.createdAt)}`;
  return (
    // Clicking anywhere opens the order for pointer users; keyboard users use the order ID and action buttons.
    <article
      onClick={onOpen}
      data-flash={flash || undefined}
      className="card-enter cursor-pointer rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50/70 data-[flash]:ring-2 data-[flash]:ring-signal"
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="font-mono text-[11px] font-semibold text-slate-500 hover:text-navy hover:underline"
        >
          {o.id}
        </button>
        <TypeChip type={o.type} />
        {o.priority === "High" && <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-700">High</span>}
        <span title={o.technician} className="ml-auto rounded-full bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600">
          {o.technician.replace("Technician ", "")}
        </span>
      </div>
      <div className="mt-1.5 font-mono text-sm font-semibold text-navy">{o.vehicleId}</div>
      <p className="line-clamp-2 text-xs leading-snug text-slate-600">{o.reason}</p>
      <Stepper o={o} />
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="truncate text-slate-500">{timing}</span>
        <span className="tabular font-mono font-semibold text-slate-800">{aed(o.partsCost + o.labourCost)}</span>
      </div>
      {o.status !== "Completed" && (
        <button
          type="button"
          className={`${o.status === "Open" ? btnPrimary : btnSecondary} mt-2.5 h-8 w-full text-xs`}
          onClick={(e) => {
            e.stopPropagation();
            if (o.status === "Open" && onStart) onStart();
            else onOpen();
          }}
        >
          {o.status === "Open" ? "Start work" : "Costs, quality check and release"}
        </button>
      )}
    </article>
  );
}

function Forecast({ progress, interval, onView }: { progress: Progress[]; interval: { km: number; days: number }; onView: (id: string) => void }) {
  const rows = [...progress].sort((a, b) => b.used - a.used).slice(0, 10);
  return (
    <section className={`${card} p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight text-navy">Service forecast</h2>
        <span className="text-xs text-slate-500">
          Share of the {fmtKm(interval.km)} / {interval.days}-day interval used, by distance or time
        </span>
      </div>
      <ul className="mt-3 space-y-0.5">
        {rows.map(({ w, used, kmLeft, daysLeft }) => {
          const tone = used >= 1 ? "bg-violet-600" : used >= 0.85 ? "bg-amber-500" : "bg-emerald-500";
          const label =
            used < 1
              ? `${fmtKm(kmLeft)} · ${daysLeft} d left`
              : kmLeft <= 0
                ? `${fmtKm(-kmLeft)} over`
                : daysLeft < 0
                  ? `${-daysLeft} d overdue`
                  : "Due today";
          return (
            <li key={w.v.id}>
              <button
                type="button"
                onClick={() => onView(w.v.id)}
                className="grid w-full grid-cols-[104px_minmax(0,1fr)_132px] items-center gap-3 rounded-md px-1.5 py-1 text-left hover:bg-slate-50"
              >
                <span className="font-mono text-[12.5px] font-semibold text-navy">{w.v.id}</span>
                <span className="relative h-2 overflow-hidden rounded-full bg-slate-100">
                  <i className={`absolute inset-y-0 left-0 ${tone}`} style={{ width: `${Math.min(Math.max(used, 0.02), 1) * 100}%` }} />
                </span>
                <span className={`tabular text-right text-xs ${used >= 1 ? "font-semibold text-violet-700" : "text-slate-600"}`}>{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <i className="size-2 rounded-full bg-emerald-500" /> On schedule
        </span>
        <span className="flex items-center gap-1.5">
          <i className="size-2 rounded-full bg-amber-500" /> 85% or more used
        </span>
        <span className="flex items-center gap-1.5">
          <i className="size-2 rounded-full bg-violet-600" /> Due now
        </span>
        <span>Click a vehicle to see it on the map.</span>
      </div>
    </section>
  );
}

function History({ orders, onOpen }: { orders: WorkOrder[]; onOpen: (id: string) => void }) {
  return (
    <section className={`${card} p-4`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight text-navy">Repair history</h2>
        <span className="text-xs text-slate-500">Completed work orders</span>
      </div>
      <ul className="mt-2 divide-y divide-slate-100">
        {orders.map((o) => (
          <li key={o.id}>
            <button type="button" onClick={() => onOpen(o.id)} className="flex w-full items-center gap-3 rounded-md px-1.5 py-2 text-left hover:bg-slate-50">
              <TypeChip type={o.type} />
              <span className="min-w-0 flex-1">
                <span className="font-mono text-[12.5px] font-semibold text-navy">{o.vehicleId}</span>
                <span className="block truncate text-xs text-slate-500">{o.reason}</span>
              </span>
              <span className="text-right">
                <span className="tabular block font-mono text-[12.5px] font-semibold text-slate-800">{aed(o.partsCost + o.labourCost)}</span>
                <span className="block text-[11px] text-slate-500">{fmtDate(dubaiDate(o.completedAt!))}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-slate-500">Local demo records, not a tamper-proof audit trail.</p>
    </section>
  );
}

function ServiceInterval({ onSaved }: { onSaved: () => void }) {
  const { s, dispatch } = useDemo();
  const [km, setKm] = useState(String(s.serviceInterval.km));
  const [days, setDays] = useState(String(s.serviceInterval.days));
  const valid = Number(km) >= 1000 && Number(days) >= 30;
  return (
    <form
      className="space-y-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        dispatch({ type: "SET_SERVICE_INTERVAL", km: Number(km), days: Number(days) });
        onSaved();
      }}
    >
      <p className="text-slate-600">Used to set the next service after preventive work. An editable demo setting, not a manufacturer rule.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kilometres">
          <input className={inputCls} inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} />
        </Field>
        <Field label="Days">
          <input className={inputCls} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
      </div>
      {!valid && <ErrorText>Use at least 1,000 km and 30 days.</ErrorText>}
      <div className="flex justify-end">
        <button type="submit" className={btnPrimary} disabled={!valid}>
          Save interval
        </button>
      </div>
    </form>
  );
}

function CreateForm({ vehicleId, onCreated }: { vehicleId: string; onCreated: (id: string) => void }) {
  const { s, dispatch, views } = useDemo();
  const prefill = (id: string): WorkOrderInput => {
    const due = id ? views.get(id)?.due : null;
    const alert = s.alerts.find((a) => a.vehicleId === id && a.type === "Service due" && a.conditionActive);
    return {
      vehicleId: id,
      reason: due ? "Service due" : "",
      issueAlertId: due && alert ? alert.id : null,
      type: due ? "Preventive" : "Corrective",
      priority: "Medium",
      technician: "",
      plannedDate: today(s),
      description: due ? `Scheduled service. ${due}.` : "",
    };
  };
  const [form, setForm] = useState<WorkOrderInput>(() => prefill(vehicleId));
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const set = (patch: Partial<WorkOrderInput>) => setForm({ ...form, ...patch });
  const linked = form.issueAlertId && s.alerts.find((a) => a.id === form.issueAlertId);

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy.current) return;
        const err = workOrderError(s, form);
        setError(err);
        if (err) return;
        busy.current = true;
        const id = nextWorkOrderId(s);
        dispatch({ type: "CREATE_WORK_ORDER", input: form });
        onCreated(id);
      }}
    >
      <Field label="Vehicle">
        <select className={inputCls} value={form.vehicleId} onChange={(e) => setForm(prefill(e.target.value))} required>
          <option value="">Choose a vehicle</option>
          {s.vehicleOrder.map((id) => (
            <option key={id}>{id}</option>
          ))}
        </select>
      </Field>
      <Field label="Type">
        <select className={inputCls} value={form.type} onChange={(e) => set({ type: e.target.value as WorkOrder["type"] })}>
          <option>Preventive</option>
          <option>Corrective</option>
        </select>
      </Field>
      <Field label="Reason">
        <input className={inputCls} value={form.reason} onChange={(e) => set({ reason: e.target.value })} required />
      </Field>
      <Field label="Priority">
        <select className={inputCls} value={form.priority} onChange={(e) => set({ priority: e.target.value as WorkOrder["priority"] })}>
          <option>Low</option>
          <option>Medium</option>
          <option>High</option>
        </select>
      </Field>
      <Field label="Technician">
        <select className={inputCls} value={form.technician} onChange={(e) => set({ technician: e.target.value })} required>
          <option value="">Choose a technician</option>
          {TECHNICIANS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="Planned date">
        <input type="date" className={inputCls} value={form.plannedDate} onChange={(e) => set({ plannedDate: e.target.value })} required />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Description">
          <textarea className={inputCls} rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} required />
        </Field>
      </div>
      <p className="text-xs text-slate-600 sm:col-span-2">
        Originating issue: {linked ? `${linked.id} — ${linked.type}` : "none"}. Saving places the vehicle on maintenance hold.
      </p>
      <div className="sm:col-span-2">
        <ErrorText>{error}</ErrorText>
      </div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="submit" className={btnPrimary}>
          Create work order
        </button>
      </div>
    </form>
  );
}

function Detail(props: { order: WorkOrder; onViewVehicle: (id: string) => void; onStart: () => void; onCompleted: () => void }) {
  const { order: o, onViewVehicle, onStart, onCompleted } = props;
  const { dispatch } = useDemo();
  const [parts, setParts] = useState(String(o.partsCost));
  const [labour, setLabour] = useState(String(o.labourCost));
  const [notes, setNotes] = useState(o.notes);
  const [completionNotes, setCompletionNotes] = useState("");
  const [checks, setChecks] = useState(QC_ITEMS.map(() => false));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const qc = checks.every(Boolean);
  const partsN = parseAmount(parts) ?? 0;
  const labourN = parseAmount(labour) ?? 0;

  return (
    <div className="space-y-4 text-sm">
      <Stepper o={o} times />
      <div className="flex flex-wrap items-center gap-2">
        <TypeChip type={o.type} />
        <Tag tone={o.status === "Completed" ? "emerald" : o.status === "In progress" ? "violet" : "slate"}>{o.status}</Tag>
        <span className="text-xs text-slate-500">
          {o.priority} priority · {o.technician}
        </span>
        <button type="button" className="ml-auto text-sm font-medium text-navy hover:underline" onClick={() => onViewVehicle(o.vehicleId)}>
          View {o.vehicleId} on map →
        </button>
      </div>
      <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1">
        <dt className="text-slate-500">Reason</dt>
        <dd>{o.reason}</dd>
        <dt className="text-slate-500">Description</dt>
        <dd>{o.description}</dd>
        <dt className="text-slate-500">Planned</dt>
        <dd>{fmtDate(o.plannedDate)}</dd>
      </dl>

      {o.status === "Open" && (
        <button type="button" className={btnPrimary} onClick={onStart}>
          Start work
        </button>
      )}

      {o.status === "In progress" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Parts cost (AED)">
              <input className={inputCls} inputMode="decimal" value={parts} onChange={(e) => (setParts(e.target.value), setSaved(false))} />
            </Field>
            <Field label="Labour cost (AED)">
              <input className={inputCls} inputMode="decimal" value={labour} onChange={(e) => (setLabour(e.target.value), setSaved(false))} />
            </Field>
            <div className="col-span-2">
              <Field label="Work notes">
                <textarea className={inputCls} rows={2} value={notes} onChange={(e) => (setNotes(e.target.value), setSaved(false))} />
              </Field>
            </div>
          </div>
          <div className="space-y-1.5 rounded-md bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
            <div className="tabular flex items-center justify-between">
              <span>Total (parts + labour)</span>
              <span className="font-mono font-semibold">{costError(parts, labour) ? "—" : fmtAed(partsN + labourN)}</span>
            </div>
            <SplitBar a={partsN} b={labourN} />
            <div className="flex justify-between text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <i className="size-2 rounded-full bg-sky-500" /> Parts
              </span>
              <span className="flex items-center gap-1">
                Labour <i className="size-2 rounded-full bg-rose-500" />
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={btnSecondary}
              onClick={() => {
                const err = costError(parts, labour);
                setError(err);
                if (!err) {
                  dispatch({ type: "UPDATE_WORK", id: o.id, parts, labour, notes });
                  setSaved(true);
                }
              }}
            >
              Save costs and notes
            </button>
            {saved && <span className="text-emerald-700">Saved.</span>}
          </div>
          <fieldset className="space-y-2 rounded-md p-3 ring-1 ring-slate-200">
            <legend className="px-1 font-semibold">Quality check and release</legend>
            <div className="space-y-1.5">
              {QC_ITEMS.map((item, i) => (
                <label key={item} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-navy"
                    checked={checks[i]}
                    onChange={(e) => setChecks(checks.map((c, j) => (j === i ? e.target.checked : c)))}
                  />
                  {item}
                </label>
              ))}
              <p className="text-xs text-slate-500">
                {checks.filter(Boolean).length} of {QC_ITEMS.length} checks complete. Illustrative checklist, not an approved inspection.
              </p>
            </div>
            <Field label="Completion notes (required)">
              <textarea className={inputCls} rows={2} value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)} />
            </Field>
            <button
              type="button"
              className={btnPrimary}
              onClick={() => {
                const err = completionError(o, parts, labour, completionNotes, qc);
                setError(err);
                if (err) return;
                dispatch({ type: "COMPLETE_WORK", id: o.id, parts, labour, completionNotes, qualityCheck: qc });
                onCompleted();
              }}
            >
              Complete and release
            </button>
          </fieldset>
        </>
      )}

      {o.status === "Completed" && (
        <div className="tabular space-y-1 rounded-md bg-emerald-50 p-3 ring-1 ring-emerald-200">
          <div>
            Parts {fmtAed(o.partsCost)} + labour {fmtAed(o.labourCost)} = <strong>{fmtAed(o.partsCost + o.labourCost)}</strong>
          </div>
          <div>Quality check: {o.qualityCheck ? "completed" : "not recorded"}</div>
          <div>Completion notes: {o.completionNotes}</div>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
