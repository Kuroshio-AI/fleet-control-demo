import { distM } from "./geo";
import { daysBetween, dubaiDate, fmtDate, fmtHm, fmtKm } from "./format";
import type { Activity, Alert, AlertType, Doc, DocStatus, State, Status, Vehicle, Zone } from "./types";

// Demo configuration, not client policy.
export const SPEED_LIMIT_KPH = 80;
export const OFFLINE_AFTER_MS = 120_000;
export const MOVING_ABOVE_KPH = 2;
export const EXPIRING_WITHIN_DAYS = 30;
export const SYSTEM = "Demo rules";
export const OPERATOR = "Operator (demo)";

export const today = (s: State) => dubaiDate(s.clock.now);

/** Maintenance hold is derived from open work orders, so it can never drift from them. */
export const heldVehicleIds = (s: State) =>
  new Set(s.workOrders.filter((w) => w.status !== "Completed").map((w) => w.vehicleId));

export const isStale = (v: Vehicle, now: number) => now - v.lastSeen > OFFLINE_AFTER_MS;

/** SIM-03 precedence: hold → offline → moving → idle → stopped. */
export function displayStatus(v: Vehicle, now: number, held: boolean): Status {
  if (held) return "Maintenance";
  if (isStale(v, now)) return "Offline";
  if (v.speedKph > MOVING_ABOVE_KPH) return "Moving";
  return v.ignition ? "Idle" : "Stopped";
}

/** COMP-02: calendar days in Asia/Dubai; today is still Expiring, not Expired. */
export function docState(doc: Doc, date: string): { days: number; status: DocStatus } {
  const days = daysBetween(date, doc.expiryDate);
  return { days, status: days < 0 ? "Expired" : days <= EXPIRING_WITHIN_DAYS ? "Expiring" : "Valid" };
}

export function serviceDue(v: Vehicle, date: string): string | null {
  if (v.odometerKm >= v.nextServiceKm) return `Mileage: ${fmtKm(v.odometerKm)} reached the ${fmtKm(v.nextServiceKm)} service point`;
  if (date >= v.nextServiceDate) return `Date: service was due ${fmtDate(v.nextServiceDate)}`;
  return null;
}

/** Share of the service interval used, by distance or time, whichever is further along (1 or more = due). */
export function serviceProgress(v: Vehicle, interval: { km: number; days: number }, date: string) {
  const kmLeft = Math.round(v.nextServiceKm - v.odometerKm);
  const daysLeft = daysBetween(date, v.nextServiceDate);
  return { kmLeft, daysLeft, used: Math.max(1 - kmLeft / interval.km, 1 - daysLeft / interval.days) };
}

export const zonesAt = (zones: Zone[], lat: number, lng: number) =>
  zones.filter((z) => distM([lat, lng], z.center) <= z.radiusM).map((z) => z.id);

/** Silent membership refresh (radius edits, reconnects): never emits entry/exit events. */
export function recomputeZones(s: State, ids: string[] = s.vehicleOrder): State {
  const vehicles = { ...s.vehicles };
  for (const id of ids) vehicles[id] = { ...vehicles[id], zones: zonesAt(s.zones, vehicles[id].lat, vehicles[id].lng) };
  return { ...s, vehicles };
}

export const docVehicleId = (s: State, d: Doc) => (d.ownerType === "Vehicle" ? d.ownerId : s.drivers[d.ownerId].vehicleId);

// ---------- alert + activity helpers ----------

type NewAlert = Pick<Alert, "vehicleId" | "type" | "severity" | "at" | "description" | "conditionActive" | "relatedId" | "lat" | "lng">;

export function pushAlert(s: State, a: NewAlert): State {
  const seq = s.seq + 1;
  const alert: Alert = { ...a, id: `ALT-${String(seq).padStart(4, "0")}`, driverId: s.vehicles[a.vehicleId].driverId, workflow: "New", notes: [] };
  return { ...s, seq, alerts: [...s.alerts, alert] };
}

