"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useDemo } from "@/components/DemoProvider";
import { DocBadge, ErrorText, Field, Modal, btnPrimary, btnSecondary, card, inputCls } from "@/components/ui";
import { complianceCsv, downloadCsv } from "@/lib/csv";
import { addDays, fmtDate } from "@/lib/format";
import { docState, docVehicleId, today, type DocRow } from "@/lib/rules";
import { renewalError } from "@/lib/store";
import type { Category, Doc } from "@/lib/types";

type View = "All" | "Expiring" | "Expired";
const VIEWS: [View, string][] = [
  ["All", "All"],
  ["Expiring", "Expiring within 30 days"],
  ["Expired", "Expired"],
];
const CATEGORIES: Category[] = ["Heavy vehicle", "Large bus", "Small bus", "SUV", "Passenger car"];

export default function CompliancePage() {
  const { s, dispatch } = useDemo();
  const router = useRouter();
  const [view, setView] = useState<View>("All");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [renewing, setRenewing] = useState<Doc | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const date = today(s);
  const focus = s.ui.complianceFocus ? s.docs.find((d) => d.id === s.ui.complianceFocus) : undefined;
  const focusVehicle = focus && docVehicleId(s, focus);

  const all: DocRow[] = useMemo(() => s.docs.map((doc) => ({ doc, ...docState(doc, date) })), [s.docs, date]);
  const ownerLabel = (d: Doc) => (d.ownerType === "Driver" ? `${s.drivers[d.ownerId].label} (${d.ownerId})` : d.ownerId);
  const rows = all.filter((r) => {
    const vehicleId = docVehicleId(s, r.doc);
    const needle = q.trim().toLowerCase();
    return (
      (view === "All" || r.status === view) &&
      (!category || s.vehicles[vehicleId].category === category) &&
      (!focusVehicle || vehicleId === focusVehicle) &&
      (!needle || `${ownerLabel(r.doc)} ${vehicleId} ${r.doc.reference}`.toLowerCase().includes(needle))
    );
  });
  const totals = { Valid: 0, Expiring: 0, Expired: 0 };
  for (const r of all) totals[r.status]++;
  const affected = new Set(all.filter((r) => r.status !== "Valid").map((r) => docVehicleId(s, r.doc))).size;
  const filtered = rows.length !== all.length;

  const viewVehicle = (d: Doc) => {
    dispatch({ type: "SELECT_VEHICLE", id: docVehicleId(s, d) });
    router.push("/");
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-4">
      <div>
        <h1 className="text-xl font-semibold">Compliance</h1>
        <p className="text-sm text-slate-600">
          Vehicle registration, insurance and permit records plus driver licences. Document types and expiry periods are sample
          configuration; actual requirements must be confirmed with the client.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ["Documents", all.length],
          ["Valid", totals.Valid],
          ["Expiring ≤ 30 days", totals.Expiring],
          ["Expired", totals.Expired],
          ["Vehicles affected", affected],
        ].map(([label, value]) => (
          <div key={label} className={`${card} px-3 py-2`}>
            <div className="text-xs text-slate-600">{label}</div>
            <div className="tabular text-xl font-semibold">{value}</div>
          </div>
        ))}
      </section>

      <section className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Status filter" className="flex overflow-hidden rounded-md ring-1 ring-slate-300">
          {VIEWS.map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className="bg-white px-3 py-1.5 text-sm hover:bg-slate-50 aria-pressed:bg-navy aria-pressed:text-white"
            >
              {label}
            </button>
          ))}
        </div>
        <select className={inputCls} aria-label="Vehicle category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input
          type="search"
          className={`${inputCls} w-full sm:w-60`}
          placeholder="Search owner, vehicle or reference"
          aria-label="Search owner, vehicle or reference"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {focusVehicle && (
          <span className="flex items-center gap-2 rounded-md bg-sky-50 px-2.5 py-1 text-sm ring-1 ring-sky-200">
            Showing {focusVehicle} and its driver
            <button type="button" className="font-semibold underline" onClick={() => dispatch({ type: "SET_UI", ui: { complianceFocus: null } })}>
              Show all
            </button>
          </span>
        )}
        <span className="tabular text-sm font-medium text-slate-700" aria-live="polite">
          Showing {rows.length} of {all.length}
        </span>
        <button
          type="button"
          className={`${btnSecondary} ml-auto`}
          disabled={!rows.length}
          onClick={() => downloadCsv(complianceCsv(s, rows, filtered ? `filtered-${rows.length}-of-${all.length}` : `all-${all.length}`))}
        >
          ⬇ Export compliance ({rows.length})
        </button>
      </section>

      {message && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">
          {message}
        </p>
      )}

      <section className={`${card} overflow-x-auto`}>
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {["Owner", "Vehicle", "Type", "Reference (fictional)", "Expiry", "Days left", "Status", ""].map((h) => (
                <th key={h} scope="col" className="px-3 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.doc.id} className={r.doc.id === focus?.id ? "bg-sky-50" : undefined}>
                <td className="px-3 py-1.5">
                  {ownerLabel(r.doc)}
                  <div className="text-xs text-slate-500">{r.doc.ownerType}</div>
                </td>
                <td className="px-3 py-1.5">
                  <button type="button" className="text-navy hover:underline" onClick={() => viewVehicle(r.doc)}>
                    {docVehicleId(s, r.doc)}
                  </button>
                </td>
                <td className="px-3 py-1.5">{r.doc.type}</td>
                <td className="px-3 py-1.5">{r.doc.reference}</td>
                <td className="px-3 py-1.5">{fmtDate(r.doc.expiryDate)}</td>
                <td className="px-3 py-1.5">{r.days === 0 ? "Today" : r.days}</td>
                <td className="px-3 py-1.5">
                  <DocBadge status={r.status} />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <button type="button" className={`${btnSecondary} px-2 py-1 text-xs`} onClick={() => (setMessage(null), setRenewing(r.doc))}>
                    Record demo renewal
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-3 py-6 text-center text-sm text-slate-500">No documents match these filters.</p>}
      </section>

      <Modal open={!!renewing} onClose={() => setRenewing(null)} title="Record demo renewal">
        {renewing && (
          <RenewForm
            doc={renewing}
            owner={ownerLabel(renewing)}
            onDone={(msg) => {
              setRenewing(null);
              setMessage(msg);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function RenewForm({ doc, owner, onDone }: { doc: Doc; owner: string; onDone: (message: string) => void }) {
  const { s, dispatch } = useDemo();
  const date = today(s);
  const [expiry, setExpiry] = useState(addDays(date, 365));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  return (
    <form
      className="space-y-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy.current) return;
        const err = renewalError(s, expiry);
        setError(err);
        if (err) return;
        busy.current = true;
        dispatch({ type: "RENEW_DOCUMENT", id: doc.id, expiryDate: expiry, note });
        const { status, days } = docState({ ...doc, expiryDate: expiry }, date);
        onDone(`${doc.type} ${doc.reference} (${owner}) now expires ${fmtDate(expiry)} — ${status}, ${days} days remaining.`);
      }}
    >
      <p>
        <span className="font-medium">{doc.type}</span> · {doc.reference} · {owner}
        <br />
        Current expiry: {fmtDate(doc.expiryDate)}
      </p>
      <Field label="New expiry date" hint="Must be after the demo date. A date within 30 days stays Expiring.">
        <input type="date" className={inputCls} min={addDays(date, 1)} value={expiry} onChange={(e) => setExpiry(e.target.value)} required />
      </Field>
      <Field label="Note (optional)">
        <textarea className={inputCls} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <p className="text-xs text-slate-500">This updates the demo record only. It is not proof of a legal renewal.</p>
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end">
        <button type="submit" className={btnPrimary}>
          Save renewal
        </button>
      </div>
    </form>
  );
}
