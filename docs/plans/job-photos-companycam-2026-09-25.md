# Job photos, CompanyCam-style — 2026-09-25

**Status:** PLANNED (tester suggestion), reframed 2026-10-20 as the Gallery plan
(see the last section). Not started. Decisions in the last section still open.

## Why

A tester asked for CompanyCam-style photos. WorkBench already has the bones:

- `JobPhoto` model (`prisma/schema.prisma` ~1940): url, caption,
  `type` BEFORE | AFTER | GENERAL, bytes-or-R2 (`storageKey`), size, mime.
- Storage: `lib/blob-storage.ts` (Cloudflare R2 via aws4fetch, Postgres
  bytes fallback). Keys `companies/{companyId}/jobs/{jobId}/{photoId}.{ext}`.
- Routes: `app/api/app/jobs/[id]/photos` (POST, 4 MB, 100/job, preview cap),
  `.../photos/[photoId]` (DELETE only), `app/api/job-photos/[photoId]`
  (signed-in GET → 302 to signed R2 URL).
- UI: `app/platform/jobs/[id]/PhotoUpload.tsx` inside
  `<Fold title="Photos">` on the job page. Native "Take photo" through
  `@capacitor/camera`, library picker, browser resize to 1600 px
  (`lib/resize-image.ts`). No lightbox — a thumbnail opens the raw URL.
- Offline: `public/sw.js` v5 caches `/api/job-photos/*` stale-while-revalidate.
  The outbox (`lib/outbox.ts`) is JSON-only, so uploads cannot queue.
- Automations: `job.photo_added` trigger already exists and fires.
- Storage rollup: `lib/usage.ts` → `CompanyUsageDaily.storageBytes`.

What is missing is everything that makes CompanyCam feel like CompanyCam:
who / when / where on each photo, a real viewer, markup, before/after pairs,
client-facing galleries, a photo report, and a company-wide feed.
**This is an extension of the Photos fold, not a new module.**

## The features

### 1. Capture that files itself (job page, Photos fold)
- Phone: one big **Take photo** tool tile (`btn-tool`) at the top of the
  fold, **Add from library** as the `btn-tool-line` secondary. Desktop adds
  drag-and-drop onto the grid.
- Every shot is stamped with the tech (`userId`), `takenAt` (EXIF if
  present, else now), and a one-shot GPS reading
  (`navigator.geolocation.getCurrentPosition`, same as `ClockCard`).
- Photos taken with no signal sit in the grid under a "Waiting for signal"
  `.stamp` and upload on reconnect (see Offline below).
- `SegmentedRow` above the grid: All / Before / After. Fold header keeps
  the count.
- Missing today and needed here: a PATCH route for caption / type / tags.

### 2. A real viewer (`components/PhotoViewer.tsx`)
- Full-screen: swipe between photos, pinch to zoom (reuse the gesture code
  in `components/AvatarCropModal.tsx`).
- Bottom strip: caption, type, tech, time, "View on map" when GPS exists.
- Actions: Mark up · Pair with before/after · Show to client · Share ·
  Delete (`confirmSheet`, destructive).
- Desktop = flush `Modal size="2xl"`; phone = full sheet.

### 3. Markup (`components/PhotoMarkup.tsx`)
- Canvas over the photo. Tools: arrow, circle, freehand, text, blur.
- Original always kept. Marked-up JPEG stored beside it
  (`markedKey`), strokes saved as JSON (`markup Json?`) so it can be
  reopened and edited. Viewer gets an Original / Marked up toggle.

### 4. Before / after pairs
- `pairId` on `JobPhoto`. "Pair with…" in the viewer picks the counterpart.
- `components/BeforeAfter.tsx`: side-by-side card on desktop, drag slider
  on phone. Reused by the client gallery and the PDF report.
- Photo-required checklist items: `JobChecklistItem.requiresPhoto` +
  `photoId`. Tapping the item opens the camera; it is only done once a
  photo is attached. `job.checklist_done` already fires.

