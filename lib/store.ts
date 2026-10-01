import { addDays, fmtDate } from "./format";
import {
  OPERATOR,
  docState,
  docVehicleId,
  pushActivity,
  recomputeZones,
  resolveRecovered,
  syncAlerts,
  tickRules,
  today,
  updateAlert,
} from "./rules";
import { BUS_ID, OVERSPEED_ID, OVERSPEED_TICKS, RESTORE_ID, TICK_MS, simulate } from "./sim";
import { NO_FILTERS } from "./types";
import type { Filters, Speed, State, WorkOrder } from "./types";

export type WorkOrderInput = Pick<
  WorkOrder,
  "vehicleId" | "reason" | "issueAlertId" | "type" | "priority" | "technician" | "plannedDate" | "description"
>;

export type Action =
  | { type: "TICK" }
  | { type: "SET_PAUSED"; paused: boolean }
  | { type: "SET_SPEED"; speed: Speed }
  | { type: "SELECT_VEHICLE"; id: string | null }
  | { type: "SET_FILTERS"; filters: Partial<Filters> }
  | { type: "CLEAR_FILTERS" }
  | { type: "SET_UI"; ui: Partial<State["ui"]> }
  | { type: "ACK_ALERT"; id: string; note: string }
  | { type: "RESOLVE_ALERT"; id: string; note: string }
  | { type: "RUN_SCENARIO"; scenario: "busDeparture" | "overspeed" | "restoreDevice" }
  | { type: "SET_ZONE_RADIUS"; id: string; radiusM: number }
  | { type: "CREATE_WORK_ORDER"; input: WorkOrderInput }
  | { type: "START_WORK"; id: string }
  | { type: "UPDATE_WORK"; id: string; parts: string; labour: string; notes: string }
  | { type: "COMPLETE_WORK"; id: string; parts: string; labour: string; completionNotes: string; qualityCheck: boolean }
  | { type: "RENEW_DOCUMENT"; id: string; expiryDate: string; note: string }
  | { type: "SET_SERVICE_INTERVAL"; km: number; days: number };

/** Actions that only change the view; everything else is a business action saved immediately. */
export const VIEW_ACTIONS = new Set<Action["type"]>(["TICK", "SELECT_VEHICLE", "SET_FILTERS", "CLEAR_FILTERS", "SET_UI"]);

// ---------- validation (shared by forms and the reducer) ----------

/** Non-negative AED amount; zero allowed. */
export function parseAmount(raw: string): number | null {
  const t = raw.trim();
  const n = Number(t);
  return t !== "" && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export function costError(parts: string, labour: string): string | null {
  if (parseAmount(parts) === null) return "Parts cost must be a number of 0 or more (AED).";
  if (parseAmount(labour) === null) return "Labour cost must be a number of 0 or more (AED).";
  return null;
}

export const blockingOrder = (s: State, vehicleId: string, reason: string, issueAlertId: string | null) =>
  s.workOrders.find(
    (w) => w.vehicleId === vehicleId && w.status !== "Completed" && (w.reason === reason || (!!issueAlertId && w.issueAlertId === issueAlertId)),
  );

export function workOrderError(s: State, i: WorkOrderInput): string | null {
  if (!s.vehicles[i.vehicleId]) return "Choose a vehicle.";
  if (!i.reason.trim()) return "Enter the reason for the work.";
  if (!i.technician) return "Choose a technician.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.plannedDate)) return "Choose a planned date.";
  if (!i.description.trim()) return "Enter a description of the work.";
  const dup = blockingOrder(s, i.vehicleId, i.reason.trim(), i.issueAlertId);
  if (dup) return `${dup.id} is already ${dup.status.toLowerCase()} for this issue on ${i.vehicleId}. Complete it before raising another.`;
  return null;
}

export function completionError(w: WorkOrder | undefined, parts: string, labour: string, notes: string, qc: boolean): string | null {
  if (!w || w.status !== "In progress") return "Start the work before completing it.";
  if (!notes.trim()) return "Enter completion notes.";
  if (!qc) return "Confirm the quality check before releasing the vehicle.";
  return costError(parts, labour);
}

export function renewalError(s: State, expiryDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) return "Choose the new expiry date.";
  if (expiryDate <= today(s)) return `The new expiry date must be after the demo date (${fmtDate(today(s))}).`;
  return null;
}

export const nextWorkOrderId = (s: State) => `WO-${Math.max(1000, ...s.workOrders.map((w) => Number(w.id.slice(3)))) + 1}`;

// ---------- reducer ----------

