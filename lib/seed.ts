import { APPROACH_A_FROM, EXIT_A_JOINS, ROUTES, ZONES, type LatLng } from "./routes";
import { PATHS, makePath, offsetM, pointAt } from "./geo";
import { addDays, dubaiDate } from "./format";
import { BUS_ID, SERVICE_ID, cruiseKph, moveVehicle, toPoint } from "./sim";
import { SYSTEM, pushActivity, recomputeZones, syncAlerts } from "./rules";
import { NO_FILTERS } from "./types";
import type { Category, Doc, DocType, Driver, Point, State, Trip, Vehicle, WorkOrder } from "./types";

// All records below are synthetic demo fixtures, not client data.
export const SCHEMA_VERSION = 1;
const SEED = 20261001;
const MIN = 60_000;
const DAY = 86_400_000;

export function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FLEET: [string, Category, number][] = [
  ["HV", "Heavy vehicle", 28],
  ["LB", "Large bus", 11],
  ["SB", "Small bus", 6],
  ["SUV", "SUV", 3],
  ["PC", "Passenger car", 2],
];

// Everything not listed here is Moving (30). lastSeenMin = minutes after 08:00 when the device went quiet.
type Parked = { status: "Idle" | "Stopped" | "Offline" | "Maintenance"; site: string; lastSeenMin?: number };
const PARKED: Record<string, Parked> = {
  "DEMO-HV-022": { status: "Maintenance", site: "ZONE-A" },
  "DEMO-SB-005": { status: "Maintenance", site: "ZONE-A", lastSeenMin: 50 }, // in the workshop with a device-offline badge
  "DEMO-HV-025": { status: "Offline", site: "ZONE-C", lastSeenMin: 22 },
  "DEMO-LB-010": { status: "Offline", site: "ZONE-B", lastSeenMin: 38 },
  "DEMO-SUV-002": { status: "Offline", site: "ZONE-A", lastSeenMin: 31 },
  "DEMO-LB-003": { status: "Idle", site: "ZONE-A" },
  "DEMO-LB-007": { status: "Idle", site: "ZONE-B" },
  "DEMO-SB-002": { status: "Idle", site: "ZONE-B" },
  "DEMO-HV-004": { status: "Idle", site: "ZONE-C" },
  "DEMO-HV-012": { status: "Idle", site: "ZONE-C" },
  "DEMO-PC-001": { status: "Idle", site: "ZONE-A" },
  "DEMO-SUV-003": { status: "Idle", site: "ZONE-A" },
  "DEMO-HV-017": { status: "Stopped", site: "ZONE-A" },
  "DEMO-HV-009": { status: "Stopped", site: "ZONE-A" },
  "DEMO-HV-020": { status: "Stopped", site: "ZONE-A" },
  "DEMO-HV-027": { status: "Stopped", site: "ZONE-C" },
  "DEMO-LB-011": { status: "Stopped", site: "ZONE-B" },
  "DEMO-SB-006": { status: "Stopped", site: "ZONE-B" },
  "DEMO-PC-002": { status: "Stopped", site: "ZONE-A" },
  "DEMO-SUV-001": { status: "Stopped", site: "ZONE-A" },
};

// Five service-due vehicles, all stationary.
const DUE: Record<string, "km" | "date"> = {
  "DEMO-HV-017": "km",
  "DEMO-HV-009": "date",
  "DEMO-HV-027": "km",
  "DEMO-LB-007": "date",
  "DEMO-SB-002": "km",
};

// Days from the demo date: 8 Expiring (incl. today and day 30) and 3 Expired (incl. a driver licence).
const DOC_OFFSETS: Record<string, number> = {
  "DEMO-HV-020:Insurance": -9,
  "DEMO-LB-011:Permit": -40,
  "DRV-45:Driver licence": -1,
  "DEMO-HV-004:Registration": 0,
  "DEMO-HV-012:Insurance": 3,
  "DEMO-LB-007:Permit": 7,
  "DEMO-SUV-001:Registration": 12,
  "DRV-09:Driver licence": 18,
  "DEMO-PC-002:Insurance": 22,
  "DEMO-HV-027:Permit": 27,
  "DEMO-SB-002:Registration": 30,
};

const ROUTE_SITE: Record<string, string> = { R1: "ZONE-A", R2: "ZONE-A", R3: "ZONE-C", R4: "ZONE-C", R5: "ZONE-B", R6: "ZONE-B" };
const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const routePts = (id: string) => ROUTES.find((r) => r.id === id)!.pts;

