import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDemo } from "./DemoProvider";
import { Modal, SeverityBadge, WorkflowBadge, btnPrimary, btnSecondary, inputCls } from "./ui";
import { fmtHm } from "@/lib/format";
import { isOpen } from "@/lib/rules";
import type { Alert, Severity } from "@/lib/types";

const EVENT_TYPES = new Set(["Geofence exit", "Geofence entry"]);
const RANK: Record<Severity, number> = { Critical: 0, Warning: 1, Info: 2 };
const RAIL: Record<Severity, string> = {
  Critical: "shadow-[inset_3px_0_0_#e11d48]",
  Warning: "shadow-[inset_3px_0_0_#f59e0b]",
  Info: "shadow-[inset_3px_0_0_#0ea5e9]",
};

export function AlertFeed({ onOpenVehicle }: { onOpenVehicle: (id: string) => void }) {
  const { s, dispatch } = useDemo();
  const router = useRouter();
  const [showResolved, setShowResolved] = useState(false);

  const open = s.alerts.filter(isOpen);
  const list = (showResolved ? [...s.alerts] : open).sort((a, b) => b.at - a.at || RANK[a.severity] - RANK[b.severity]);

  const openAlert = (a: Alert) => {
    if (a.type === "Document expiry") {
      dispatch({ type: "SET_UI", ui: { complianceFocus: a.relatedId } });
      router.push("/compliance/");
    } else onOpenVehicle(a.vehicleId);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 pb-2.5 pt-3">
        <h2 className="text-[15px] font-semibold tracking-tight text-navy">Alerts</h2>
        <span className="tabular rounded-full bg-rose-50 px-1.5 font-mono text-[11px] font-semibold leading-5 text-rose-700 ring-1 ring-inset ring-rose-200">
          {open.length} open
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" className="accent-navy" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          Show resolved
        </label>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {list.map((a) => (
          <li key={a.id} className={`border-b border-slate-100 px-3 py-2.5 ${RAIL[a.severity]}`}>
            <div className="flex items-start justify-between gap-2">
              <button type="button" className="min-w-0 rounded text-left focus-visible:outline-2 focus-visible:outline-signal" onClick={() => openAlert(a)}>
                <span className="flex flex-wrap items-center gap-1.5">
                  <SeverityBadge severity={a.severity} />
                  <span className="text-sm font-semibold text-slate-900">{a.type}</span>
                </span>
                <span className="mt-0.5 block font-mono text-[11px] text-slate-500">
                  {a.id} · {a.vehicleId} · {fmtHm(a.at)}
                </span>
                <span className="mt-1 block text-[13px] leading-snug text-slate-700">{a.description}</span>
              </button>
              <WorkflowBadge workflow={a.workflow} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <AlertActions alert={a} />
              <span className="text-[11px] text-slate-500">
                {EVENT_TYPES.has(a.type) ? "Event" : a.conditionActive ? "Condition active — resolve after recovery" : "Condition recovered"}
              </span>
            </div>
            {a.notes.length > 0 && <p className="mt-1 text-[11px] text-slate-500">Note: {a.notes[a.notes.length - 1]}</p>}
          </li>
        ))}
        {list.length === 0 && <li className="px-3 py-8 text-center text-sm text-slate-500">No open alerts.</li>}
      </ul>
    </div>
  );
}

/** Acknowledge / Resolve with an optional operator note; used in the feed and the vehicle panel. */
export function AlertActions({ alert }: { alert: Alert }) {
  const { dispatch } = useDemo();
  const [kind, setKind] = useState<"ack" | "resolve" | null>(null);
  const [note, setNote] = useState("");
  const start = (k: "ack" | "resolve") => {
    setNote("");
    setKind(k);
  };
  const small = `${btnSecondary} h-7 px-2 text-xs`;

  return (
    <>
      {alert.workflow === "New" && (
        <button type="button" className={small} onClick={() => start("ack")}>
          Acknowledge
        </button>
      )}
      {alert.workflow !== "Resolved" && (
        <button
          type="button"
          className={small}
          disabled={alert.conditionActive}
          title={alert.conditionActive ? "The condition is still active" : undefined}
          onClick={() => start("resolve")}
        >
          Resolve
        </button>
      )}
      <Modal open={kind !== null} onClose={() => setKind(null)} title={kind === "ack" ? "Acknowledge alert" : "Resolve alert"}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            dispatch({ type: kind === "ack" ? "ACK_ALERT" : "RESOLVE_ALERT", id: alert.id, note });
            setKind(null);
          }}
          className="space-y-3 text-sm"
        >
          <p>
            <span className="font-medium">{alert.type}</span> · {alert.vehicleId} · {alert.id}
          </p>
          <p className="text-slate-600">
            {kind === "ack"
              ? "Acknowledging records that an operator has seen the alert. It stays open and does not clear the underlying condition."
              : "Resolving closes the alert."}
          </p>
          <label className="flex flex-col gap-1">
            <span className="font-medium">Operator note (optional)</span>
            <textarea className={inputCls} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className={btnSecondary} onClick={() => setKind(null)}>
              Cancel
            </button>
            <button type="submit" className={btnPrimary}>
              {kind === "ack" ? "Acknowledge" : "Resolve"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