### 5. Client-facing sharing (existing public-token pattern)
- `JobPhoto.clientVisible`. Default: AFTER visible, BEFORE / GENERAL
  hidden; company setting to change the default (decision 2).
- Client hub job page `app/hub/[token]/visits/[jobId]` (does not exist
  today) with a Photos section; "Recent work" card on hub home. Hub list
  styles: `card-ledger` + `list-settle divide-y`, `.stamp` pills,
  `anim-portal`.
- Public gallery `Job.photoShareToken` (cuid @unique) → `/photos/[token]`,
  branded via `hubBrandVars`, `ForceLightTheme`, optional expiry.
- New job field `{{job.photoLink}}` (and `job.photoCount`) in
  `ENTITY_FIELDS` so the existing `email_client` / `text_client` /
  `portal_message` actions can send it. No new action type needed.

### 6. Photo report PDF
- `photoReportPdf` in `lib/pdf.tsx` (`@react-pdf/renderer`, `Image` is
  already imported). Cover = job facts strip; then 2-up photos with
  caption / who / when; pairs rendered together.
- Routes: `app/api/app/jobs/[id]/photo-report` and `/photos/[token]/pdf`.
- "Include photo report" checkbox on the invoice email; uses the
  `clientShell` paper-trail stamp ("WORK COMPLETED").

### 7. Company photo feed (`/app/photos`)
- Rail: `railGroups` "Work" in `components/AppShell.tsx`; phone:
  `navGroups` More sheet; teach `lib/mobile-nav.ts`.
- Newest first across all jobs; filters (`FilterBar`) by tech, date, job,
  type. Manager's "what did the crew actually do today" view.
- ⌘K: a "Photos" record action on Jobs (`recordActions` in AppShell).

### 8. Atlas + automations
- Atlas tools (staged-card pattern, `lib/assistant/field.ts`):
  `list_job_photos`, `share_job_photos` (stages POST), `describe_photos`
  (vision → job note, metered like other Atlas spend).
- Triggers in `lib/automations.ts` TRIGGERS + `lib/automations-server.ts`:
  `job.before_after_complete` (event), `job.photos_missing` (sweep:
  completed, zero photos).
- Test recipes appended to `docs/automations-test-recipes.md`.

## Integration rules

- **Extend, do not replace.** `JobPhoto` gains: `userId`, `companyId`,
  `takenAt`, `lat` / `lng` / `accuracy`, `clientKey @unique` (offline
  dedupe), `thumbKey`, `tags String[]`, `markedKey`, `markup Json?`,
  `pairId`, `clientVisible`. `Job.photoShareToken`,
  `JobChecklistItem.requiresPhoto` + `photoId`. Predeploy `db:push`
  handles it (same as the automations release). Backfill `companyId` /
  `userId` from the job.
- **No new native plugins.** GPS from browser geolocation in the webview
  (ClockCard already does this); camera plugin already installed. Phases
  1–3 need **no App Store / Play build**. Video and voice notes would need
  plugins + a store build → out of scope (note in
  `native-release-queue.md` if picked up).
- **Same primitives.** `Fold`, `SegmentedRow`, `Modal` / `BottomSheet`,
  `confirmSheet`, `btn-tool` / `btn-tool-line`, `.stamp`, `card-ledger`,
  hub list rows, `clientShell`. Plain Tailwind colors so tenant accent and
  dark mode apply automatically. Phone pages iOS-style and simpler than
  desktop.
- **Offline needs one new piece.** Photo bytes go in a small IndexedDB
  store (`wb-photo-outbox`) with the same `clientKey` idempotency and the
  same flush triggers as `components/OfflineSupport.tsx`.
- **Thumbnails in the browser.** `resizePhotoFile` makes the 1600 px JPEG;
  add a 400 px one and send both in one multipart request. No sharp, no
  image worker.
- **EXIF.** Canvas re-encode strips it, so read `takenAt` / GPS from the
  original file (or the Capacitor `exif` result) *before* resizing; GPS
  from geolocation is the primary source anyway.
