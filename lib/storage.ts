import { SCHEMA_VERSION } from "./seed";
import type { State } from "./types";

const KEY = "fleet-control-demo";

export type Saved =
  | { kind: "none" }
  | { kind: "ok"; state: Omit<State, "history"> }
  | { kind: "incompatible" }
  | { kind: "unavailable" };

export function loadSaved(): Saved {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return { kind: "unavailable" };
  }
  if (!raw) return { kind: "none" };
  try {
    const state = JSON.parse(raw);
    return state?.schemaVersion === SCHEMA_VERSION ? { kind: "ok", state } : { kind: "incompatible" };
  } catch {
    return { kind: "incompatible" };
  }
}

/** Business records and the latest snapshot only; the history buffer stays session-only. */
export function save(s: State): boolean {
  const { history: _history, ...rest } = s;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...rest, ui: { ...rest.ui, selectedVehicleId: null, createWorkOrderFor: null, complianceFocus: null } }));
    return true;
  } catch {
    return false;
  }
}

export function clearSaved(): boolean {
  try {
    localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}
