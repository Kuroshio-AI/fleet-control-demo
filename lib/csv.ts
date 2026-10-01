import { dubaiDate, fmtDateTime, fmtHm } from "./format";
import type { DocRow, VehicleView } from "./rules";
import type { State } from "./types";

type Cell = string | number | null | undefined;

/** Quote when needed; neutralise text that a spreadsheet would run as a formula. Numbers pass through. */
export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCsv = (rows: Cell[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

const stamp = (s: State) => `${dubaiDate(s.clock.now)}_${fmtHm(s.clock.now).replace(":", "")}-GST`;

export function fleetCsv(s: State, views: VehicleView[], scope: string) {
  const rows: Cell[][] = [
    ["Vehicle ID", "Category", "Driver", "Display status", "Last update (Asia/Dubai, demo clock)", "Odometer (km)", "Assigned site", "Service due", "Compliance summary"],
    ...views.map((w) => [
      w.v.id,
      w.v.category,
      w.driverLabel,
      w.status,
      fmtDateTime(w.v.lastSeen),
      Math.round(w.v.odometerKm),
      w.siteName,
      w.due ? "Yes" : "No",
      w.expired || w.expiring ? `${w.expired} expired, ${w.expiring} expiring` : "All valid",
    ]),
  ];
  return { filename: `fleet-${scope}_synthetic-data_${stamp(s)}.csv`, csv: toCsv(rows) };
}

export function complianceCsv(s: State, docs: DocRow[], scope: string) {
  const owner = (r: DocRow) => (r.doc.ownerType === "Driver" ? s.drivers[r.doc.ownerId].label : r.doc.ownerId);
  const vehicle = (r: DocRow) => (r.doc.ownerType === "Driver" ? s.drivers[r.doc.ownerId].vehicleId : r.doc.ownerId);
  const rows: Cell[][] = [
    ["Document ID", "Owner type", "Owner", "Assigned vehicle", "Type", "Reference (fictional)", "Expiry date", "Days remaining", "Status"],
    ...docs.map((r) => [r.doc.id, r.doc.ownerType, owner(r), vehicle(r), r.doc.type, r.doc.reference, r.doc.expiryDate, r.days, r.status]),
  ];
  return { filename: `compliance-${scope}_synthetic-data_${stamp(s)}.csv`, csv: toCsv(rows) };
}

export function downloadCsv({ filename, csv }: { filename: string; csv: string }) {
  const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
