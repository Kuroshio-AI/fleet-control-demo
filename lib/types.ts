import type { LatLng } from "./routes";

export type { LatLng };

export type Category = "Heavy vehicle" | "Large bus" | "Small bus" | "SUV" | "Passenger car";
export type Status = "Moving" | "Idle" | "Stopped" | "Offline" | "Maintenance";
export const STATUSES: Status[] = ["Moving", "Idle", "Stopped", "Offline", "Maintenance"];

export type Vehicle = {
  id: string;
  category: Category;
  registration: string;
  siteId: string;
  driverId: string;
  // latest telemetry
  lat: number;
  lng: number;
  speedKph: number;
  heading: number;
  ignition: boolean;
  odometerKm: number;
  engineHours: number | null;
  fuelPercent: number | null;
  lastSeen: number; // demo-clock ms of the last telemetry sample
  connected: boolean; // device link, stored separately from maintenance hold
  // movement model
  moving: boolean;
  routeId: string | null;
  distM: number;
  baseKph: number;
  phase: number;
  // service plan
  nextServiceKm: number;
  nextServiceDate: string; // YYYY-MM-DD
  // rule memory
  zones: string[];
  overCount: number;
};

export type Driver = { id: string; label: string; vehicleId: string; licenceDocId: string };
export type Zone = { id: string; name: string; center: LatLng; radiusM: number };

export type Trip = {
  id: string;
  vehicleId: string;
  driverId: string;
  routeId: string;
  plannedStart: number;
  actualStart: number | null;
  actualEnd: number | null;
  status: "Scheduled" | "Active" | "Completed";
};

export type AlertType = "Geofence exit" | "Geofence entry" | "Overspeed" | "Device offline" | "Service due" | "Document expiry";
export type Severity = "Critical" | "Warning" | "Info";
export type Workflow = "New" | "Acknowledged" | "Resolved";

export type Alert = {
  id: string;
  vehicleId: string;
  driverId: string;
  type: AlertType;
  severity: Severity;
  at: number;
  description: string;
  conditionActive: boolean;
  workflow: Workflow;
  relatedId: string | null; // zone, document or work order
  lat: number | null;
  lng: number | null;
  notes: string[];
};

export type WorkOrder = {
  id: string;
  vehicleId: string;
  issueAlertId: string | null;
  reason: string;
  type: "Preventive" | "Corrective";
  priority: "Low" | "Medium" | "High";
  technician: string;
  plannedDate: string;
  description: string;
  status: "Open" | "In progress" | "Completed";
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  partsCost: number;
  labourCost: number;
  qualityCheck: boolean;
  notes: string;
  completionNotes: string;
};

export type DocType = "Registration" | "Insurance" | "Permit" | "Driver licence";
export type DocStatus = "Valid" | "Expiring" | "Expired";
export type Doc = {
  id: string;
  ownerType: "Vehicle" | "Driver";
  ownerId: string;
  type: DocType;
  reference: string;
  expiryDate: string;
};

export type Activity = {
  id: string;
  vehicleId: string;
  at: number;
  action: string;
  relatedId: string | null;
  actor: string;
  summary: string;
};

export type Point = { t: number; lat: number; lng: number; speedKph: number; ignition: boolean };

export type Speed = 1 | 4 | 16;
export type ScenarioState = "ready" | "running" | "done";

export type Filters = { q: string; category: string; status: string; site: string };
export const NO_FILTERS: Filters = { q: "", category: "", status: "", site: "" };

export type State = {
  schemaVersion: number;
  clock: { anchor: number; now: number; paused: boolean; speed: Speed };
  vehicles: Record<string, Vehicle>;
  vehicleOrder: string[];
  drivers: Record<string, Driver>;
  zones: Zone[];
  trips: Trip[];
  alerts: Alert[];
  workOrders: WorkOrder[];
  docs: Doc[];
  activity: Activity[];
  serviceInterval: { km: number; days: number };
  scenarios: { busDeparture: ScenarioState; overspeed: ScenarioState };
  overspeedTicks: number;
  seq: number;
  ui: {
    selectedVehicleId: string | null;
    filters: Filters;
    basemap: "osm" | "schematic";
    createWorkOrderFor: string | null;
    complianceFocus: string | null;
  };
  // Seeded 60-minute history plus the session-only live buffer. Never persisted.
  history: Record<string, Point[]>;
};
