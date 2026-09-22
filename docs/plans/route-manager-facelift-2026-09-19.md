# Route Manager facelift — 2026-09-19

Status: **BUILT 2026-09-22 (branch `estimator-library`, uncommitted at
write time) — Phases 1, 2, 4 in full, Phase 3 desktop in full, Phase 3 phone
as an in-page snap sheet; tsc clean. Waiting on `NEXT_PUBLIC_MAPBOX_TOKEN`
on both Railway environments (without it every map falls back to OSM / Esri
exactly as before) and David's device pass on staging.** Trigger: David — "it
currently looks like a cheap map slapped on the software, rather than being
embedded nicely."

Scope: the look and feel of `/app/schedule/map` (Routes) and, where the same
code is shared, `/app/team-map`. Routing logic, optimisation, drag-to-reorder,
reassign, Navigate links and the Mapbox spend guard are NOT touched — they
shipped in `scheduling-and-routes-2026-09-09.md` and work.

Files: `app/platform/schedule/map/RouteMapClient.tsx` (1,507 lines, one
component), `app/platform/team-map/TeamMapClient.tsx`, `lib/mapbox-budget.ts`,
`components/BottomSheet.tsx`, `app/globals.css` (`.card-ledger`).

## Why it reads as "slapped on" (diagnosis at da689a4)

| # | Cause | Where |
|---|---|---|
| 1 | **Stock OpenStreetMap tiles.** The default OSM raster (yellow roads, dense labels at every zoom, no retina variant) with a mild `saturate(0.55)` filter. This is the single biggest reason it looks cheap. | `RouteMapClient.tsx:414` tile layer; `:870` filter. Same line in `TeamMapClient.tsx:64`. |
| 2 | **Leaflet's default chrome.** Stock zoom buttons (lightly restyled), the attribution strip, and speech-bubble popups carrying job links. Nothing else in Workbench looks like this. | `:412` `zoomControl: true`; `:453/:484/:541` `bindPopup`; `:871-884` popup overrides. |
| 3 | **The map lives inside a card.** It is a `card-ledger` box (border, radius, shadow) beside a card list, 44 dvh tall on phones, `calc(100dvh-15.5rem)` on desktop. It reads as an iframe dropped into a page. | `:1019` container; `:1033` list column. |
| 4 | **Cold start.** Opens centred on the whole US at zoom 4, then jumps to the route when data arrives. Tiles pop in with no fade. | `:410-411`. |

What already works and carries over: custom `divIcon` pins numbered in crew
colours (`:843-866`), white-cased road polylines with a dashed fallback
(`:495-498`), the live tech pulse marker, the marker→row map
(`markersRef`, `:490`), haptics, print stylesheet.

## Target

The map is the page. Controls, chips and the stop list float over it in the
Workbench visual language (tool buttons, ledger cards, navy/blue tokens).
Tiles are quiet and brand-tinted so the crew-coloured routes are the loudest
thing on screen. Tapping a pin selects a stop in the list; there are no
speech bubbles. On a phone the map fills the top of the screen and the stops
live in a bottom sheet. First paint is already framed on the company's day.

## Phases (each ships on its own; order is by visual gain per hour)

### Phase 1 — Basemap swap (≈ ½ day) ← do first

The single change that removes most of the "cheap" feeling.

- New `lib/basemap.ts` exporting `addBasemap(L, map)` used by BOTH map
  clients, so they can never drift apart again.
- Tiles: Mapbox Static Tiles (raster) through Leaflet —
  `https://api.mapbox.com/styles/v1/{style}/tiles/512/{z}/{x}/{y}@2x?access_token=…`
  with `tileSize: 512, zoomOffset: -1`. Retina for free, which matters on
  phones where the current OSM tiles are visibly soft.
