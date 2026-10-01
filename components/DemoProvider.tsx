"use client";

import { createContext, use, useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { createSeed } from "@/lib/seed";
import { reducer, VIEW_ACTIONS, type Action } from "@/lib/store";
import { buildViews, type VehicleView } from "@/lib/rules";
import { TICK_MS } from "@/lib/sim";
import { demoAnchor } from "@/lib/format";
import { clearSaved, loadSaved, save } from "@/lib/storage";
import type { State } from "@/lib/types";

export type StorageMode = "saved" | "session" | "incompatible";

type Demo = {
  s: State;
  dispatch: (a: Action) => void;
  views: Map<string, VehicleView>;
  storage: StorageMode;
  restored: boolean;
  reset: () => void;
};

const DemoContext = createContext<Demo | null>(null);

export function useDemo(): Demo {
  const demo = use(DemoContext);
  if (!demo) throw new Error("useDemo must be used inside <DemoProvider>");
  return demo;
}

type RootAction = Action | { type: "INIT"; state: State };
const root = (s: State | null, a: RootAction): State | null => (a.type === "INIT" ? a.state : s && reducer(s, a));

const SAVE_TELEMETRY_EVERY_MS = 15_000;

export function DemoProvider({ children }: { children: ReactNode }) {
  const [s, rawDispatch] = useReducer(root, null);
  const [storage, setStorage] = useState<StorageMode>("saved");
  const [restored, setRestored] = useState(false);
  const businessDirty = useRef(true);
  const lastSave = useRef(0);

  const dispatch = useCallback((a: Action) => {
    if (!VIEW_ACTIONS.has(a.type)) businessDirty.current = true;
    rawDispatch(a);
  }, []);

  // Built after mount: the demo date comes from the viewer's clock, not the build machine's.
  useEffect(() => {
    const saved = loadSaved();
    if (saved.kind === "ok") {
      const st = saved.state as State;
      rawDispatch({ type: "INIT", state: { ...st, history: createSeed(st.clock.anchor).history, clock: { ...st.clock, paused: true } } });
      setRestored(true);
    } else {
      rawDispatch({ type: "INIT", state: createSeed(demoAnchor(Date.now())) });
    }
    setStorage(saved.kind === "unavailable" ? "session" : saved.kind === "incompatible" ? "incompatible" : "saved");
  }, []);

  // One engine for the whole app. Hidden tabs skip ticks, so the demo clock freezes without a catch-up jump.
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) rawDispatch({ type: "TICK" });
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Business actions save immediately; telemetry snapshots at most every 15 s.
  useEffect(() => {
    if (!s || storage === "incompatible") return;
    const now = Date.now();
    if (!businessDirty.current && now - lastSave.current < SAVE_TELEMETRY_EVERY_MS) return;
    businessDirty.current = false;
    lastSave.current = now;
    if (!save(s)) setStorage("session");
  }, [s, storage]);

  const reset = useCallback(() => {
    const cleared = clearSaved();
    businessDirty.current = true;
    rawDispatch({ type: "INIT", state: createSeed(demoAnchor(Date.now())) });
    setRestored(false);
    setStorage(cleared ? "saved" : "session");
  }, []);

  const views = useMemo(() => (s ? buildViews(s) : new Map<string, VehicleView>()), [s]);

  if (!s) return <p className="p-6 text-sm text-slate-500">Loading demo…</p>;
  return <DemoContext value={{ s, dispatch, views, storage, restored, reset }}>{children}</DemoContext>;
}