export function reducer(s: State, a: Action): State {
  const now = s.clock.now;
  switch (a.type) {
    case "TICK": {
      if (s.clock.paused) return s;
      let n = simulate(s, TICK_MS * s.clock.speed);
      if (n.scenarios.overspeed === "running") {
        const ticks = n.overspeedTicks + 1;
        n = { ...n, overspeedTicks: ticks, scenarios: { ...n.scenarios, overspeed: ticks >= OVERSPEED_TICKS ? "done" : "running" } };
      }
      if (n.scenarios.busDeparture === "running" && n.vehicles[BUS_ID].routeId !== "EXIT-A")
        n = { ...n, scenarios: { ...n.scenarios, busDeparture: "done" } };
      return syncAlerts(tickRules(n));
    }
    case "SET_PAUSED":
      return { ...s, clock: { ...s.clock, paused: a.paused } };
    case "SET_SPEED":
      return { ...s, clock: { ...s.clock, speed: a.speed } };
    case "SELECT_VEHICLE":
      return { ...s, ui: { ...s.ui, selectedVehicleId: a.id } };
    case "SET_FILTERS":
      return { ...s, ui: { ...s.ui, filters: { ...s.ui.filters, ...a.filters } } };
    case "CLEAR_FILTERS":
      return { ...s, ui: { ...s.ui, filters: NO_FILTERS } };
    case "SET_UI":
      return { ...s, ui: { ...s.ui, ...a.ui } };

    case "ACK_ALERT": {
      const al = s.alerts.find((x) => x.id === a.id);
      if (!al || al.workflow !== "New") return s;
      const note = a.note.trim();
      const n = updateAlert(s, al.id, { workflow: "Acknowledged", notes: note ? [...al.notes, note] : al.notes });
      return pushActivity(n, { vehicleId: al.vehicleId, at: now, action: "Alert acknowledged", relatedId: al.id, actor: OPERATOR, summary: `${al.type} ${al.id} acknowledged${note ? ` — ${note}` : ""}` });
    }
    case "RESOLVE_ALERT": {
      const al = s.alerts.find((x) => x.id === a.id);
      // Ongoing conditions can only be resolved after recovery.
      if (!al || al.workflow === "Resolved" || al.conditionActive) return s;
      const note = a.note.trim();
      const n = updateAlert(s, al.id, { workflow: "Resolved", notes: note ? [...al.notes, note] : al.notes });
      return pushActivity(n, { vehicleId: al.vehicleId, at: now, action: "Alert resolved", relatedId: al.id, actor: OPERATOR, summary: `${al.type} ${al.id} resolved${note ? ` — ${note}` : ""}` });
    }

    case "RUN_SCENARIO": {
      if (a.scenario === "busDeparture") {
        const v = s.vehicles[BUS_ID];
        const trip = s.trips.find((t) => t.vehicleId === BUS_ID && t.status === "Scheduled");
        if (s.scenarios.busDeparture !== "ready" || !v.connected || v.moving) return s;
        const n: State = {
          ...s,
          vehicles: { ...s.vehicles, [BUS_ID]: { ...v, moving: true, routeId: "EXIT-A", distM: 0, ignition: true } },
          trips: s.trips.map((t) => (t === trip ? { ...t, status: "Active", actualStart: now } : t)),
          scenarios: { ...s.scenarios, busDeparture: "running" },
        };
        return pushActivity(n, { vehicleId: BUS_ID, at: now, action: "Trip started", relatedId: trip?.id ?? null, actor: OPERATOR, summary: `${trip?.id ?? "Trip"} started — departing Demo Depot A` });
      }
      if (a.scenario === "overspeed") {
        const v = s.vehicles[OVERSPEED_ID];
        if (s.scenarios.overspeed !== "ready" || !v.connected || !v.moving) return s;
        return { ...s, scenarios: { ...s.scenarios, overspeed: "running" }, overspeedTicks: 0 };
      }
      const v = s.vehicles[RESTORE_ID];
      if (v.connected) return s;
      let n: State = { ...s, vehicles: { ...s.vehicles, [RESTORE_ID]: { ...v, connected: true, lastSeen: now, speedKph: 0 } } };
      n = recomputeZones(n, [RESTORE_ID]);
      n = pushActivity(n, { vehicleId: RESTORE_ID, at: now, action: "Device reconnected", relatedId: null, actor: OPERATOR, summary: "Telemetry link restored; status recalculated" });
      return syncAlerts(n);
    }

    case "SET_ZONE_RADIUS": {
      const radiusM = Math.min(1500, Math.max(200, Math.round(a.radiusM)));
      return recomputeZones({ ...s, zones: s.zones.map((z) => (z.id === a.id ? { ...z, radiusM } : z)) });
    }

    case "CREATE_WORK_ORDER": {
      if (workOrderError(s, a.input)) return s;
      const id = nextWorkOrderId(s);
      const input = { ...a.input, reason: a.input.reason.trim(), description: a.input.description.trim() };
      const wo: WorkOrder = {
        ...input, id, status: "Open", createdAt: now, startedAt: null, completedAt: null,
        partsCost: 0, labourCost: 0, qualityCheck: false, notes: "", completionNotes: "",
      };
      const v = s.vehicles[input.vehicleId];
      let n: State = {
        ...s,
        workOrders: [...s.workOrders, wo],
        // A vehicle booked into the workshop stops where it is; the hold itself is derived from the open order.
        vehicles: v.moving ? { ...s.vehicles, [v.id]: { ...v, moving: false, ignition: false, speedKph: 0 } } : s.vehicles,
        ui: { ...s.ui, createWorkOrderFor: null },
      };
      if (wo.issueAlertId) {
        const al = n.alerts.find((x) => x.id === wo.issueAlertId);
        if (al) n = updateAlert(n, al.id, { notes: [...al.notes, `Linked to ${id}`] });
      }
      n = pushActivity(n, { vehicleId: v.id, at: now, action: "Work order created", relatedId: id, actor: OPERATOR, summary: `${id} (${wo.type.toLowerCase()}) created — maintenance hold applied` });
      return syncAlerts(n);
    }
    case "START_WORK": {
      const w = s.workOrders.find((x) => x.id === a.id);
      if (!w || w.status !== "Open") return s;
      const n = { ...s, workOrders: s.workOrders.map((x) => (x === w ? { ...x, status: "In progress" as const, startedAt: now } : x)) };
      return pushActivity(n, { vehicleId: w.vehicleId, at: now, action: "Work started", relatedId: w.id, actor: OPERATOR, summary: `${w.id} started by ${w.technician}` });
    }
    case "UPDATE_WORK": {
      const w = s.workOrders.find((x) => x.id === a.id);
      if (!w || w.status !== "In progress" || costError(a.parts, a.labour)) return s;
      const patch = { partsCost: parseAmount(a.parts)!, labourCost: parseAmount(a.labour)!, notes: a.notes };
      return { ...s, workOrders: s.workOrders.map((x) => (x === w ? { ...x, ...patch } : x)) };
    }
    case "COMPLETE_WORK": {
      const w = s.workOrders.find((x) => x.id === a.id);
      if (!w || completionError(w, a.parts, a.labour, a.completionNotes, a.qualityCheck)) return s;
      const done: WorkOrder = {
        ...w, status: "Completed", completedAt: now, qualityCheck: true, completionNotes: a.completionNotes.trim(),
        partsCost: parseAmount(a.parts)!, labourCost: parseAmount(a.labour)!,
      };
      let n: State = { ...s, workOrders: s.workOrders.map((x) => (x === w ? done : x)) };
      const v = n.vehicles[w.vehicleId];
      if (w.type === "Preventive") {
        const nextServiceKm = Math.round((v.odometerKm + n.serviceInterval.km) / 100) * 100;
        n = { ...n, vehicles: { ...n.vehicles, [v.id]: { ...v, nextServiceKm, nextServiceDate: addDays(today(n), n.serviceInterval.days) } } };
      }
      n = pushActivity(n, { vehicleId: v.id, at: now, action: "Quality check completed", relatedId: w.id, actor: OPERATOR, summary: `${w.id} quality check passed` });
      n = pushActivity(n, { vehicleId: v.id, at: now, action: "Work completed", relatedId: w.id, actor: OPERATOR, summary: `${w.id} completed — ${done.completionNotes}` });
      const stillHeld = n.workOrders.some((x) => x.vehicleId === v.id && x.status !== "Completed");
      if (!stillHeld) n = pushActivity(n, { vehicleId: v.id, at: now, action: "Released", relatedId: w.id, actor: OPERATOR, summary: "Maintenance hold removed; vehicle released" });
      n = syncAlerts(n);
      return resolveRecovered(
        n,
        (al) => al.id === w.issueAlertId || (w.type === "Preventive" && al.type === "Service due" && al.vehicleId === v.id),
        `Resolved by ${w.id}`,
      );
    }

    case "RENEW_DOCUMENT": {
      const d = s.docs.find((x) => x.id === a.id);
      if (!d || renewalError(s, a.expiryDate)) return s;
      const note = a.note.trim();
      let n: State = { ...s, docs: s.docs.map((x) => (x === d ? { ...x, expiryDate: a.expiryDate } : x)) };
      const status = docState({ ...d, expiryDate: a.expiryDate }, today(n)).status;
      n = pushActivity(n, {
        vehicleId: docVehicleId(n, d), at: now, action: "Document renewal recorded", relatedId: d.id, actor: OPERATOR,
        summary: `${d.type} ${d.reference}: new expiry ${fmtDate(a.expiryDate)} (${status})${note ? ` — ${note}` : ""}`,
      });
      n = syncAlerts(n);
      return resolveRecovered(n, (al) => al.type === "Document expiry" && al.relatedId === d.id, "Demo renewal recorded");
    }

    case "SET_SERVICE_INTERVAL": {
      if (!(a.km >= 1000 && a.days >= 30)) return s;
      return { ...s, serviceInterval: { km: Math.round(a.km), days: Math.round(a.days) } };
    }
  }
}
