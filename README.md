# Fleet Control — Demonstration

A browser-only demo of fleet-management workflows. It shows 50 **simulated** vehicles on a control-room map, an alert workflow, route playback, a maintenance work order and compliance renewals, with CSV export.

Every vehicle, driver, document, site, route and threshold is synthetic. The demo has no live GPS connection, no backend and no login. It does not prove production readiness, device compatibility or capacity.

## Run it

Requirements: [Bun](https://bun.sh) 1.3+ and Node.js 20.9+ (tested with Node 25).

```bash
bun install
bun run dev        # http://localhost:3000
```

| Script | What it does |
| --- | --- |
| `bun run check` | Type-check, rule tests and static build. Run this before every deploy. |
| `bun test` | Rule tests: seed counts, status partition, geofence, overspeed, maintenance, renewal, CSV. |
| `bun run build` | Static export to `out/` (`output: 'export'`). |
| `bun run preview` | Serves `out/` on http://127.0.0.1:4173. Needs only Python 3, so it also works offline. |

## Deploy

The build is plain static files, so any static host works.

- **Vercel:** run `vercel deploy --prod` from the repo root. The Next.js preset detects the static export. No environment variables are needed.
- **Cloudflare Pages:** use the "Next.js (Static HTML Export)" preset with build command `npx next build` and output directory `out`. You can also upload `out/` directly.

To show an optional "presented by" line under the title, set `NEXT_PUBLIC_PRESENTED_BY` at build time.

## Presenter quick-run (about 8 minutes)

1. **Before you start:** click **Reset demo**, then set **16×** so vehicles visibly move at fleet zoom.
2. **Control Room:** show the 50 vehicles. Filter by category or status from the KPI tiles; "Showing N of 50" sits next to the filters.
3. **Vehicle and playback:** search `LB-003`. Open it, then **History** → **Play** or drag the scrubber.
4. **Bus leaves depot:** open **Demo controls** and run **Bus leaves depot**. One geofence-exit alert appears. Acknowledge it, then resolve it.
5. **Maintenance:** in **Demo controls**, run **Service due** for `DEMO-HV-017`.
   1. Click **Create work order** and save it. On the workshop board the card moves from **Due for service** to **Scheduled**, and **Fleet in service** drops to 94%.
   2. Click **Start work** on the card. It moves to **In workshop**.
   3. Open **Costs, quality check and release**, enter parts and labour, tick the three checklist items and add completion notes.
   4. Click **Complete and release**. The card lands in **Released today**, and the banner shows the next service date. On the Control Room the status counts move 30/7/8/3/2 → 30/7/7/3/3 → back.
   5. Point at **Service forecast** (who is due next) and **Repair history** (the seeded breakdown repair).
6. **Compliance:** filter to **Expired** and click **Record demo renewal** on `DEMO-HV-020` insurance. The default date is one year later.
7. **Close:** export a filtered fleet CSV.

Other scenarios: **Overspeed example** (`DEMO-HV-007`) and **Restore device** (`DEMO-SUV-002`).

## Offline fallback

1. Before the meeting, run `bun run build`.
2. If the network fails, run `bun run preview`.
3. If map tiles cannot load, the map switches itself to a schematic grid. You can also switch it in **Demo controls** to rehearse.

Changes persist in this browser's local storage. Each browser or device runs its own independent demo, with no sync between them.

## How it works

The code is split into plain TypeScript logic and the React UI:

- **Logic (`lib/`):**
  - `seed.ts`: the deterministic fleet, documents, work orders and 60-minute history.
  - `sim.ts`: one movement model; telemetry comes in through a `TelemetrySource` seam.
  - `rules.ts`: status precedence, availability, geofence, overspeed and expiry rules.
  - `store.ts`: the reducer and validation.
  - `storage.ts`: versioned local storage.
  - `csv.ts`: the exports.
- **UI:** `components/` and `app/` hold React and Leaflet only. Every total on screen is derived from the shared records.
- **Map data:** route lines are illustrative. They were generated once from the public OSRM demo router using OpenStreetMap data (© OpenStreetMap contributors) and are not validated routing. Basemap tiles come from OpenStreetMap under its tile usage policy.