- **MMS** (optional, decision 3): `sendSms` in `lib/sms.ts` is text-only;
  add `media_urls` for "text the client a photo".

## Phases

| Phase | Scope | Size |
|---|---|---|
| 1 | Schema, stamped capture, offline queue, viewer, PATCH caption/type | ~2 days |
| 2 | Markup, before/after pairs, photo-required checklist items | ~2–3 days |
| 3 | Client visibility, hub job page, public gallery, photo report PDF, MMS | ~2–3 days |
| 4 | Company feed, Atlas tools, new triggers + fields | ~1–2 days |

Each phase ships with test recipes (`docs/testing/` or appended to
`docs/automations-test-recipes.md`), and goes staging → e2e green → main.

## Out of scope (CompanyCam has, we skip for now)

Video, voice notes, "Showcase" marketing pages, "Pages" documents,
measurement tools, social-post generation from photos (Jobber "Job
Showcase" — see `docs/jobber-research/jobber-research-2026-07-02.md:37`).

## Open decisions (David)

1. **Gating.** Everything free, or markup / reports / share links behind
   Workbench Plus (`hasAddon`)?
2. **Client visibility default.** AFTER visible by default (proposed), or
   everything hidden until a tech flips it?
3. **MMS.** Adds media to the SMS sender; texting registration still in
   review. Phase 3, or drop?
4. **Feed placement.** Standalone `/app/photos` in Work, or a section on
   Overview only?


---

## 2026-10-20 reframe: the Gallery plan

David (2026-10-20): "pictures can be attached to estimates and then also to
completed job reports. before/after pictures should be able to be created from
that too." This is the Gallery add-on ($29, `PLANS.JOBSITE`, display name
Gallery, see `pricing-plans-2026-09-25.md`). The September plan above is
job-only; this section moves photos earlier (estimates) and later (the
completed job report), with before/after as the bridge. Brainstorm only,
nothing built. Decisions at the end still open.

### What exists to build on (checked 2026-10-20)

- `JobPhoto` (BEFORE / AFTER / GENERAL, R2 or bytes, `siteUse` + `alt` for
  the client website, served by `/api/job-photos/[id]`).
- `EstimatorImage`: pictures on estimate-tool questions and options. Not
  customer photos; leave it alone.
- `MessageMedia`: MMS photos in threads, 7-day expiry (`runMessageMediaSweep`).
- `@capacitor/camera` installed; `lib/resize-image.ts` makes the 1600 px JPEG.
- `lib/pdf.tsx` already imports `Image`; `clientShell` in `lib/email.ts` is
  the paper-trail email with stamps.
- Client hub `app/hub/[token]/` has quotes, invoices, requests, messages,
  payment-method; no job / visit page yet.
- Triggers `job.completed`, `job.completed_ago`, `job.photo_added`.
- Nightly storage rollup `CompanyUsageDaily.storageBytes`.

### 1. One photo across the whole lifecycle

Generalize `JobPhoto` instead of adding a `QuotePhoto` table:

- `jobId` becomes optional; add `quoteId String?`, `contactId String?`
  (always set, backfilled from the job), `companyId` (backfill).
- `PhotoType` gains `ESTIMATE` and `DURING`.
- Plus the September fields: `userId`, `takenAt`, `lat` / `lng` / `accuracy`,
  `clientKey @unique`, `thumbKey`, `tags`, `markedKey`, `markup Json?`,
  `pairId`, `clientVisible`.
- When a quote converts to a job (`Quote.jobId` set), its photos get the
  `jobId` and ESTIMATE photos count as the BEFORE set.
- A contact therefore has a property gallery across every quote and job.
  That is the CompanyCam feature contractors actually miss.

### 2. Estimate photos

Three ways in:

- **Tech on the site visit:** a Photos fold on the quote page (same
  `PhotoUpload` component, `quoteId` instead of `jobId`): Take photo /
  Add from library.
