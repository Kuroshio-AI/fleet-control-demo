import { useEffect, useRef, type ReactNode } from "react";
import type { DocStatus, Severity, Status, Workflow } from "@/lib/types";

export const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600";
export const btnPrimary = `${btn} bg-navy text-white hover:bg-navy-2`;
export const btnSecondary = `${btn} bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50`;
export const btnDanger = `${btn} bg-rose-600 text-white hover:bg-rose-700`;
export const inputCls =
  "rounded-md bg-white px-2.5 py-1.5 text-sm text-slate-900 ring-1 ring-inset ring-slate-300 outline-none focus:ring-2 focus:ring-sky-600";
export const card = "rounded-lg bg-white shadow-sm ring-1 ring-slate-200";

const STATUS: Record<Status, { color: string; cls: string; shape: string }> = {
  Moving: { color: "#059669", cls: "bg-emerald-50 text-emerald-800 ring-emerald-600/30", shape: '<path d="M11 2 L19 19 L11 15 L3 19 Z"/>' },
  Idle: { color: "#d97706", cls: "bg-amber-50 text-amber-800 ring-amber-600/30", shape: '<circle cx="11" cy="11" r="7"/>' },
  Stopped: { color: "#475569", cls: "bg-slate-100 text-slate-700 ring-slate-500/30", shape: '<rect x="4" y="4" width="14" height="14" rx="2"/>' },
  Offline: { color: "#e11d48", cls: "bg-rose-50 text-rose-800 ring-rose-600/30", shape: '<circle cx="11" cy="11" r="7" stroke-dasharray="3 2"/>' },
  Maintenance: { color: "#7c3aed", cls: "bg-violet-50 text-violet-800 ring-violet-600/30", shape: '<path d="M11 2 L20 11 L11 20 L2 11 Z"/>' },
};

/** Static SVG for a status shape; shared by map markers, legend and badges. */
export function markerSvg(status: Status) {
  const { color, shape } = STATUS[status];
  const hollow = status === "Offline";
  return `<svg viewBox="0 0 22 22" aria-hidden="true" fill="${hollow ? "#fff" : color}" stroke="${hollow ? color : "#fff"}" stroke-width="2">${shape}</svg>`;
}

export function StatusIcon({ status, className = "size-4" }: { status: Status; className?: string }) {
  return <span className={`inline-block shrink-0 ${className}`} dangerouslySetInnerHTML={{ __html: markerSvg(status) }} />;
}

function Badge({ cls, children }: { cls: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>
      {children}
    </span>
  );
}

export const StatusBadge = ({ status }: { status: Status }) => (
  <Badge cls={STATUS[status].cls}>
    <StatusIcon status={status} className="size-3" />
    {status}
  </Badge>
);

const SEVERITY: Record<Severity, string> = {
  Critical: "bg-rose-600 text-white ring-rose-700",
  Warning: "bg-amber-100 text-amber-900 ring-amber-500/40",
  Info: "bg-sky-50 text-sky-800 ring-sky-600/30",
};
export const SeverityBadge = ({ severity }: { severity: Severity }) => <Badge cls={SEVERITY[severity]}>{severity}</Badge>;

const WORKFLOW: Record<Workflow, string> = {
  New: "bg-sky-600 text-white ring-sky-700",
  Acknowledged: "bg-amber-50 text-amber-800 ring-amber-600/30",
  Resolved: "bg-emerald-50 text-emerald-800 ring-emerald-600/30",
};
export const WorkflowBadge = ({ workflow }: { workflow: Workflow }) => <Badge cls={WORKFLOW[workflow]}>{workflow}</Badge>;

const DOC: Record<DocStatus, string> = {
  Valid: "bg-emerald-50 text-emerald-800 ring-emerald-600/30",
  Expiring: "bg-amber-100 text-amber-900 ring-amber-500/40",
  Expired: "bg-rose-600 text-white ring-rose-700",
};
export const DocBadge = ({ status }: { status: DocStatus }) => <Badge cls={DOC[status]}>{status}</Badge>;

export const Tag = ({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "rose" | "emerald" | "violet" }) => {
  const tones = {
    slate: "bg-slate-100 text-slate-700 ring-slate-400/30",
    rose: "bg-rose-50 text-rose-800 ring-rose-600/30",
    emerald: "bg-emerald-50 text-emerald-800 ring-emerald-600/30",
    violet: "bg-violet-50 text-violet-800 ring-violet-600/30",
  };
  return <Badge cls={tones[tone]}>{children}</Badge>;
};

/** Native modal dialog: focus containment, Esc and focus return come from the browser. */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="modal-title"
      className="m-auto w-[min(560px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] rounded-xl bg-white p-0 text-slate-900 shadow-2xl"
    >
      {open && (
        <>
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <h2 id="modal-title" className="text-base font-semibold">
              {title}
            </h2>
            <button type="button" onClick={onClose} className={`${btn} -mr-2 px-2 text-slate-500 hover:text-slate-900`} aria-label="Close dialog">
              ✕
            </button>
          </div>
          <div className="px-5 py-4">{children}</div>
        </>
      )}
    </dialog>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const ErrorText = ({ children }: { children: ReactNode }) =>
  children ? (
    <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
      {children}
    </p>
  ) : null;
