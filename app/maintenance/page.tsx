"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useDemo } from "@/components/DemoProvider";
import { ErrorText, Field, Modal, StatusBadge, Tag, btnPrimary, btnSecondary, card, inputCls } from "@/components/ui";
import { fmtAed, fmtDate, fmtDateTime, fmtKm } from "@/lib/format";
import { today } from "@/lib/rules";
import { completionError, costError, nextWorkOrderId, parseAmount, workOrderError, type WorkOrderInput } from "@/lib/store";
import type { WorkOrder } from "@/lib/types";

const TECHNICIANS = ["Technician T-01", "Technician T-02", "Technician T-03", "Technician T-04"];

export default function MaintenancePage() {
  const { s, dispatch, views } = useDemo();
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const due = useMemo(() => [...views.values()].filter((w) => w.due), [views]);
  const orders = [...s.workOrders].sort((a, b) => b.createdAt - a.createdAt);
  const openOrderFor = (vehicleId: string) => s.workOrders.find((w) => w.vehicleId === vehicleId && w.status !== "Completed");
  const viewVehicle = (id: string) => {
    dispatch({ type: "SELECT_VEHICLE", id });
    router.push("/");
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-4">
      <div>
        <h1 className="text-xl font-semibold">Maintenance</h1>
        <p className="text-sm text-slate-600">
          Simplified demo workflow: service due → work order → start work → quality check → release. No inventory, purchasing or approval
          chain.
        </p>
      </div>

      <ServiceInterval />

      <section className={card}>
        <h2 className="border-b border-slate-200 px-4 py-2.5 font-semibold">Service due ({due.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {["Vehicle", "Status", "Odometer", "Next service", "Due reason", "Action"].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular divide-y divide-slate-100">
              {due.map((w) => {
                const open = openOrderFor(w.v.id);
                return (
                  <tr key={w.v.id}>
                    <td className="px-3 py-2">
                      <button type="button" className="font-medium text-navy hover:underline" onClick={() => viewVehicle(w.v.id)}>
                        {w.v.id}
                      </button>
                      <div className="text-xs text-slate-500">{w.v.category}</div>
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={w.status} />
                    </td>
                    <td className="px-3 py-2">{fmtKm(w.v.odometerKm)}</td>
                    <td className="px-3 py-2">
                      {fmtKm(w.v.nextServiceKm)} · {fmtDate(w.v.nextServiceDate)}
                    </td>
                    <td className="px-3 py-2">{w.due}</td>
                    <td className="px-3 py-2">
                      {open ? (
                        <button type="button" className={btnSecondary} onClick={() => setOpenId(open.id)}>
                          {open.id} ({open.status})
                        </button>
                      ) : (
                        <button type="button" className={btnPrimary} onClick={() => dispatch({ type: "SET_UI", ui: { createWorkOrderFor: w.v.id } })}>
                          Create work order
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {due.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    No vehicles are due for service.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
          <h2 className="font-semibold">Work orders ({orders.length})</h2>
          <button type="button" className={btnSecondary} onClick={() => dispatch({ type: "SET_UI", ui: { createWorkOrderFor: "" } })}>
            New corrective order
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {["Work order", "Vehicle", "Type", "Priority", "Technician", "Status", "Planned", "Total cost", ""].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular divide-y divide-slate-100">
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-3 py-2 font-medium">{o.id}</td>
                  <td className="px-3 py-2">{o.vehicleId}</td>
                  <td className="px-3 py-2">{o.type}</td>
                  <td className="px-3 py-2">{o.priority}</td>
                  <td className="px-3 py-2">{o.technician}</td>
                  <td className="px-3 py-2">
                    <Tag tone={o.status === "Completed" ? "emerald" : o.status === "In progress" ? "violet" : "slate"}>{o.status}</Tag>
                  </td>
                  <td className="px-3 py-2">{fmtDate(o.plannedDate)}</td>
                  <td className="px-3 py-2">{fmtAed(o.partsCost + o.labourCost)}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" className={btnSecondary} onClick={() => setOpenId(o.id)}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={s.ui.createWorkOrderFor !== null}
        onClose={() => dispatch({ type: "SET_UI", ui: { createWorkOrderFor: null } })}
        title="Create work order"
      >
        <CreateForm
          vehicleId={s.ui.createWorkOrderFor ?? ""}
          onCreated={(id) => {
            dispatch({ type: "SET_UI", ui: { createWorkOrderFor: null } });
            setOpenId(id);
          }}
        />
      </Modal>
      <Modal open={openId !== null} onClose={() => setOpenId(null)} title={`Work order ${openId ?? ""}`}>
        {openId && <Detail order={s.workOrders.find((o) => o.id === openId)!} onViewVehicle={viewVehicle} />}
      </Modal>
    </div>
  );
}

function ServiceInterval() {
  const { s, dispatch } = useDemo();
  const [km, setKm] = useState(String(s.serviceInterval.km));
  const [days, setDays] = useState(String(s.serviceInterval.days));
  const valid = Number(km) >= 1000 && Number(days) >= 30;
  return (
    <form
      className={`${card} flex flex-wrap items-end gap-3 px-4 py-3`}
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) dispatch({ type: "SET_SERVICE_INTERVAL", km: Number(km), days: Number(days) });
      }}
    >
      <div className="mr-auto text-sm">
        <div className="font-semibold">Demo service interval</div>
        <div className="text-slate-600">
          Editable demo setting used to advance the next service after preventive work — not a manufacturer rule. Current:{" "}
          {s.serviceInterval.km.toLocaleString("en-US")} km / {s.serviceInterval.days} days.
        </div>
      </div>
      <Field label="Kilometres">
        <input className={`${inputCls} w-28`} inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} />
      </Field>
      <Field label="Days">
        <input className={`${inputCls} w-20`} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
      </Field>
      <button type="submit" className={btnSecondary} disabled={!valid}>
        Save interval
      </button>
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

function Detail({ order: o, onViewVehicle }: { order: WorkOrder; onViewVehicle: (id: string) => void }) {
  const { dispatch } = useDemo();
  const [parts, setParts] = useState(String(o.partsCost));
  const [labour, setLabour] = useState(String(o.labourCost));
  const [notes, setNotes] = useState(o.notes);
  const [completionNotes, setCompletionNotes] = useState("");
  const [qc, setQc] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const total = (parseAmount(parts) ?? 0) + (parseAmount(labour) ?? 0);

  const rows: [string, string][] = [
    ["Vehicle", o.vehicleId],
    ["Type / priority", `${o.type} · ${o.priority}`],
    ["Reason", o.reason],
    ["Description", o.description],
    ["Technician", o.technician],
    ["Planned", fmtDate(o.plannedDate)],
    ["Created", fmtDateTime(o.createdAt)],
    ["Started", o.startedAt ? fmtDateTime(o.startedAt) : "—"],
    ["Completed", o.completedAt ? fmtDateTime(o.completedAt) : "—"],
  ];

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between">
        <Tag tone={o.status === "Completed" ? "emerald" : o.status === "In progress" ? "violet" : "slate"}>{o.status}</Tag>
        <button type="button" className="text-sm text-navy hover:underline" onClick={() => onViewVehicle(o.vehicleId)}>
          View vehicle →
        </button>
      </div>
      <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate-500">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      {o.status === "Open" && (
        <button type="button" className={btnPrimary} onClick={() => dispatch({ type: "START_WORK", id: o.id })}>
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
          <div className="tabular flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
            <span>Total (parts + labour)</span>
            <span className="font-semibold">{costError(parts, labour) ? "—" : fmtAed(total)}</span>
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
            <legend className="px-1 font-semibold">Complete and release</legend>
            <Field label="Completion notes (required)">
              <textarea className={inputCls} rows={2} value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)} />
            </Field>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={qc} onChange={(e) => setQc(e.target.checked)} />
              Quality check completed
            </label>
            <button
              type="button"
              className={btnPrimary}
              onClick={() => {
                const err = completionError(o, parts, labour, completionNotes, qc);
                setError(err);
                if (!err) dispatch({ type: "COMPLETE_WORK", id: o.id, parts, labour, completionNotes, qualityCheck: qc });
              }}
            >
              Complete and release
            </button>
          </fieldset>
        </>
      )}

      {o.status === "Completed" && (
        <div className="tabular rounded-md bg-emerald-50 p-3 ring-1 ring-emerald-200">
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
