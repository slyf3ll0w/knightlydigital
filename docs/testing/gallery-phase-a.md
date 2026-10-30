# Gallery plan — phase A test recipes (2026-10-30)

What shipped in phase A (plan: `docs/plans/job-photos-companycam-2026-09-25.md`,
"2026-10-20 reframe"): one photo across the lifecycle. Photos on quotes
(Estimate), on jobs (Before / During / After / Photo), stamped with who, when
and where, a full-screen viewer with caption / stage / client visibility,
thumbnails, and estimate photos riding onto the job when the quote converts.
Automated: `npm run e2e -- photos` and `npx tsx scripts/test-photos.ts`.

**Preview only:** all of this shows up for **test accounts** (superadmin
"Test" flag) until David opens it (`GALLERY_OPEN=1`). A live account still
sees the old job uploader and no Photos fold on quotes — check that too.

Run these on **staging** on a phone (the iPhone or Android app, or the site in
a phone browser) and once on desktop. Every step has an **Expect** line; a
mismatch is a finding.

## 1. Take a photo on a job (phone)

1. Open any scheduled job → **Photos** fold.
2. Pick **After** in the stage picker, then **Take photo** (app) or **Add
   photos** (browser) and shoot something.
   - **Expect:** the thumbnail appears within a couple of seconds with an
     `After` pill; the fold header count goes up; a small eye icon sits on the
     tile (the client can see After shots by default).
3. Switch the picker to **Before** and add a photo from the library.
   - **Expect:** `Before` pill, no eye icon (hidden from the client until you
     say otherwise). If the library photo was taken more than ten minutes
     ago it carries **no** map pin; a shot taken just now does.
4. Above the grid, tap **Before** / **After** / **All**.
   - **Expect:** the tabs filter the grid and each tab shows its count.

## 2. The viewer

1. Tap a thumbnail.
   - **Expect:** full-screen black viewer, "1 of N" at the top, the stage pill
     and caption line at the bottom, then who took it and when, and **View
     on map** when the shot was located.
2. Swipe left / right (desktop: arrow keys or the chevrons).
   - **Expect:** moves between photos; swiping past the last does nothing.
3. Pinch to zoom, drag to pan, double-tap to reset (desktop: scroll wheel).
4. Tap the caption line → type "Panel closed up" → Save.
   - **Expect:** the caption shows in the viewer and later under the grid tile's alt text.
5. **Stage** → pick **During**.
   - **Expect:** the pill changes to `During`; the grid tile follows.
6. **Hidden from client** / **Client sees it** toggles.
   - **Expect:** the label flips and the eye icon appears / disappears on the tile.
7. As an owner: **Use on website** → confirm.
   - **Expect:** a globe icon on the tile; Settings → Website lists the photo. Toggle it back off.
8. **Delete** → confirm.
   - **Expect:** the viewer moves to the next photo (or closes on the last one); the tile is gone.

## 3. Photos on a quote (estimate photos)

1. Open a draft quote → **Photos** fold (below the line items).
   - **Expect:** no stage picker — every photo here is an `Estimate` photo.
     On a Core account with `PLAN_GATING=1` live, the fold shows the
     "Gallery is coming soon" card instead (test accounts always get through).
2. Add two photos.
   - **Expect:** `Estimate` pills, hidden from the client by default.
3. Send the quote, approve it as the client, then **Convert to job**.
4. Open the job → Photos.
   - **Expect:** both estimate photos are there with `Estimate` pills, and the
     **Before** tab counts them (estimate photos are the job's before set).
     The quote page still shows them too.

## 4. Retry safety and bad input

1. Turn on airplane mode mid-upload (or throttle the network) and retry the same shot.
   - **Expect:** at most one copy of the photo (each shot carries a key the
     server recognizes on a retry).
2. Try a 6 MB image from the library.
   - **Expect:** it uploads — the browser shrinks it to 1600 px before sending.
3. Try an SVG or a PDF.
   - **Expect:** "Use a PNG, JPG, WebP, or GIF image."

## 5. Who can see what

1. Sign in as a **Tech** not assigned to the job and open `/api/job-photos/<id>` from that job.
   - **Expect:** not found. Assign them and reload: the photo loads.
2. Sign in as **Sales** → a quote on a lead assigned to someone else.
   - **Expect:** the quote isn't theirs; its photos don't load.

## Not in phase A (coming in B–D)

Before/after pairing and "match this angle", the Work completed report, the
client-facing gallery and hub pages, the `/app/gallery` feed, the contact
property gallery, markup, Atlas vision, Save-to-quote from texts, and the
offline photo queue (an upload with no signal fails now and must be retried
when the truck has signal).
