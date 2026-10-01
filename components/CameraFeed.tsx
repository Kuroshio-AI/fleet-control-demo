import { useEffect, useRef } from "react";
import { useDemo } from "./DemoProvider";
import { dubaiDate, fmtTime } from "@/lib/format";
import { MOVING_ABOVE_KPH } from "@/lib/rules";

// Stand-in footage: one stock drive near Abu Dhabi (Pexels videos 5038128–5038130, free licence),
// joined into a silent 24 s loop. Each fitted vehicle starts at a different point (seconds).
const CLIP = "/video/road-camera.mp4";
export const CAMERAS: Record<string, number> = { "DEMO-HV-001": 0, "DEMO-HV-007": 8, "DEMO-LB-001": 17, "DEMO-SB-001": 12 };

/** Sample road-camera feed: rolls while the vehicle moves, faster or slower with its speed. */
export function CameraFeed({ id }: { id: string }) {
  const { s } = useDemo();
  const v = s.vehicles[id];
  const ref = useRef<HTMLVideoElement>(null);
  const paused = s.clock.paused;
  const rolling = !paused && v.speedKph > MOVING_ABOVE_KPH;

  useEffect(() => {
    const el = ref.current!;
    el.playbackRate = Math.min(1.5, Math.max(0.5, v.speedKph / 70));
    if (rolling && !matchMedia("(prefers-reduced-motion: reduce)").matches) el.play().catch(() => {});
    else el.pause();
  }, [rolling, v.speedKph]);

  return (
    <figure>
      <div className="relative aspect-video overflow-hidden rounded-md bg-navy ring-1 ring-slate-300">
        <video
          ref={ref}
          src={`${CLIP}#t=${CAMERAS[id]}`}
          muted
          loop
          playsInline
          preload="auto"
          aria-label="Sample road-camera footage"
          className="size-full object-cover"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex flex-col justify-between bg-[linear-gradient(rgb(0_0_0/0.45),transparent_30%,transparent_70%,rgb(0_0_0/0.5))] p-2 font-mono text-[10.5px] font-medium uppercase leading-none tracking-wide text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]"
        >
          <div className="flex justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <i className={`size-1.5 rounded-full ${paused ? "bg-amber-400" : "animate-pulse bg-rose-500 motion-reduce:animate-none"}`} />
              {paused ? "Paused" : "Live"} · CH1 Road
            </span>
            <span>{id}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span>{v.speedKph} km/h</span>
            <span>
              {dubaiDate(s.clock.now)} {fmtTime(s.clock.now)}
            </span>
          </div>
        </div>
      </div>
      <figcaption className="mt-1.5 text-xs text-slate-500">Stock clip standing in for this vehicle&apos;s road camera.</figcaption>
    </figure>
  );
}