export function pushActivity(s: State, e: Omit<Activity, "id">): State {
  const seq = s.seq + 1;
  return { ...s, seq, activity: [...s.activity, { ...e, id: `ACT-${String(seq).padStart(5, "0")}` }] };
}

export const updateAlert = (s: State, id: string, patch: Partial<Alert>): State => ({
  ...s,
  alerts: s.alerts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
});

/** Resolve alerts whose condition has recovered (used after work completion and renewals). */
export function resolveRecovered(s: State, match: (a: Alert) => boolean, note: string): State {
  return {
    ...s,
    alerts: s.alerts.map((a) =>
      match(a) && !a.conditionActive && a.workflow !== "Resolved" ? { ...a, workflow: "Resolved", notes: [...a.notes, note] } : a,
    ),
  };
}

const key = (type: AlertType, vehicleId: string, relatedId: string | null) => `${type}|${vehicleId}|${relatedId ?? ""}`;

/**
 * Condition alerts (device offline, service due, document expiry) follow their records:
 * one alert per active episode, condition cleared on recovery. Workflow is left to the operator.
 */
export function syncAlerts(s: State): State {
  const now = s.clock.now;
  const date = today(s);
  const active = new Map<string, number>();
  s.alerts.forEach((a, i) => a.conditionActive && active.set(key(a.type, a.vehicleId, a.relatedId), i));
  let alerts = s.alerts;
  const patch = (i: number, p: Partial<Alert>) => {
    if (alerts === s.alerts) alerts = [...alerts];
    alerts[i] = { ...alerts[i], ...p };
  };
  const created: NewAlert[] = [];
  const track = (a: NewAlert, cond: boolean) => {
    const i = active.get(key(a.type, a.vehicleId, a.relatedId));
    if (cond && i === undefined) created.push(a);
    else if (!cond && i !== undefined) patch(i, { conditionActive: false });
    else if (cond && i !== undefined && (alerts[i].severity !== a.severity || alerts[i].description !== a.description))
      patch(i, { severity: a.severity, description: a.description });
  };

  for (const id of s.vehicleOrder) {
    const v = s.vehicles[id];
    const stale = isStale(v, now);
    track(
      {
        vehicleId: id, type: "Device offline", severity: "Warning", at: v.lastSeen + OFFLINE_AFTER_MS,
        description: `No telemetry since ${fmtHm(v.lastSeen)} (demo clock); showing last known position.`,
        conditionActive: true, relatedId: null, lat: v.lat, lng: v.lng,
      },
      stale,
    );
    const due = serviceDue(v, date);
    track(
      {
        vehicleId: id, type: "Service due", severity: "Warning", at: now, description: due ?? "",
        conditionActive: true, relatedId: null, lat: v.lat, lng: v.lng,
      },
      due !== null,
    );
  }
  for (const d of s.docs) {
    const { status, days } = docState(d, date);
    const owner = d.ownerType === "Driver" ? ` (${s.drivers[d.ownerId].label})` : "";
    track(
      {
        vehicleId: docVehicleId(s, d), type: "Document expiry", severity: status === "Expired" ? "Critical" : "Warning", at: now,
        description:
          status === "Expired"
            ? `${d.type} ${d.reference}${owner} expired ${fmtDate(d.expiryDate)}.`
            : `${d.type} ${d.reference}${owner} expires ${days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`} (${fmtDate(d.expiryDate)}).`,
        conditionActive: true, relatedId: d.id, lat: null, lng: null,
      },
      status !== "Valid",
    );
  }

  let out: State = alerts === s.alerts ? s : { ...s, alerts };
  for (const a of created) {
    out = pushAlert(out, a);
    if (a.type !== "Document expiry")
      out = pushActivity(out, { vehicleId: a.vehicleId, at: a.at, action: a.type, relatedId: out.alerts[out.alerts.length - 1].id, actor: SYSTEM, summary: a.description });
  }
  return out;
}

/** Event rules on fresh samples: geofence transitions and two-sample overspeed. */
export function tickRules(s: State): State {
  const now = s.clock.now;
  let out = s;
  const vehicles = { ...s.vehicles };
  for (const id of s.vehicleOrder) {
    const v = vehicles[id];
    if (v.lastSeen !== now) continue;
    const inZones = zonesAt(s.zones, v.lat, v.lng);
    for (const z of s.zones) {
      const was = v.zones.includes(z.id);
      const is = inZones.includes(z.id);
      if (was === is) continue;
      const verb = is ? "Entered" : "Left";
      out = pushAlert(out, {
        vehicleId: id, type: is ? "Geofence entry" : "Geofence exit", severity: is ? "Info" : "Warning", at: now,
        description: `${verb} ${z.name} at ${v.speedKph} km/h.`, conditionActive: false, relatedId: z.id, lat: v.lat, lng: v.lng,
      });
      out = pushActivity(out, { vehicleId: id, at: now, action: is ? "Geofence entry" : "Geofence exit", relatedId: z.id, actor: SYSTEM, summary: `${verb} ${z.name}` });
    }
    const over = v.speedKph > SPEED_LIMIT_KPH;
    const overCount = over ? v.overCount + 1 : 0;
    const open = out.alerts.findIndex((a) => a.type === "Overspeed" && a.vehicleId === id && a.conditionActive);
    if (overCount >= 2 && open < 0) {
      const description = `${v.speedKph} km/h on two consecutive samples; demo fleet threshold ${SPEED_LIMIT_KPH} km/h (illustrative, not a legal limit).`;
      out = pushAlert(out, { vehicleId: id, type: "Overspeed", severity: "Critical", at: now, description, conditionActive: true, relatedId: null, lat: v.lat, lng: v.lng });
      out = pushActivity(out, { vehicleId: id, at: now, action: "Overspeed", relatedId: out.alerts[out.alerts.length - 1].id, actor: SYSTEM, summary: description });
    } else if (!over && open >= 0) {
      out = updateAlert(out, out.alerts[open].id, { conditionActive: false });
    }
    vehicles[id] = { ...v, zones: inZones, overCount };
  }
  return { ...out, vehicles };
}

// ---------- selectors ----------

export type DocRow = { doc: Doc; days: number; status: DocStatus };

export type VehicleView = {
  v: Vehicle;
  status: Status;
  held: boolean;
  stale: boolean;
  due: string | null;
  blockers: string[]; // empty = available (SIM-04)
  docs: DocRow[]; // vehicle documents plus the assigned driver's licence
  expired: number;
  expiring: number;
  driverLabel: string;
  siteName: string;
};

export function buildViews(s: State): Map<string, VehicleView> {
  const now = s.clock.now;
  const date = today(s);
  const held = heldVehicleIds(s);
  const onTrip = new Set(s.trips.filter((t) => t.status === "Active").map((t) => t.vehicleId));
  const byOwner = new Map<string, DocRow[]>();
  for (const doc of s.docs) {
    const row = { doc, ...docState(doc, date) };
    byOwner.set(doc.ownerId, [...(byOwner.get(doc.ownerId) ?? []), row]);
  }
  const views = new Map<string, VehicleView>();
  for (const id of s.vehicleOrder) {
    const v = s.vehicles[id];
    const docs = [...(byOwner.get(id) ?? []), ...(byOwner.get(v.driverId) ?? [])];
    const isHeld = held.has(id);
    const stale = isStale(v, now);
    const blockers: string[] = [];
    if (onTrip.has(id)) blockers.push("On an active trip");
    if (isHeld) blockers.push("Maintenance hold");
    if (!v.connected || stale) blockers.push("Telemetry not current");
    for (const r of docs) if (r.status === "Expired") blockers.push(`${r.doc.type} expired`);
    views.set(id, {
      v, held: isHeld, stale, blockers, docs,
      status: displayStatus(v, now, isHeld),
      due: serviceDue(v, date),
      expired: docs.filter((r) => r.status === "Expired").length,
      expiring: docs.filter((r) => r.status === "Expiring").length,
      driverLabel: s.drivers[v.driverId].label,
      siteName: s.zones.find((z) => z.id === v.siteId)?.name ?? v.siteId,
    });
  }
  return views;
}

export const isOpen = (a: Alert) => a.workflow !== "Resolved";
