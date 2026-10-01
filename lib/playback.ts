import { fmtHm } from "./format";
import { zonesAt } from "./rules";
import type { LatLng, Point, Zone } from "./types";

/** Playback has its own cursor; it never writes to live state. */
export type Playback = { start: number; end: number; cursor: number; playing: boolean; rate: 1 | 2 | 4 | 8 };

export const GAP_MS = 150_000;

export function playbackView(points: Point[], pb: Playback, zones: Zone[], now: number) {
  const end = Math.min(pb.end, now); // never report the future as a gap
  const pts = points.filter((p) => p.t >= pb.start && p.t <= end);
  const segments: LatLng[][] = [];
  const gaps: [number, number][] = [];
  const marks: { at: LatLng; label: string }[] = [];
  let prevZones: string[] = [];
  pts.forEach((p, i) => {
    const prev = pts[i - 1];
    if (!prev || p.t - prev.t > GAP_MS) {
      segments.push([]);
      if (prev) gaps.push([prev.t, p.t]);
    }
    segments[segments.length - 1].push([p.lat, p.lng]);
    const inZones = zonesAt(zones, p.lat, p.lng);
    if (prev)
      for (const z of zones)
        if (prevZones.includes(z.id) !== inZones.includes(z.id))
          marks.push({ at: [p.lat, p.lng], label: `${inZones.includes(z.id) ? "Entered" : "Left"} ${z.name} · ${fmtHm(p.t)}` });
    if (prev && prev.speedKph > 2 && p.speedKph <= 2) marks.push({ at: [p.lat, p.lng], label: `Stopped · ${fmtHm(p.t)}` });
    prevZones = inZones;
  });
  if (pts.length && pts[0].t - pb.start > GAP_MS) gaps.unshift([pb.start, pts[0].t]);
  if (pts.length && end - pts[pts.length - 1].t > GAP_MS) gaps.push([pts[pts.length - 1].t, end]);

  let cursor: Point | null = null;
  for (const p of pts) {
    if (p.t > pb.cursor) break;
    cursor = p;
  }
  if (cursor && pb.cursor - cursor.t > GAP_MS) cursor = null; // inside a telemetry gap
  return { pts, segments, gaps, marks, cursor };
}
