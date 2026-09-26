# App Store screenshots

`slides.html` renders WorkBench's App Store screenshots: six slides at
1290 x 2796 (the 6.9"/6.7" iPhone slot), each a different composition in the
brand (2026-09-26, David: "different designs … rather than basically the same
thing each time with different words"):

1. Hero on the site's bloom — headline, phone straight on, two floating cards.
2. Navy band — tilted phone, "right now" card, feature pills.
3. Blue diagonal split — two overlapping phones (jobs list + job detail).
4. Graph paper — phone with three orange stat callouts.
5. Dark mode — the dark theme on a near-black slide, Light / Dark / Automatic.
6. Closing on the blue — the free promise, tilted phone, App Store badge.

## Screens

`screens/*.png` are real captures at 3x (1170 x 2532) from the app, taken by
`capture.mjs` against a running instance:

```
BASE=http://localhost:3077 EMAIL=… PASSWORD=… node marketing/app-store/capture.mjs
```

Locally that's the throwaway Postgres + `scripts/local-seed.mts` company
(Knight Light Electric); against staging, use an account there. The script
removes the dev "issue" badge and waits for the reveal animations to settle.

## Render

```
node marketing/app-store/render.mjs ["C:/Users/you/Downloads/WorkBench App Store screenshots"]
```

Serves the repo root on 127.0.0.1:3012, renders `slides.html?s=1…6` in Edge
via Playwright and writes `workbench-1.jpg … workbench-6.jpg` (JPEG — App
Store Connect rejects PNGs with an alpha channel). Last output:
`~/Downloads/WorkBench App Store screenshots 2026-09-26/`.

## Copy

Headlines, cards, pills and callouts are in `slides.html` itself. Every
claim must describe something the app really does (the site's rule), and the
numbers match the demo data in the captures.