- **Client texts a picture:** a "Save to quote" (or "Save to job") action on
  thread media that copies the bytes to permanent storage before the 7-day
  expiry.
- **Website estimate form:** optional "Add a photo" step on the public form
  (`/book/[slug]/estimate/[tool]`), lands on the request, carried into the
  quote. Needs the `website-forms` lane or a small upload route of its own.

Uses: a per-photo **Show on quote** toggle so the quote PDF and the hub quote
page show what you looked at; line-item photos (`QuoteLineItem.photoId`);
markup to circle the problem; Atlas vision ("what do you see, suggest line
items") feeding the estimator smarts, metered like other Atlas spend.

### 3. Completed job report

A client-facing document, not a section buried in the invoice:

- Contents: job facts strip, crew, dates, before/after pairs, DURING photos,
  completed checklist items, a note to the client, signature if captured.
- Renders: `jobReportPdf` in `lib/pdf.tsx`; hub page
  `app/hub/[token]/jobs/[jobId]` (new); paper-trail email via `clientShell`
  with a WORK COMPLETED stamp.
- Sends from: a "Send the report?" prompt when a job is marked complete
  (phone sheet, desktop modal); an "Include report" checkbox on the invoice
  email; a `send_job_report` automation action; `{{job.reportLink}}` field.
- Tech side: a phone **Wrap-up** flow on complete: take AFTER shots, pair
  them, add a note, done. iOS-style, simpler than desktop.

### 4. Before / after

- **Pairing:** "Pair with…" in the viewer; auto-suggest by order taken
  (first BEFORE with first AFTER, and so on); `pairId` on both rows.
- **Match this angle:** before the camera opens for an AFTER shot, show the
  BEFORE photo full screen for a beat ("match this angle"), then launch the
  native camera. No plugin, no store build. A true ghost overlay needs an
  in-app camera (`getUserMedia`), web only; decision 5.
- **Outputs:** `components/BeforeAfter.tsx` side-by-side card on desktop,
  drag slider for the client hub and report; a stitched single JPEG made on a
  canvas for texting (MMS), social, and the client website "Recent work"
  section through the existing `siteUse` flag.

### 5. The Gallery tab

- `/app/gallery`: company feed, newest first, filters by tech, job, client,
  stage. Rail group Work; phone More sheet; teach `lib/mobile-nav.ts`.
- Contact page: Property photos fold (every quote and job).
- Quote page and job page: Photos folds with the All / Estimate / Before /
  After segmented row.
- This tab is what the $29 Gallery plan sells.

### Phases

| Phase | Scope | Size |
|---|---|---|
| A | Photo model generalization + backfill, quote Photos fold, carry-over on convert, viewer, PATCH caption/stage, thumbnails | ~2 days |
| B | Pairing, match this angle, BeforeAfter component, completed job report (PDF, hub page, email, send on complete, invoice checkbox) | ~3 days |
| C | Gallery tab, contact property gallery, stitched share image, website Recent work, markup | ~2 days |
| D | Atlas vision on estimate photos, Save to quote from texts, form uploads, `job.photos_missing` sweep, MMS send | ~2 days |

Each phase ships with test recipes and goes staging → e2e green → main.
`db:push` before deploy for phase A (nullable columns + enum values, additive).

### Open decisions (David) — supersede the four above

1. **Gating.** What stays free on Core (job photos as today, with a cap?)
   versus Gallery $29 (estimate photos, pairs, report, feed, markup, vision)?
2. **Photo model.** Generalize `JobPhoto` with quote and contact links
   (recommended) or a separate `QuotePhoto` table?
3. **Report.** Standalone Work completed report (recommended) or only a
   photos section on the invoice and receipt?
4. **Client visibility default.** AFTER shown; BEFORE, DURING and ESTIMATE
   hidden until flipped?
5. **Camera.** Native camera plugin + match-this-angle preview (no store
   build) or an in-app camera for a true ghost overlay (web only)?
