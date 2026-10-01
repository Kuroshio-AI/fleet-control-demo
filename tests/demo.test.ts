import { expect, test } from "bun:test";
import { createSeed } from "../lib/seed";
import { costError, reducer, renewalError, workOrderError, type Action, type WorkOrderInput } from "../lib/store";
import { buildViews, docState, isOpen, serviceProgress } from "../lib/rules";
import { BUS_ID, OVERSPEED_ID, RESTORE_ID, SERVICE_ID } from "../lib/sim";
import { csvCell, toCsv } from "../lib/csv";
import { PATHS, distM, pointAt } from "../lib/geo";
import { demoAnchor } from "../lib/format";
import type { State } from "../lib/types";

const anchor = demoAnchor(Date.parse("2026-10-01T06:00:00Z")); // 09:00 Dubai, 1 Oct 2026
const seed = () => createSeed(anchor);
const run = (s: State, ...actions: Action[]) => actions.reduce(reducer, s);
const ticks = (s: State, n: number) => run(s, ...Array.from({ length: n }, () => ({ type: "TICK" }) as const));
const partition = (s: State) => {
  const c = { Moving: 0, Idle: 0, Stopped: 0, Offline: 0, Maintenance: 0 };
  for (const w of buildViews(s).values()) c[w.status]++;
  return [c.Moving, c.Idle, c.Stopped, c.Offline, c.Maintenance];
};
const alertsOf = (s: State, vehicleId: string, type: string) => s.alerts.filter((a) => a.vehicleId === vehicleId && a.type === type);

test("seed: 50 vehicles, required mix, 30/7/8/3/2, 200 docs at 8/3/189, 4 work orders", () => {
  const s = seed();
  expect(new Set(s.vehicleOrder).size).toBe(50);
  const cats: Record<string, number> = {};
  for (const id of s.vehicleOrder) cats[s.vehicles[id].category] = (cats[s.vehicles[id].category] ?? 0) + 1;
  expect(cats).toEqual({ "Heavy vehicle": 28, "Large bus": 11, "Small bus": 6, SUV: 3, "Passenger car": 2 });
  expect(partition(s)).toEqual([30, 7, 8, 3, 2]);
  const docs = { Valid: 0, Expiring: 0, Expired: 0 };
  for (const d of s.docs) docs[docState(d, "2026-10-01").status]++;
  expect(s.docs.length).toBe(200);
  expect(docs).toEqual({ Valid: 189, Expiring: 8, Expired: 3 });
  expect(s.workOrders.map((w) => w.status).sort()).toEqual(["Completed", "Completed", "In progress", "In progress"]);
  const due = [...buildViews(s).values()].filter((w) => w.due).map((w) => w.v.id);
  expect(due.length).toBe(5);
  expect(due).toContain(SERVICE_ID);
  expect(JSON.stringify(createSeed(anchor))).toBe(JSON.stringify(s)); // deterministic
});

test("partition is stable while the fleet moves, at any speed", () => {
  let s = ticks(seed(), 30);
  expect(partition(s)).toEqual([30, 7, 8, 3, 2]);
  s = ticks(run(s, { type: "SET_SPEED", speed: 16 }), 60);
  expect(partition(s)).toEqual([30, 7, 8, 3, 2]);
  expect(s.alerts.filter((a) => a.type.startsWith("Geofence") || a.type === "Overspeed")).toEqual([]);
});

test("authored loops stay clear of every geofence", () => {
  const s = seed();
  for (const id of ["R1", "R2", "R3", "R4", "R5", "R6"])
    for (let d = 0; d < PATHS[id].length; d += 50)
      for (const z of s.zones) expect(distM(pointAt(PATHS[id], d).pos, z.center)).toBeGreaterThan(z.radiusM + 200);
});

test("document dates: today Expiring, yesterday Expired, day 30 Expiring, day 31 Valid", () => {
  const doc = (expiryDate: string) => ({ id: "x", ownerType: "Vehicle" as const, ownerId: "v", type: "Permit" as const, reference: "r", expiryDate });
  expect(docState(doc("2026-10-01"), "2026-10-01").status).toBe("Expiring");
  expect(docState(doc("2026-09-30"), "2026-10-01").status).toBe("Expired");
  expect(docState(doc("2026-10-31"), "2026-10-01").status).toBe("Expiring");
  expect(docState(doc("2026-11-01"), "2026-10-01").status).toBe("Valid");
});

test("maintenance: create → start → QC → complete moves HV-017 through Maintenance and back", () => {
  let s = seed();
  const due = alertsOf(s, SERVICE_ID, "Service due")[0];
  const input: WorkOrderInput = {
    vehicleId: SERVICE_ID, reason: "Service due", issueAlertId: due.id, type: "Preventive", priority: "Medium",
    technician: "Technician T-01", plannedDate: "2026-10-01", description: "Scheduled service",
  };
  s = run(s, { type: "CREATE_WORK_ORDER", input });
  expect(partition(s)).toEqual([30, 7, 7, 3, 3]);
  expect(workOrderError(s, input)).toContain("already open");
  expect(run(s, { type: "CREATE_WORK_ORDER", input }).workOrders.length).toBe(s.workOrders.length);

  const id = s.workOrders[s.workOrders.length - 1].id;
  const complete = (qualityCheck: boolean): Action => ({ type: "COMPLETE_WORK", id, parts: "120.50", labour: "80", completionNotes: "Oil and filters", qualityCheck });
  expect(run(s, complete(true))).toBe(s); // must start first
  s = run(s, { type: "START_WORK", id });
  expect(costError("-1", "0")).not.toBeNull();
  expect(costError("abc", "0")).not.toBeNull();
  expect(costError("0", "0")).toBeNull();
  expect(run(s, complete(false))).toBe(s); // quality check required
  s = run(s, complete(true));

  const wo = s.workOrders.find((w) => w.id === id)!;
  expect([wo.status, wo.partsCost + wo.labourCost]).toEqual(["Completed", 200.5]);
  expect(partition(s)).toEqual([30, 7, 8, 3, 2]);
  expect(buildViews(s).get(SERVICE_ID)!.due).toBeNull();
  expect(s.alerts.find((a) => a.id === due.id)!.workflow).toBe("Resolved");
  const actions = s.activity.filter((e) => e.vehicleId === SERVICE_ID).map((e) => e.action);
  expect(actions).toEqual(expect.arrayContaining(["Service due", "Work order created", "Work started", "Quality check completed", "Released"]));
});

