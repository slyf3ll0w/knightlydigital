# App Store screenshots

`slides.html` renders WorkBench's App Store screenshots in the marketing
site's look (Nunito headline, blue/orange, a job-site photo, the real app
screenshot in a phone frame with a magnified close-up, a status chip, and the
hand-drawn arrow). Six slides, 1290 x 2796 (the 6.9"/6.7" iPhone slot).

## Render

1. Serve the repo root over HTTP (browsers block `file://` fonts/images), e.g.
   `npx http-server . -p 3012` or any static server.
2. Open `http://127.0.0.1:3012/marketing/app-store/slides.html?s=1` in a
   1290 x 2796 viewport (Playwright: `setViewportSize`), wait for
   `document.body.dataset.ready === "1"` and the images, screenshot as JPEG
   (App Store Connect rejects PNGs with an alpha channel). Repeat `s=2…6`.

Output from 2026-09-25: `~/Downloads/WorkBench App Store screenshots/`.

## Sharper screens

The phone screens come from `public/screens/mobile-0*.png`, which are only
640 px wide, so they are upscaled about 1.1x on a slide. For crisper slides,
take fresh screenshots on an iPhone (Schedule week view, Invoices, Quotes,
Jobs, Clients, Insights) of the demo company, drop them in, and update each
slide's `shot`, the `SRC_W`/`SRC_H` constants, and the `zoom` region (in the
new file's pixels).

## Copy

Headlines, sublines, chips and arrow notes live in the `SLIDES` array. Every
chip must describe something the app really does (see the site's rule on
claims); the numbers shown match the demo data in the screenshots.