/** Loop points rotated so the loop ends at idx (used to build inbound journeys). */
function loopEndingAt(routeId: string, idx: number): LatLng[] {
  const open = PATHS[routeId].pts.slice(0, -1);
  return [...open.slice(idx + 1), ...open.slice(0, idx + 1)];
}

/** One-minute samples of a journey that ends at `arrive`, then parked until `until`. */
function inbound(pts: LatLng[], from: number, arrive: number, until: number, parkedAt: LatLng, ignitionFrom: number): Point[] {
  const path = makePath(pts, false);
  const kph = (t: number) => 36 + 8 * Math.sin(t / 170_000);
  const out: Point[] = [];
  let d = path.length;
  for (let t = arrive; t >= from; t -= MIN) {
    const { pos } = pointAt(path, d);
    out.unshift({ t, lat: pos[0], lng: pos[1], speedKph: t === arrive ? 0 : Math.round(kph(t)), ignition: true });
    d = Math.max(0, d - (kph(t - MIN / 2) / 3.6) * 60);
  }
  for (let t = arrive + MIN; t <= until; t += MIN)
    out.push({ t, lat: parkedAt[0], lng: parkedAt[1], speedKph: 0, ignition: t >= ignitionFrom });
  return out;
}

export function createSeed(anchor: number): State {
  const rnd = mulberry32(SEED);
  const between = (a: number, b: number) => a + rnd() * (b - a);
  const int = (a: number, b: number) => Math.floor(between(a, b + 1));
  const date = dubaiDate(anchor);
  const t0 = anchor - 60 * MIN;

  const ids: string[] = [];
  const cats: Record<string, Category> = {};
  for (const [p, c, n] of FLEET)
    for (let i = 1; i <= n; i++) {
      const id = `DEMO-${p}-${pad(i, 3)}`;
      ids.push(id);
      cats[id] = c;
    }

  // Heavy vehicles run the four haul loops, buses the two shuttles — five per loop, spread out.
  const movingHv = ids.filter((id) => !PARKED[id] && cats[id] === "Heavy vehicle");
  const movingBus = ids.filter((id) => !PARKED[id] && cats[id] !== "Heavy vehicle");
  const routeOf: Record<string, { routeId: string; slot: number }> = {};
  movingHv.forEach((id, i) => (routeOf[id] = { routeId: `R${(i % 4) + 1}`, slot: Math.floor(i / 4) }));
  movingBus.forEach((id, i) => (routeOf[id] = { routeId: `R${(i % 2) + 5}`, slot: Math.floor(i / 2) }));

  // Parking bays south of each zone centre, 45 m apart, so depot markers stay selectable.
  const bayCount: Record<string, number> = {};
  const bay = (site: string): LatLng => {
    const k = (bayCount[site] = (bayCount[site] ?? 0) + 1) - 1;
    return offsetM(ZONES.find((z) => z.id === site)!.center, ((k % 4) - 1.5) * 45, -(80 + Math.floor(k / 4) * 45));
  };

  const vehicles: Record<string, Vehicle> = {};
  const history: Record<string, Point[]> = {};
  ids.forEach((id, i) => {
    const category = cats[id];
    const plan = PARKED[id];
    const heavy = category === "Heavy vehicle";
    const bus = category === "Large bus" || category === "Small bus";
    const base: Vehicle = {
      id,
      category,
      registration: `DEMO ${String.fromCharCode(65 + (i % 26))} ${int(10000, 99999)}`,
      siteId: plan?.site ?? ROUTE_SITE[routeOf[id].routeId],
      driverId: `DRV-${pad(i + 1)}`,
      lat: 0,
      lng: 0,
      speedKph: 0,
      heading: int(0, 359),
      ignition: false,
      odometerKm: Math.round(heavy ? between(60_000, 240_000) : bus ? between(40_000, 200_000) : between(12_000, 90_000)),
      engineHours: heavy || bus ? Math.round(between(2_000, 12_000)) : null,
      fuelPercent: bus ? null : Math.round(between(35, 95)),
      lastSeen: anchor,
      connected: true,
      moving: false,
      routeId: null,
      distM: 0,
      baseKph: between(46, 60),
      phase: between(0, Math.PI * 2),
      nextServiceKm: 0,
      nextServiceDate: date,
      zones: [],
      overCount: 0,
    };

    if (!plan) {
      // Run the live movement model over the last hour in one-minute steps: history ends exactly at 09:00.
      const { routeId, slot } = routeOf[id];
      let v: Vehicle = { ...base, moving: true, routeId, ignition: true, distM: ((slot + between(0, 0.6)) / 5) * PATHS[routeId].length };
      const p = pointAt(PATHS[routeId], v.distM);
      v = { ...v, lat: p.pos[0], lng: p.pos[1], heading: Math.round(p.heading), speedKph: Math.round(cruiseKph(v, t0)), lastSeen: t0 };
      const pts = [toPoint(v, t0)];
      for (let t = t0 + MIN; t <= anchor; t += MIN) {
        v = moveVehicle(v, t, MIN, cruiseKph(v, t));
        pts.push(toPoint(v, t));
      }
      vehicles[id] = v;
      history[id] = pts;
      return;
    }

    if (id === BUS_ID) {
      // Morning shuttle run back into Depot A (arrives 08:47), driver back on board from 08:55.
      const exit = routePts("EXIT-A");
      const parked = exit[0];
      history[id] = inbound([...loopEndingAt(EXIT_A_JOINS.routeId, EXIT_A_JOINS.idx), ...[...exit].reverse()], t0, t0 + 47 * MIN, anchor, parked, t0 + 55 * MIN);
      vehicles[id] = { ...base, lat: parked[0], lng: parked[1], ignition: true, routeId: "EXIT-A", distM: 0 };
      return;
    }
    if (id === SERVICE_ID) {
      // Haul run back to Depot A (arrives 08:35), parked with the ignition off.
      const approach = routePts("APPROACH-A");
      const parked = offsetM(approach[approach.length - 1], 30, 0);
      history[id] = inbound([...loopEndingAt(APPROACH_A_FROM.routeId, APPROACH_A_FROM.idx), ...approach], t0, t0 + 35 * MIN, anchor, parked, Infinity);
      vehicles[id] = { ...base, lat: parked[0], lng: parked[1] };
      return;
    }

    const pos = bay(plan.site);
    const lastSeen = plan.lastSeenMin === undefined ? anchor : t0 + plan.lastSeenMin * MIN;
    const ignition = plan.status === "Idle";
    const pts: Point[] = [];
    for (let t = t0; t <= lastSeen; t += MIN) pts.push({ t, lat: pos[0], lng: pos[1], speedKph: 0, ignition });
    history[id] = pts;
    vehicles[id] = { ...base, lat: pos[0], lng: pos[1], ignition, lastSeen, connected: plan.lastSeenMin === undefined };
  });

  // Service plans, set against the 09:00 odometer.
  for (const id of ids) {
    const v = vehicles[id];
    const due = DUE[id];
    vehicles[id] =
      due === "km"
        ? { ...v, nextServiceKm: Math.round(v.odometerKm - int(80, 400)), nextServiceDate: addDays(date, int(25, 60)) }
        : due === "date"
          ? { ...v, nextServiceKm: Math.round(v.odometerKm + int(900, 1500)), nextServiceDate: addDays(date, -int(1, 4)) }
          : { ...v, nextServiceKm: Math.round((v.odometerKm + int(2500, 9000)) / 100) * 100, nextServiceDate: addDays(date, int(21, 150)) };
  }

  const drivers: Record<string, Driver> = {};
  const docs: Doc[] = [];
  const addDoc = (ownerType: Doc["ownerType"], ownerId: string, type: DocType, code: string) => {
    const doc: Doc = {
      id: `DOC-${pad(docs.length + 1, 3)}`,
      ownerType,
      ownerId,
      type,
      reference: `DEMO-${code}-${int(10000, 99999)}`,
      expiryDate: addDays(date, DOC_OFFSETS[`${ownerId}:${type}`] ?? int(45, 700)),
    };
    docs.push(doc);
    return doc.id;
  };
  for (const id of ids)
    for (const [type, code] of [["Registration", "REG"], ["Insurance", "INS"], ["Permit", "PRM"]] as const) addDoc("Vehicle", id, type, code);
  ids.forEach((vehicleId, i) => {
    const id = `DRV-${pad(i + 1)}`;
    drivers[id] = { id, label: `Demo Driver ${pad(i + 1)}`, vehicleId, licenceDocId: addDoc("Driver", id, "Driver licence", "LIC") };
  });

  const trips: Trip[] = [...movingHv, ...movingBus].map((id, k) => {
    const start = t0 - int(5, 40) * MIN;
    return { id: `TRP-${3001 + k}`, vehicleId: id, driverId: vehicles[id].driverId, routeId: routeOf[id].routeId, plannedStart: start - int(0, 5) * MIN, actualStart: start, actualEnd: null, status: "Active" };
  });
  const bus = vehicles[BUS_ID];
  const svc = vehicles[SERVICE_ID];
  trips.push(
    { id: "TRP-2990", vehicleId: BUS_ID, driverId: bus.driverId, routeId: "R6", plannedStart: t0 - 5 * MIN, actualStart: t0 - 2 * MIN, actualEnd: t0 + 47 * MIN, status: "Completed" },
    { id: "TRP-2991", vehicleId: SERVICE_ID, driverId: svc.driverId, routeId: "R1", plannedStart: t0 - 25 * MIN, actualStart: t0 - 20 * MIN, actualEnd: t0 + 35 * MIN, status: "Completed" },
    { id: "TRP-3100", vehicleId: BUS_ID, driverId: bus.driverId, routeId: "R6", plannedStart: anchor + 15 * MIN, actualStart: null, actualEnd: null, status: "Scheduled" },
  );

  const wo = (w: Partial<WorkOrder> & Pick<WorkOrder, "id" | "vehicleId" | "type" | "reason" | "status">): WorkOrder => ({
    issueAlertId: null, priority: "Medium", technician: "Technician T-01", plannedDate: date, description: w.reason,
    createdAt: anchor - 2 * 60 * MIN, startedAt: null, completedAt: null, partsCost: 0, labourCost: 0, qualityCheck: false,
    notes: "", completionNotes: "", ...w,
  });
  const workOrders: WorkOrder[] = [
    wo({
      id: "WO-0998", vehicleId: "DEMO-HV-013", type: "Corrective", status: "Completed", priority: "High", technician: "Technician T-02",
      reason: "Breakdown: coolant hose failure on haul run", plannedDate: addDays(date, -5),
      createdAt: anchor - 5 * DAY - 70 * MIN, startedAt: anchor - 5 * DAY + 80 * MIN, completedAt: anchor - 5 * DAY + 400 * MIN,
      partsCost: 380, labourCost: 450, qualityCheck: true, completionNotes: "Hose and clamps replaced; pressure test passed.",
    }),
    wo({
      id: "WO-0999", vehicleId: "DEMO-LB-002", type: "Preventive", status: "Completed", technician: "Technician T-04",
      reason: "Scheduled service", plannedDate: addDays(date, -12),
      createdAt: anchor - 12 * DAY - 30 * MIN, startedAt: anchor - 12 * DAY + 20 * MIN, completedAt: anchor - 12 * DAY + 260 * MIN,
      partsCost: 610, labourCost: 300, qualityCheck: true, completionNotes: "Oil, filters and brake inspection completed.",
    }),
    wo({ id: "WO-1001", vehicleId: "DEMO-HV-022", type: "Preventive", status: "In progress", technician: "Technician T-03", reason: "Scheduled service", startedAt: anchor - 50 * MIN, partsCost: 420, labourCost: 300 }),
    wo({ id: "WO-1002", vehicleId: "DEMO-SB-005", type: "Corrective", status: "In progress", priority: "High", reason: "Driver reported alternator warning light", startedAt: anchor - 75 * MIN, labourCost: 150 }),
  ];

  let s: State = {
    schemaVersion: SCHEMA_VERSION,
    clock: { anchor, now: anchor, paused: false, speed: 1 },
    vehicles,
    vehicleOrder: ids,
    drivers,
    zones: ZONES.map((z) => ({ ...z })),
    trips,
    alerts: [],
    workOrders,
    docs,
    activity: [],
    serviceInterval: { km: 10_000, days: 180 },
    scenarios: { busDeparture: "ready", overspeed: "ready" },
    overspeedTicks: 0,
    seq: 0,
    ui: { selectedVehicleId: null, filters: NO_FILTERS, basemap: "osm", createWorkOrderFor: null, complianceFocus: null },
    history,
  };

  const log = (vehicleId: string, at: number, action: string, relatedId: string | null, summary: string, actor = "Operator (demo)") =>
    (s = pushActivity(s, { vehicleId, at, action, relatedId, actor, summary }));
  for (const w of workOrders) {
    log(w.vehicleId, w.createdAt, "Work order created", w.id, `${w.id} created: ${w.reason}`);
    if (w.startedAt) log(w.vehicleId, w.startedAt, "Work started", w.id, `${w.id} started by ${w.technician}`);
    if (w.completedAt) {
      log(w.vehicleId, w.completedAt, "Quality check completed", w.id, `${w.id} quality check passed`);
      log(w.vehicleId, w.completedAt, "Released", w.id, `${w.id} completed; vehicle released to service`);
    }
  }
  log(BUS_ID, t0 + 47 * MIN, "Trip completed", "TRP-2990", "TRP-2990 morning shuttle completed at Demo Depot A", SYSTEM);
  log(SERVICE_ID, t0 + 35 * MIN, "Trip completed", "TRP-2991", "TRP-2991 haul run completed at Demo Depot A", SYSTEM);

  return syncAlerts(recomputeZones(s));
}