test("geofence: bus departure raises exactly one exit alert; radius edits stay silent", () => {
  let s = run(seed(), { type: "SET_SPEED", speed: 16 }, { type: "RUN_SCENARIO", scenario: "busDeparture" });
  expect(run(s, { type: "RUN_SCENARIO", scenario: "busDeparture" })).toBe(s); // no duplicate run
  s = ticks(s, 40);
  expect(alertsOf(s, BUS_ID, "Geofence exit").length).toBe(1);
  expect(s.scenarios.busDeparture).toBe("done");
  expect(s.trips.find((t) => t.id === "TRP-3100")!.status).toBe("Active");
  const count = s.alerts.length;
  s = run(s, { type: "SET_ZONE_RADIUS", id: "ZONE-A", radiusM: 1500 }, { type: "SET_ZONE_RADIUS", id: "ZONE-A", radiusM: 200 });
  expect(s.alerts.length).toBe(count);
});

test("overspeed: two samples to open, one alert per episode, resolve only after recovery", () => {
  let s = run(seed(), { type: "RUN_SCENARIO", scenario: "overspeed" });
  s = ticks(s, 1);
  expect(alertsOf(s, OVERSPEED_ID, "Overspeed").length).toBe(0);
  s = ticks(s, 1);
  const [alert] = alertsOf(s, OVERSPEED_ID, "Overspeed");
  expect(alert.conditionActive).toBe(true);
  expect(run(s, { type: "RESOLVE_ALERT", id: alert.id, note: "" })).toBe(s);
  s = run(s, { type: "ACK_ALERT", id: alert.id, note: "Driver contacted" });
  expect(s.alerts.filter(isOpen).some((a) => a.id === alert.id)).toBe(true); // acknowledged still counts as open
  s = ticks(s, 2);
  expect(alertsOf(s, OVERSPEED_ID, "Overspeed").length).toBe(1);
  s = ticks(s, 1);
  expect(alertsOf(s, OVERSPEED_ID, "Overspeed")[0].conditionActive).toBe(false);
  s = run(s, { type: "RESOLVE_ALERT", id: alert.id, note: "Coached" });
  expect(alertsOf(s, OVERSPEED_ID, "Overspeed")[0].workflow).toBe("Resolved");
});

test("offline: stale devices stay frozen; reconnect recovers SUV-002", () => {
  let s = ticks(seed(), 10);
  const frozen = seed().vehicles["DEMO-HV-025"];
  expect([s.vehicles["DEMO-HV-025"].lat, s.vehicles["DEMO-HV-025"].lastSeen]).toEqual([frozen.lat, frozen.lastSeen]);
  s = run(s, { type: "RUN_SCENARIO", scenario: "restoreDevice" });
  expect(buildViews(s).get(RESTORE_ID)!.status).toBe("Stopped");
  expect(partition(s)).toEqual([30, 7, 9, 2, 2]);
  expect(alertsOf(s, RESTORE_ID, "Device offline")[0].conditionActive).toBe(false);
});

test("renewal: a near date stays Expiring; one year later is Valid and unblocks HV-020", () => {
  let s = seed();
  const doc = s.docs.find((d) => d.ownerId === "DEMO-HV-020" && d.type === "Insurance")!;
  expect(buildViews(s).get("DEMO-HV-020")!.blockers).toContain("Insurance expired");
  expect(renewalError(s, "2026-10-01")).not.toBeNull();
  s = run(s, { type: "RENEW_DOCUMENT", id: doc.id, expiryDate: "2026-10-11", note: "" });
  const alert = s.alerts.find((a) => a.relatedId === doc.id)!;
  expect([alert.conditionActive, alert.severity]).toEqual([true, "Warning"]);
  s = run(s, { type: "RENEW_DOCUMENT", id: doc.id, expiryDate: "2027-10-01", note: "Demo renewal" });
  expect(s.alerts.find((a) => a.relatedId === doc.id)!.workflow).toBe("Resolved");
  expect(buildViews(s).get("DEMO-HV-020")!.blockers).toEqual([]);
});

test("pause freezes the demo clock", () => {
  const s = run(seed(), { type: "SET_PAUSED", paused: true });
  expect(ticks(s, 5).clock.now).toBe(s.clock.now);
});

test("CSV: quoting, formula neutralising, numbers untouched", () => {
  expect(csvCell("a,b")).toBe('"a,b"');
  expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
  expect(csvCell("-2+3")).toBe("'-2+3");
  expect(csvCell(-5)).toBe("-5");
  expect(toCsv([["a", 1], ["b\nc", null]])).toBe('a,1\r\n"b\nc",');
});

test("service forecast agrees with the service-due rule", () => {
  const s = seed();
  for (const w of buildViews(s).values()) {
    const p = serviceProgress(w.v, s.serviceInterval, "2026-10-01");
    expect(p.used >= 1).toBe(w.due !== null);
  }
});