- Style: start with `mapbox/light-v11`; then a Workbench style in Mapbox
  Studio — greys pulled toward `--wb-primary` (#0A1428) at low opacity, water
  a desaturated `--wb-accent`, POI labels hidden below z14, road casing
  thinned. Save the style URL as `NEXT_PUBLIC_MAPBOX_STYLE` so it can change
  without a deploy.
- Token: a **public** `pk.` token, URL-restricted to workbenchfsm.com, the
  staging domain and localhost, in `NEXT_PUBLIC_MAPBOX_TOKEN`. It is inlined
  at build time, so it goes on BOTH Railway environments before the push.
  Client-side tile fetches cannot pass through `lib/mapbox-budget.ts`
  (that guard meters server calls), so the protection is the URL
  restriction plus a Mapbox usage alert at 80 % of the Static Tiles free
  allowance. Check the current allowance on the Mapbox pricing page before
  flipping; if it is too tight, Stadia Maps "Alidade Smooth" or MapTiler
  "Dataviz Light" are drop-in raster alternatives with the same Leaflet line.
- Fallback: when the token is missing the helper returns the OSM layer
  exactly as today, so local dev and a revoked token never break the page.
- Drop the `saturate()` filter once the new tiles are in; keep
  `updateWhenIdle: true` and add `className: "route-tile"` with a 200 ms
  opacity fade.
- Attribution: Mapbox requires their wordmark + attribution visible. Keep it,
  but at the compact size already used (`:884`).

Acceptance: both maps on staging show the new tiles at 1x and 2x; a request
with the token from a foreign origin is refused (curl with a wrong
`Origin`); removing the env var falls back to OSM with no console errors.

### Phase 2 — Own the chrome (≈ ½ day)

- `zoomControl: false`. Render a control cluster in React over the map's
  top-right: zoom in / out, "Fit route", "Locate me" (mobile), and the
  existing print / share actions moved out of the header. Style with
  `btn-tool-line` on a translucent `bg-white/85 backdrop-blur` pill so it
  reads as the same family as the schedule tools.
- Replace `bindPopup` with selection. Marker click → `setSelectedStop(key)`
  → the stop row scrolls into view and gets the `--wb-accent` hairline; the
  pin scales to 1.15 and drops a soft shadow; the row's own Open / Navigate
  buttons take over the popup's links (they already exist in the list).
  Popups stay ONLY for the live tech marker, restyled as a small ledger
  card.
- Attribution stays; the "N on the clock · live" badge moves into the
  control cluster's bottom edge so there is one overlay system, not two.
- Loading: replace the white 60 % scrim + spinner with a skeleton shimmer on
  the tile layer and a thin progress bar under the chips, matching the rest
  of the app's list loading.

Acceptance: no Leaflet default UI visible except attribution; keyboard users
can still zoom (buttons are real `<button>`s); `e2e/specs/schedule-tools.spec.ts`
still green.

### Phase 3 — Full-bleed layout (≈ 1 day)

Desktop (`lg+`):
- The map fills the content area edge to edge (no `card-ledger` border,
  radius or shadow; negative-margin out of the page padding, height =
  viewport minus app header). The section title and date / crew chips float
  top-left on the same translucent pill as the controls.
- The stop list becomes a 380 px floating panel over the left edge
  (`bg-white/92 backdrop-blur`, `card-ledger` hairline, its own scroll),
  with a collapse handle so the map can go full width. Unscheduled tray
  stays at the top of the panel.
- `fitBounds` padding accounts for the panel (`paddingTopLeft: [400, 80]`)
  so routes never hide behind it.

Phone:
- Map fills the viewport under the app bar. Stops move into
  `components/BottomSheet.tsx` with two snap points: peek (crew header +
  next stop, ≈ 96 px) and half (≈ 55 dvh). Dragging a pin's row still
  reorders; drag onto another crew card still reassigns (verify with the
  sheet's touch handling — `touch-none` on the grip already exists).
- Chips collapse into a single "Today · 2 crews" pill that opens the
  existing filter chips in the sheet.

Print: unchanged. The print stylesheet already hides the map and expands the
list (`:886-890`); keep `.route-list` as the print root.

Acceptance: David's phone pass on staging; drag-reorder and reassign still
work in the sheet; landscape phone does not trap the sheet over the map.

### Phase 4 — First paint and motion (≈ ½ day)

- Initial view: the company's geocoded address (`lib/geocoding.ts` cache) at
  z11, or yesterday's route bounds if there is one, set BEFORE the first
  tile request. No more US-at-z4 flash.
- Route draw: when a plan loads or is re-optimised, draw each polyline with
  the same stroke-dash reveal used by the route-draw banner elsewhere
  (≈ 600 ms, staggered per crew). Pins drop in with a 120 ms scale-in.
- Selected / hovered stop in the list highlights the matching pin and
  segment; other crews dim to 40 % while one is selected.
- Respect `prefers-reduced-motion` for all of the above.

### Phase 5 — Later: vector tiles (1–2 days, when the above has settled)

Move both maps from Leaflet raster to MapLibre GL with vector tiles
(Mapbox vector or self-hosted Protomaps on R2). Gains: smooth fractional
zoom, crisp labels at any DPR, map rotation / bearing for "driver view",
a fully brand-owned style with Workbench type, and zero per-tile cost if
self-hosted. Cost: pins, polylines and the drag interactions are rewritten
against MapLibre's API. Only worth it once Phases 1–4 prove people use the
map enough to notice.

## Decisions for David (pick once)

1. Tile provider: **Mapbox** (recommended: account, billing and spend
   discipline already exist) vs Stadia / MapTiler (separate account, own
   free tier).
2. Full-bleed on desktop, or keep a hairline frame inside the page padding?
   Recommended: full-bleed; the rest of Schedule keeps its cards.
3. Bottom sheet peek height on phones: next stop only, or the whole current
   crew?

## Verification per phase

- Staging deploy, then David's device pass (iPhone in the App Store shell,
  Android internal track, desktop Chrome + Safari).
- `npm run test:unit` and the staging e2e gate (`schedule-tools`,
  `jobs-scheduling`) stay green; no new spec is required for a visual
  change, but Phase 3 should add one assertion that the stop list still
  renders on a 390 px viewport.
- Mapbox dashboard after one week: Static Tiles usage vs allowance.

## Out of scope

Traffic layer, live ETA, smart slots, offline tiles, dark-mode basemap
(the app has no dark theme yet; the Studio style can gain a dark twin then).

## Progress log (append as phases ship)

- 2026-09-19 — plan written from a read of `RouteMapClient.tsx` at da689a4.
- 2026-09-22 — BUILT (maps fork, branch `estimator-library`), all three maps at once:
  - **Phase 1**: new `lib/basemap.ts` (`basemapLayer` / `addBasemap` /
    `createLayers` + `initialView` / `rememberView` / `reducedMotion`).
    Mapbox Static Tiles 512@2x through Leaflet (`tileSize: 512, zoomOffset:
    -1`), streets `mapbox/light-v11` (maxZoom 20), satellite
    `mapbox/satellite-streets-v12` (maxZoom 22), Mapbox + OSM (+ Maxar)
    attribution, Leaflet prefix off, `.wb-tile` fade. Env:
    `NEXT_PUBLIC_MAPBOX_TOKEN` / `NEXT_PUBLIC_MAPBOX_STYLE` /
    `NEXT_PUBLIC_MAPBOX_SATELLITE_STYLE` (`.env.local.example` says how to
    mint the pk. token: styles:tiles + styles:read, URL-restricted, on BOTH
    Railway envs before the push — build-time inlined). No token → OSM streets /
    Esri imagery exactly as before, no console errors. Used by
    `RouteMapClient`, `TeamMapClient` AND `components/MapMeasure.tsx` (the
    estimate tools' tracer — its graininess was Esri's native z19 overzoomed to
    21 on 256 px non-retina tiles; the 512@2x Mapbox imagery is the fix, and
    the tracer keeps every Batch 9 behaviour). Dropped the `saturate()` filter.
  - **Phase 2**: `zoomControl: false` everywhere; a React control cluster
    top-right (zoom ± / Fit route / My location on phones / Calendar / Print on
    desktop) on `.wb-map-glass` pills with `.wb-map-ctl` buttons (globals.css,
    shared by all three maps); the "N on the clock · live" badge rides under
    the cluster. Stop pins no longer `bindPopup` — a tap selects
    (`selected` key `userId:stopId`), the row scrolls into view with an accent
    hairline (`.route-row-selected`), the pin scales 1.15 with a shadow; the
    row's Open / Go buttons replace the popup links. Only the live tech marker
    keeps a popup, restyled as a ledger card (`.route-live-pop`). Loading =
    `.wb-map-skeleton` shimmer over the tiles + `.wb-map-progress` hairline,
    no white scrim.
  - **Phase 3 desktop**: the map fills `<main>` (`h-full`, no page padding, no
    card chrome); the title + day nav + crew select float top-left on a glass
    pill; the stop list is a 380 px floating panel (`.route-dock`, own scroll,
    collapse handle → a "N stops · M crews" reopen tab); `fitBounds` pads
    `[PANEL_W + 40, 88]` top-left so routes never hide behind it.
  - **Phase 3 phone**: map edge to edge; the SAME dock element becomes a bottom
    sheet with peek (112 px) / half (55 %) / full snap points, grip drag or tap
    (keyboard too), height via `--dock-h` so desktop is untouched. NOT
    `components/BottomSheet.tsx`: that one is a modal (backdrop, closes on
    tap, `lg:hidden` only) — a persistent peek sheet needs its own element.
    Drag-to-reorder / reassign are unchanged (same pointer capture +
    `elementFromPoint`, `touch-none` grips; the sheet grip stops propagation
    from the crew select). A pin tap lifts a peeking sheet to half; a row tap
    on a full sheet drops it to half so the pin shows. Crew select lives in the
    sheet head on phones. Print keeps `.route-list` as the root (dock/stage
    reset to static).
  - **Phase 4**: first paint = company address at z11 (page.tsx now passes
    `home` from `Company.lat/lng`) → last map view (`wb.map.lastView`, shared
    with the tracer) → US; the first `fitBounds` is `animate: false`. Road
    lines draw with a stroke-dash reveal (600 ms, +120 ms per crew; dashed
    fallback lines fade in); pins scale in over 120 ms staggered; hover /
    selection highlights the stop's pin + crew line and dims other crews to 40 %
    (`.is-dim` on markers and `.route-line` paths). Every animation checks
    `prefers-reduced-motion`.
  - Team map: same basemap, cluster (zoom ± / Fit the team), progress hairline,
    `initialView` from the last map view, escaped popup HTML, `h-full` instead
    of the dvh hack.
  - Owed: David's device pass (iPhone shell, Android, desktop Chrome + Safari)
    on staging with the token set; a 390 px assertion that the stop list still
    renders (sheet at half) can join `schedule-tools.spec.ts` then. Phase 5
    (vector tiles) untouched. A Workbench Studio style is a later swap of
    `NEXT_PUBLIC_MAPBOX_STYLE`.
- 2026-09-22 (later) — David after the release: "nothing is loading" on
  Routes and the team map. Cause: both pages sized their root with `h-full`
  inside the shell's flex-column `<main>`, which collapsed to 0 (the old
  pages used `calc(100dvh - …)` guesses for this reason). Fix:
  `lib/use-main-fill.ts` measures `<main>` (ResizeObserver) and sets the
  root height in px, then calls `invalidateSize()`. `NEXT_PUBLIC_MAPBOX_TOKEN`
  was still unset on both Railway envs, so the tracer was on Esri fallback
  tiles — the grain is expected until the token lands.
- 2026-09-22 (evening) — David on the phone's dark theme: white-on-white on
  Routes. The dark bridge remaps `.bg-white` / `.text-gray-900` but the glass
  pills, dock, popups and attribution were hard-coded white → dark-mode rules
  for `.wb-map-glass`, `.wb-map-ctl`, popups, attribution, skeleton in
  globals.css. Still grainy: the token was STILL not on Railway (nothing
  named NEXT_PUBLIC_MAPBOX_TOKEN on either env). Probed Esri for Allen, TX:
  real tiles at z20 and z21 — the fallback's flat `maxNativeZoom: 19` was
  the grain. `tuneSatelliteLayer()` in lib/basemap.ts now probes Esri for
  the deepest real zoom around the view (19–21, cached per ~1 km cell) and
  raises the layer's native zoom, so the tracer is sharp where Esri has the
  detail, token or no token. Higher-quality options if it's still not
  enough: Google's Map Tiles API satellite (best suburban coverage, billed
  per tile, Google-branded), or Nearmap / EagleView (roofing-grade
  aerials, enterprise contracts).
