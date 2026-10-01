import { EXIT_A_JOINS } from "./routes";
import { PATHS, pointAt } from "./geo";
import { heldVehicleIds } from "./rules";
import type { Point, State, Vehicle } from "./types";

export const TICK_MS = 3000; // wall-clock cadence; simulated step = TICK_MS × speed
export const HISTORY_CAP = 1200; // points per vehicle (seeded + live), oldest dropped first
export const OVERSPEED_TICKS = 4;

export const BUS_ID = "DEMO-LB-003";
export const OVERSPEED_ID = "DEMO-HV-007";
export const SERVICE_ID = "DEMO-HV-017";
export const RESTORE_ID = "DEMO-SUV-002";

/** Smooth, deterministic cruising speed — always under the demo threshold. */
export const cruiseKph = (v: Vehicle, t: number) =>
  Math.min(76, Math.max(18, v.baseKph + 11 * Math.sin((2 * Math.PI * t) / 420_000 + v.phase)));

/** Advance one vehicle along its route; distance, odometer and speed come from the same step. */
export function moveVehicle(v: Vehicle, t: number, dtMs: number, kph: number): Vehicle {
  const stepM = (kph / 3.6) * (dtMs / 1000);
  let routeId = v.routeId!;
  let d = v.distM + stepM;
  if (routeId === "EXIT-A" && d >= PATHS["EXIT-A"].length) {
    d = PATHS[EXIT_A_JOINS.routeId].cum[EXIT_A_JOINS.idx] + (d - PATHS["EXIT-A"].length);
    routeId = EXIT_A_JOINS.routeId;
  }
  const path = PATHS[routeId];
  if (path.loop) d %= path.length;
  const { pos, heading } = pointAt(path, d);
  return {
    ...v,
    routeId,
    distM: d,
    lat: pos[0],
    lng: pos[1],
    heading: Math.round(heading),
    speedKph: Math.round(kph),
    ignition: true,
    odometerKm: v.odometerKm + stepM / 1000,
    engineHours: v.engineHours === null ? null : v.engineHours + dtMs / 3_600_000,
    fuelPercent: v.fuelPercent === null ? null : Math.max(8, v.fuelPercent - (stepM / 1000) * 0.04),
    lastSeen: t,
  };
}

export const toPoint = (v: Vehicle, t: number): Point => ({ t, lat: v.lat, lng: v.lng, speedKph: v.speedKph, ignition: v.ignition });

/** Seam for a future real telemetry adapter; the simulator is the only implementation here. */
export type TelemetrySource = (s: State, dtMs: number) => State;

export const simulate: TelemetrySource = (s, dtMs) => {
  const t = s.clock.now + dtMs;
  const held = heldVehicleIds(s);
  const speeding = s.scenarios.overspeed === "running";
  const vehicles: Record<string, Vehicle> = {};
  const history = { ...s.history };
  for (const id of s.vehicleOrder) {
    const v = s.vehicles[id];
    let n = v; // disconnected devices stay frozen with a stale last-seen
    if (v.connected && v.moving && v.routeId && !held.has(id)) {
      n = moveVehicle(v, t, dtMs, speeding && id === OVERSPEED_ID ? 92 + 3 * Math.sin(t / 9000) : cruiseKph(v, t));
    } else if (v.connected) {
      const idleHours = v.ignition && v.engineHours !== null ? dtMs / 3_600_000 : 0;
      n = { ...v, speedKph: 0, lastSeen: t, engineHours: v.engineHours === null ? null : v.engineHours + idleHours };
    }
    vehicles[id] = n;
    if (n.lastSeen === t) {
      const h = history[id] ?? [];
      history[id] = [...(h.length >= HISTORY_CAP ? h.slice(h.length - HISTORY_CAP + 1) : h), toPoint(n, t)];
    }
  }
  return { ...s, vehicles, history, clock: { ...s.clock, now: t } };
};
