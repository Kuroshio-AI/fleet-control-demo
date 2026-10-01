import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDemo } from "./DemoProvider";
import { Modal, SeverityBadge, WorkflowBadge, btnPrimary, btnSecondary, inputCls } from "./ui";
import { fmtHm } from "@/lib/format";
import { isOpen } from "@/lib/rules";
import type { Alert } from "@/lib/types";

const EVENT_TYPES = new Set(["Geofence exit", "Geofence entry"]);
const RANK = { Critical: 0, Warning: 1, Info: 2 };

export function AlertFeed({ onOpenVehicle }: { onOpenVehicle: (id: string) => void }) {
  const { s, dispatch } = useDemo();
  const router = useRouter();
  const [showResolved, setShowResolved] = useState(false);
  const [pending, setPending] = useState<{ alert: Alert; kind: "ack" | "resolve" } | null>(null);
  const [note, setNote] = useState("");

  const open = s.alerts.filter(isOpen);
  const list = (showResolved ? [...s.alerts] : open).sort((a, b) => b.at - a.at || RANK[a.severity] - RANK[b.severity]);

  const openAlert = (a: Alert) => {
    if (a.type === "Document expiry") {
      dispatch({ type: "SET_UI", ui: { complianceFocus: a.relatedId } });
      router.push("/compliance/");
    } else onOpenVehicle(a.vehicleId);
  };
  const confirm = () => {
    if (!pending) return;
    dispatch({ type: pending.kind === "ack" ? "ACK_ALERT" : "RESOLVE_ALERT", id: pending.alert.id, note });
    setPending(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <h2 className="font-semibold">
          Alerts <span className="tabular font-normal text-slate-600">· {open.length} open</span>
        </h2>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          Show resolved
        </label>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
        {list.map((a) => {
          const event = EVENT_TYPES.has(a.type);
          return (
            <li key={a.id} className="px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <button type="button" className="min-w-0 text-left" onClick={() => openAlert(a)}>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <SeverityBadge severity={a.severity} />
                    <span className="text-sm font-medium">{a.type}</span>
                  </span>
                  <span className="tabular mt-0.5 block text-xs text-slate-500">
                    {a.id} · {a.vehicleId} · {s.drivers[a.driverId].label} · {fmtHm(a.at)}
                  </span>
                  <span className="mt-0.5 block text-sm text-slate-700">{a.description}</span>
                </button>
                <WorkflowBadge workflow={a.workflow} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {a.workflow === "New" && (
                  <button type="button" className={`${btnSecondary} px-2 py-1 text-xs`} onClick={() => (setNote(""), setPending({ alert: a, kind: "ack" }))}>
                    Acknowledge
                  </button>
                )}
                {a.workflow !== "Resolved" && (
                  <button
                    type="button"
                    className={`${btnSecondary} px-2 py-1 text-xs`}
                    disabled={a.conditionActive}
                    onClick={() => (setNote(""), setPending({ alert: a, kind: "resolve" }))}
                  >
                    Resolve
                  </button>
                )}
                <span className="text-xs text-slate-500">
                  {event ? "Event" : a.conditionActive ? "Condition active — resolve after recovery" : "Condition recovered"}
                </span>
                {a.notes.length > 0 && <span className="text-xs text-slate-500">· Note: {a.notes[a.notes.length - 1]}</span>}
              </div>
            </li>
          );
        })}
        {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">No open alerts.</li>}
      </ul>

      <Modal open={!!pending} onClose={() => setPending(null)} title={pending?.kind === "ack" ? "Acknowledge alert" : "Resolve alert"}>
        {pending && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              confirm();
            }}
            className="space-y-3 text-sm"
          >
            <p>
              <span className="font-medium">{pending.alert.type}</span> · {pending.alert.vehicleId} · {pending.alert.id}
            </p>
            <p className="text-slate-600">
              {pending.kind === "ack"
                ? "Acknowledging records that an operator has seen the alert. It stays open and does not clear the underlying condition."
                : "Resolving closes the alert."}
            </p>
            <label className="flex flex-col gap-1">
              <span className="font-medium">Operator note (optional)</span>
              <textarea className={inputCls} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className={btnSecondary} onClick={() => setPending(null)}>
                Cancel
              </button>
              <button type="submit" className={btnPrimary}>
                {pending.kind === "ack" ? "Acknowledge" : "Resolve"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
