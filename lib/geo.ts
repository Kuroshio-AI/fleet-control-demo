import { ROUTES, type LatLng } from "./routes";

const R = 6371000;
const rad = Math.PI / 180;

export function distM(a: LatLng, b: LatLng): number {
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearing(a: LatLng, b: LatLng): number {
  const y = Math.sin((b[1] - a[1]) * rad) * Math.cos(b[0] * rad);
  const x =
    Math.cos(a[0] * rad) * Math.sin(b[0] * rad) -
    Math.sin(a[0] * rad) * Math.cos(b[0] * rad) * Math.cos((b[1] - a[1]) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

/** Shift a point by a few metres east/north (parking-bay offsets). */
export function offsetM([lat, lng]: LatLng, eastM: number, northM: number): LatLng {
  return [lat + northM / 110540, lng + eastM / (111320 * Math.cos(lat * rad))];
}

export type Path = { pts: LatLng[]; cum: number[]; length: number; loop: boolean };

export function makePath(pts: LatLng[], loop: boolean): Path {
  const p = loop && distM(pts[0], pts[pts.length - 1]) > 1 ? [...pts, pts[0]] : pts;
  const cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + distM(p[i - 1], p[i]));
  return { pts: p, cum, length: cum[cum.length - 1], loop };
}

/** Position and heading at distance d along a path (wraps on loops, clamps otherwise). */
export function pointAt(path: Path, d: number): { pos: LatLng; heading: number } {
  const { pts, cum, length } = path;
  const x = path.loop ? ((d % length) + length) % length : Math.min(Math.max(d, 0), length);
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= x) lo = mid;
    else hi = mid;
  }
  const f = (x - cum[lo]) / (cum[hi] - cum[lo] || 1);
  const a = pts[lo];
  const b = pts[hi];
  return { pos: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], heading: bearing(a, b) };
}

export const PATHS: Record<string, Path> = Object.fromEntries(ROUTES.map((r) => [r.id, makePath(r.pts, r.loop)]));
