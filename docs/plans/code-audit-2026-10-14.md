# Code audit — 2026-10-14

Scope: everything merged after the 2026-10-06 audit's first fix batch (705d4b51..3ec7c422,
376 files): the three audit fix batches themselves, calls + business line (who hung up,
softphone reconnect, textingRoutes heal, transient classifier, short-code inbound, line
move), chat attachments (drag/drop, paste, staging row, media race), the 2026-10-12 polish
batch (Get started, industry dropdown, unsaved-leave guard, quick-menu hold, pipeline
reorder, ACH fee), Siri shortcuts + native launch, Sentry ignores, sticky landing anim,
back pill, and a cross-cutting pass (auth/tenant scoping on all 42 touched API routes,
schema drift, Help Center drift, design-system rules, error handling, nav/search parity).

Six read-only slices; every finding below was re-verified against HEAD by the lead.
Static reading only — nothing exercised on a device.

## Baseline (run locally at 3ec7c422, branch media-race)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run test:unit` | 40/40 scripts green |
| e2e | not run locally (staging pipeline is the gate) |

## Clean (checked, no finding)

- Tenant scoping + auth on all 42 touched API routes: no cross-company read/write, every
  route authenticates, ids checked against the company before update/delete.
- Prisma schema: new columns all nullable, written and read, predeploy unaffected.
- Contact merge moves all 20 Contact back-relations in one transaction; self-merge refused.
- One-active-device kill switch honoured on claim/probe/release; exempt paths never write.
- Public site data: 404 unless IN_STUDIO/REVIEW/LIVE; legal name behind its switch; brief
  only after submit; photos alt-only.
- Web address rename: no redirect loop, history can't collide across companies, query kept.
- Send later: clears on PAID / approval / any by-hand status leaving DRAFT; zone-safe.
- Media doors: 401 signed out, cross-company 404, client-thread media needs canSell +
  contactScope, channel media needs membership, 410 only after scope checks, SVG/HTML not
  in the allowlists, nosniff on the proxy, sweep bounded at 200/hour.
- GCal 1 h grace: a persistent failure still reports after 60 min; 401 still parks.
- Launch splash cannot stay up forever (6 s cap + NativeShell + error.html all release it);
  reduced motion handled; versions agree iOS 1.4/13, Android 1.4/vc6.
- Sentry ignore list is narrow; HeadlessChrome drop is not at HEAD (branch sentry-rs-noise).
- Sticky landing anim: timers/observer cleaned up, 5 s cap guarantees settled.
- Back pill can never pop out of the app; honours the unsaved-leave guard.
- Pipeline reorder is company-scoped; Converted pinned; mismatch → 409 + resync.
- ACH fee: one source, env with `?? 30` fallback, integer cents; the pay page never charges
  the customer a processor fee. Finix fee profile still a manual change.
- Appointments list parity: scoped, 2 queries, delete gated isManager on page + API.
- Sentence-case sweep lower-cased no proper noun / acronym; no enum key touched.
- No empty catches, bare JSON.parse, forEach(async) or un-cleaned setInterval in new code.

## Fix first (ranked)

### Tier 1 — regressions from the last fix batches and things testers will hit today

1. **Non-managers can't save any edit to a task that links a record outside their scope**
   (regression, batch 3). `lib/tasks.ts:570-577` re-checks every link with
   `contactScope` / `jobScope` / `viaContactScope`, which for TECH/USER/SALES is
   `{ assignedToId: actor.id }`; `components/tasks/TaskEditor.tsx:180` sends every link id
   on every PATCH even when untouched; `app/api/app/tasks/[id]/route.ts:44-45` runs it.
   Owner creates "Call Smith about the panel" for a tech from Smith's page → tech changes
   the due date → 400 "One of the linked records is not in this account." Only Done works.
   Fix: on PATCH, only validate links that changed (or validate with company scope only).

2. **"New client" sheet submits the host form too.** `components/QuickContactSheet.tsx:52-54`
   calls `preventDefault` but never `stopPropagation`; the sheet is a portaled nested form,
   and React propagates synthetic submit through portals. `ContactPicker` (allowCreate
   default) sits inside a submitting form on seven hosts: AppointmentForm, NewJobClient,
   NewRequestClient, NewSeriesForm, InvoiceEditor, QuoteEditor, NewContractForm.
   New job → New client → Enter: contact POST fires AND the job form submits ("Please
   select a contact" behind the sheet). With a client already picked: the request is
   created for the OLD client and the page navigates away mid-create. Keystrokes also
   bubble into the hosts' `onChange={touch}`, so cancelling the sheet leaves the form
   "dirty". The repo documents this exact trap at `components/EstimatorRunner.tsx:343-350`.
   Fix: `e.stopPropagation()` in `submit` and stop `onChange` bubbling.

3. **The reschedule "fake day stamp" is read as "the client was reminded"** (batch 2 B4/E5).
   `lib/reminder-stage.ts:71-77` writes `reminderDaySentAt = now` for any new start inside
   24 h, nothing sent. `lib/route-plan.ts:291,321` derive `reminded` from that column;
   `app/api/app/route-plan/optimize/route.ts:141-146` LOCKS every reminded stop by default
   and `:521` applies the stamp to EVERY proposed stop, not just moved ones.
   Optimize → Apply at 7 AM → run Optimize again → every stop locked and badged "Reminded".
   Same from Move the day, calendar drag, the client manage link.
   `app/platform/appointments/[id]/page.tsx:58` prints "day-before sent <time>" for a
   reminder that never went out. Fix: a separate anchor column (or a sentinel) for
   "moved at" vs "sent at", and only stamp moved stops on Apply.

4. **Job PATCH re-arms reminders on a no-op save** (half of B4 left undone).
   `app/api/app/jobs/[id]/route.ts:139-142` spreads `rescheduleReminderStamps` whenever
   `body.scheduledAt !== undefined`; `ScheduleJob.tsx` sends it on every save; the
   appointment PATCH guards on an actual change (`appointments/[id]/route.ts:69`).
   Hour reminder sent 8:50, tech taps Save at 9:05 without changing anything → second
   hour-before text ~9:25 and the stop turns "Reminded"/locked (item 3). Fix: guard on
   `startMoved` like appointments.

5. **Siri shortcuts don't work for the people they're for (techs).**
   a. `app/api/app/siri/on-my-way/route.ts:37` looks the contact up with `contactScope`,
      but the job came from `jobScope`; a tech on a job whose client is owned by the
      office gets 404 `no-job` → Siri says "You have no job to clock into right now".
      The app's own on-my-way route uses `jobScope` only. Fix: drop `contactScope` here.
   b. `app/api/app/siri/line/route.ts:27` answers `text: true` from
      `companyCanSendSms` alone (no `canSell`, unlike `call` on :26), so
      `Intents.swift:240-245` posts to the thread route, which 403s techs → Siri reads
      "Forbidden" aloud; USER/SALES on an unassigned lead get "Client not found". The
      Messages-app fallback is never reached. Fix: `text = canSell(role) && …`.
   c. `lib/next-job.ts:33,53` select only `job.address` / `contact.address`, so
      Directions hands Apple Maps a bare street line with no city/state/ZIP
      (`Intents.swift:401`). The app uses `completeAddress(job.address, contact)` for
      exactly this reason (`jobs/[id]/on-my-way/route.ts:42`).
   d. `lib/next-job.ts:63` says "anytime" when the formatted time is 12:00 pm, ignoring
      `Job.scheduledAnytime`; a real noon job is read as "anytime", and an anytime job
      booked from a browser in another zone is read as a clock time. Fix: select the flag.
   e. `lib/next-job.ts:126` picks the earliest ACTIVE job with `scheduledAt >= startOfDay`;
      the dashboard picks the first stop `>= now` and merges appointments. At 3 PM with a
      9 AM job still ACTIVE, Siri (and Clock in / On my way / Directions) act on the 9 AM
      job while the phone hero shows the 4 PM stop.
   f. PLAUSIBLE: "Complete my job" PATCHes the job behind the open time entry regardless
      of status (`Intents.swift:443-456`); if a teammate already completed it the
      transition is a no-op, no clock-out, Siri still says it's complete → tech clocked in
      until the next clock-in.
   g. PLAUSIBLE: on-my-way reports "Told Maria you're on your way" when `canText` is false
      (STOP, smsDisabled, no phone) and there's no email; no idempotency so a repeated
      trigger sends twice (`siri/on-my-way/route.ts:54-60`).

6. **Chat: switching threads while a multi-file send is in flight posts the rest to the
   NEW thread.** `app/platform/chat/ChatClient.tsx:507-519` loops `postMedia`; each call
   reads `activeRef.current` at its own start (`:434`); thread buttons aren't disabled
   while `attaching`. Stage 3 photos in DM Maria, Send, tap Everyone during photo 1 →
   photos 2–3 land in Everyone with no bubble on the sender's screen. Fix: capture the
   channel once in `sendFiles` and pass it down (or disable the list while attaching).

7. **A reply to a short-code thread looks sent but goes nowhere.** `lib/phone.ts:33-38`
   keys 3–6 digit senders; the webhook creates a placeholder with phone "22000";
   `lib/sms.ts:141-142` `toE164("22000")` is null → `sendSms` returns false silently, no
   email fallback, but `lib/portal-messages.ts:163-170` still created the OUTBOUND row so
   the inbox shows the reply as sent. The Save card can also turn it into a lead/client
   with phone "22000". Fix: hide the composer + Call + Save-as-client for non-E.164
   placeholders (read-only inbox thread).

8. **Softphone can stay "On the line" forever after a socket drop** (8d0c66b1).
   `components/Softphone.tsx:638-651` `restart` returns early while a call is up and only
   `endCall` (:661-682) consumes `restartAfterCall`; `CallScreenLive.tsx:128,138` skips
   the row poll while `sp.call` exists. Inbound call answered + bridged, Wi-Fi roams,
   customer hangs up → server marks COMPLETED but the SIP BYE never arrives → timer keeps
   counting, Mute/Hold live, softphone not re-registered so the next inbound rings the
   cell. Only manual Hang up / reload clears it. Fix: while `restartAfterCall` and a call
   is active, poll `/api/app/line/softphone/call?id=` and `endCall` on a terminal status
   (mirror the dialing poll at :1326-1370). Also `telnyx.ready` (:897-925) never clears
   `restartAfterCall`, so a healthy re-registration is torn down at call end.

9. **Job edit page is "dirty" the moment it opens.** `JobEditForm.tsx:80-92` hydrates
   line items from `emptyEditorLine` (no `_key`), `:101-104` snapshots that;
   `components/LineItemsEditor.tsx:109-110` re-keys on mount → snapshot differs → every
   Cancel/Back/nav on an untouched edit page asks "Leave without saving?". Fix: hydrate
   with `withLineKeys` or snapshot without `_key`.

10. **Industry alias order seeds the wrong starter price book.** `lib/pricebooks.ts:229-258`
    scans aliases in array order after stripping the `Other:` prefix; "clean" (3rd) wins
    over Plumbing "drain", Roofing "gutter", Pool "pool", HVAC "air duct". "Other: pool
    cleaning" → Cleaning Services price book, seeded once at signup, and the Get started
    card says "Your price book is loaded". `IndustrySelect.tsx:10-12` promises Other seeds
    nothing. Fix: don't alias-match once `Other:` was present (or longest alias wins).

### Tier 2 — wrong behaviour, lower frequency

11. **Public MMS door serves every outbound client-thread photo for 7 days with a public
    cache header.** `app/api/public/mms/[id]/route.ts:14-19` gates only on direction;
    `lib/message-media.ts:248` sets `public, max-age=3600`. A photo sent on a portal-only
    thread (never texted) is still reachable by cuid. Team-chat photos are NOT exposed
    (they hang off a team message). Fix: only expose rows whose message actually went out
    by SMS, for a short window after send, `private` cache.

12. **Media row is visible before its bytes exist → permanently broken bubble.**
    `lib/message-media.ts:135-145` creates the row, then PUTs (:150); the 3 s/8 s polls
    include it; `/api/message-media/<id>` answers 404; `MessageMedia.tsx` has no onError
    retry and the poll keeps the same key+src. Also drops the sender's good optimistic
    bubble (`ChatClient.tsx:475-479`). Fix: create the row after the put, or exclude
    rows with `storageKey IS NULL AND data IS NULL` from the selects.

13. **R2 put has no timeout and the upload POST is not idempotent.** `lib/blob-storage.ts:91`
    (compare `lib/sms.ts:159` 15 s). Stall → "Sending…" for minutes → client offers retry →
    second PortalMessage; the first may still complete and send its MMS → client gets the
    photo twice. Empty-body rows from the hung attempt sit in the thread/hub.

14. **Caption is lost when the first staged file is over the cap.** `sendFiles` clears the
    draft before the loop (`ChatClient.tsx:512-516`, `TeamThread.tsx:434-438`);
    `postMedia` returns early on size without a bubble; the rest go out captionless.

15. **Client accept list is broader than the server allowlist.** `PendingAttachments.tsx:9-11`
    accepts any image/* or video/*; server takes only `MMS_TYPES`/`CHAT_TYPES`. webm screen
    recordings, HEIC on Chrome, AVIF, BMP stage with a thumbnail then 415 "Photos and
    videos can be sent in chat."

16. **The bell never shows "Booking expired unanswered".** `lib/approval-bookings.ts:86-88`
    archives the request then pushes `/app/requests/<id>`; `notifications/route.ts:289-293`
    keeps only NEW/NEEDS_APPROVAL requests and drops the rest as handled. Anyone without
    OS push never learns the slot was released.

17. **Contract signing is check-then-act.** `app/api/public/contract/[token]/route.ts:24-58`
    reads, checks VOID/SIGNED, then unconditionally updates to SIGNED; a void landing in
    between is overwritten. Quote and pay routes use atomic `updateMany where status in`.

18. **Unsaved-leave guard holes.** `lib/use-unsaved-warning.ts:40-64` hooks beforeunload,
    anchor clicks and nav-guard but no `popstate`: browser Back, iOS edge-swipe and Android
    hardware back drop the form silently. `lib/sign-out.ts:82-102` tears the session down
    THEN navigates → the native prompt appears after sign-out; "Stay" leaves a dead page.
    `tel:` / `mailto:` anchors on a dirty page are routed through `router.push` after the
    confirm instead of dialling.

19. **Get started card un-ticks and resurrects.** `lib/get-started.ts:53-58,145-147` every
    tick is a live count: deleting the only client/job or clearing the phone brings the
    card back after it auto-hid. `prisma.user.count({ where: { companyId } })` counts
    deactivated users so "Add your team" stays ticked after the only teammate is removed.

20. **textingRoutes sweep has no environment guard** (PLAUSIBLE). `lib/business-line.ts:2191-2231`
    iterates every company with a real line, repoints the number to its profile and the
    profile webhook to `baseUrl()`. Staging runs the same sweep with prod's Telnyx key: a
    prod-owned number attached to a staging company for a test ping-pongs hourly, and a
    staging row carrying a prod profile id points that profile's webhook at staging.
    Fix: skip (or make read-only) unless `baseUrl()` is the production host.

21. **Sweep heals bypass the miss counter and re-enable a disabled profile.**
    `lib/business-line.ts:2258-2262` number-gone → `reportError` every hour, uncounted;
    `getMessagingProfile` never returns null (throws 404) so the profile-gone branch is
    dead; `:2271-2273` sends `enabled: true`, undoing a superadmin pause in the Telnyx
    portal. `lib/transient-error.ts:47-58` miss counter is in-process, reset by every
    deploy, so "3 consecutive hourly misses" rarely triggers at the current cadence.

22. **Line move leaves STOP opt-outs at the source company** (PLAUSIBLE, compliance).
    `lib/business-line.ts:2455-2520` moves line fields + MessagingRegistration;
    `Contact.smsOptOut` stays on the old company's contacts, so a customer who texted STOP
    to the 833 line before the move can be texted again by the new company.

23. **Call.endedBy edges.** `lib/call-ending.ts:33-35` reads a platform hangup of the
    agent leg as "them"; `lib/voice.ts:1328-1334` `cancelCall` on IN_PROGRESS hangs up the
    agent leg first → "They hung up" after we ended it (PLAUSIBLE, exposed via the native
    shell / any future End on a live call). CONFIRMED: customer-leg branch
    (`lib/voice.ts:859-869`) writes `endedBy` unconditionally while the agent-leg branch
    uses `updateMany({ endedBy: null })`, so two hangup webhooks within ms let the
    customer leg overwrite the first verdict.

24. **Sign-out can still leave the one-device lock held** (PLAUSIBLE, D1 symptom).
    `PresenceBeacon.tsx:98,102` capture-phase pointerdown fires a plain beat before the
    Sign out handler's `{ release: true }`; `lib/active-device.ts:200-206` claim races
    `releaseDevice` (:148-153) and re-stamps the signed-out device for the 3 min window.

25. **Deleted/merged clients leave their photos in R2 forever.** Contact force-delete
    (`contacts/[id]/route.ts:356`), merge (`merge/route.ts:134`), request delete rely on
    the DB cascade; nothing deletes `storageKey` objects; no key-listing sweep exists.

26. **new-number 409 wording is wrong for unassigned saved clients.**
    `app/api/app/messages/new-number/route.ts:62-75`: a saved client with `assignedToId`
    null (CSV import) is neither visible nor unclaimed for SALES/USER → "already belongs
    to a contact assigned to someone else". Either claim unassigned non-placeholders too
    or reword.

27. **Quick-menu: on an engine that synthesises a click after a long press, releasing the
    finger closes the sheet it just opened** (PLAUSIBLE, device check). `QuickMenu.tsx:290-300`
    swallows only clicks on a descendant of the row; the post-release click is hit-tested
    where the portaled BottomSheet backdrop now sits (`BottomSheet.tsx:63 onClick={onClose}`).

28. **`postJson` 401 redirect matches `/apply`.** `lib/safe-fetch.ts:46`
    `pathname.startsWith("/app")` — latent today (apply/invite use raw fetch).

### Tier 3 — cosmetic / wording / consistency

29. Help Center drift: `lib/help/sections/start.ts:76` lists "Verify your business" as the
    first Get started step; `lib/get-started.ts` has no such item (payments onboarding is
    closed). `account.ts:295` "Siri does what the app's own Call and Text buttons do" is
    false for techs (item 5b); `:309-310` FAQ omits the on-my-way hand-off; the "login
    moved to another device" cause is wrong (the wall never touches API routes).
    `SiriError.noJob` ("You have no job to clock into right now", `Intents.swift:110`) is
    reused for on-my-way, directions and reach-client.
30. Title Case headings that escaped the sentence-case sweep: `SettingsClient.tsx:1442`
    "Business Info" (Help copied it; `settings-nav.ts:27` says "Business info"), :372/:392
    "Online Payments"; `ContactForm.tsx:242/370/448` "Contact Info"/"Client Details"/
    "Custom Fields"; `contacts/page.tsx:108`; `InvoiceActions.tsx:701` "Charge Card";
    `InvoiceEditor.tsx:328` "Line Items"; `JobEditForm.tsx:164` + `NewJobClient.tsx:300`
    "Job Details"; `AppointmentActions.tsx:473` "Edit Appointment";
    `RequestActions.tsx:209` "Edit Request".
31. "Help & Feedback" renamed to "Help Center" in menus; copy still says "open Help &
    Feedback": `settings/addon/page.tsx:46`, `support/page.tsx:6`,
    `support/SupportClient.tsx:120`, `estimates/SharePanel.tsx:151`,
    `app/(wbsite)/contact/page.tsx:75`.
32. Two 404 looks: root `app/not-found.tsx` (bare, forced light, hard-coded #0B57D8) for a
    typo URL vs `app/platform/not-found.tsx` (themed card) for a deleted record.
33. `AppointmentForm.tsx:236` keeps the old "+ Add new client" link beside the picker that
    now has "New client"; it navigates away (now behind a leave prompt).
34. `PendingAttachments.tsx:74` remove button is 20 px on phone (rule: ≥40 px touch target).
35. Object URLs for optimistic send bubbles never revoked (`ChatClient.tsx:459`,
    `TeamThread.tsx:378`); paste with a modal open attaches to the composer underneath
    (`lib/use-paste-files.ts:22-23`); no dedupe by name+size.
36. `settings/route.ts:144` accepts any industry string; `SettingsClient.tsx:1560-1561`
    writes the bare literal "Other" on change, losing a typed "Other: …" industry.
37. Walled device that un-walls on a probe answer is invisible to presence until touched
    (`presence/route.ts:61` skips `touchPresence` on probes; `PresenceBeacon.tsx:84-87`
    keeps probing).
38. `PageNotes.tsx:59-61` captures `#wb-page-notes-bottom` before a streamed route renders
    → empty-page strip at the top on pages with a loading.tsx.
39. Explanations outside (i) bubbles in new code: `GetStartedRow.tsx:36`,
    `IndustrySelect.tsx:29/63` (public door), attach-button tooltips + drop-overlay hints
    (`ChatClient.tsx:769/1071`, `TeamThread.tsx:504-506/653`), expired bubble
    (`MessageMedia.tsx:24`).
40. `scripts/run-unit-tests.mjs:9` regex `/^test-.*\.ts$/` silently skips
    `scripts/test-pdf-render.mts` (pre-existing). No unit coverage for `lib/get-started.ts`,
    `lib/toast.ts`, `mergePendingFiles`.

## Status

- 2026-10-14: audit written. David: "start with Tier 1".
- **2026-10-14, Tier 1 (branch `audit-tier1`, worktree ~/knightlydigital-wt/audit-tier1):** all ten
  FIXED. 1 (`validateTaskInput` takes `existing`; only a CHANGED link is scope-checked on PATCH),
  2 (`QuickContactSheet` stops submit + change propagation), 3 (new nullable
  `Appointment.rescheduledAt` / `Job.rescheduledAt` — **db:push, predeploy does it** — is the
  booking anchor; `rescheduleReminderStamps` records the move and clears both sent stamps, so
  the sent stamps always mean a send; Optimize Apply stamps only `movedStops`), 4 (job PATCH
  re-arms on `startMoved` only), 5a–e + g (on-my-way drops `contactScope` and hands off when
  `canText` is false; `siri/line` `text` needs `canSell`; `lib/next-job.ts` selects
  `scheduledAnytime` + city/state/zip (`completeAddress`), `spokenWhen(…, anytime)`,
  `pickNextJob` = the dashboard rule, `scripts/test-next-job.ts`; 5f left — needs Intents.swift),
  6 (`sendFiles` captures the channel once), 7 (thread channel `short-code`: read-only composer,
  no Call, no Save card; the messages POST refuses with a plain sentence), 8 (`unreachableCallId`
  poll ends the card on a terminal row while the socket is down; `telnyx.ready` clears
  `restartAfterCall`), 9 (`withLineKeys` at hydration), 10 (`matchIndustry` never alias-matches
  an "Other: …" answer; test cases). Baseline after: tsc clean, unit suite green.
  Staging CI + e2e green (f0a6f17f; the chat-paste spec now waits for the single composer to hold),
  **LIVE ON MAIN f0a6f17f 2026-10-14**. Open from Tier 1: 5f (Siri complete-job on an
  already-completed job — Intents.swift).
- **2026-10-14, Help Center (branch `audit-tier2`):** Siri guide (account.ts) — texts for techs / untextable
  clients go from the phone, "next job" = Up next, sign-in FAQ no longer blames the device wall;
  phone.ts unknown-number guide — short-code threads are read-only.
- **2026-10-14, Tier 2 (same branch):** 11 (`/api/public/mms/[id]`: OUTBOUND + `canText` + 48 h window,
  `private` cache), 12 (`storeMessageMedia` puts the bytes BEFORE creating the row, id minted up front;
  `MediaOwnerGoneError` → 410 in both upload routes — the equivalent of the unpushed media-race branch,
  which this supersedes), 13 (`putObject` 60 s `AbortSignal.timeout`), 14 (caption rides the first file
  that goes; the words come back to the box if none did — chat + texting), 15 (`lib/media-types.ts`: one
  allowlist for the server, `isSendableFile` and the pickers' `accept`), 16 (expiry push links the
  cancelled appointment, which the bell keeps), 17 (contract sign = `updateMany` claim, status not in
  SIGNED/VOID), 18b (`appSignOut` runs `confirmLeave` first; a confirmed leave drops the beforeunload
  prompt), 18c (tel:/sms:/mailto: links exempt from the guard), 19 (completion stamps
  `getStartedHiddenAt`; active users only), 20 (sweep skipped where `TELNYX_10DLC_MOCK=1`), 21
  (number/profile gone → `reportError` once a day via the rate-limit store; profile 404 caught; a
  disabled profile is left alone), 22 (`moveLine` carries STOP onto the target's matching contacts),
  23 (`cancelCall` stamps `endedBy: "us"` on a live call first; the customer leg uses a
  first-verdict-wins `updateMany`), 24 (`presenceGate` — sign-out waits for an in-flight beat and the
  beacon sends nothing while signing out), 25 (`collectContactMediaPurge` on contact force-delete and
  request-delete-with-lead; merge moves messages, so nothing orphans there), 26 (409 wording), 27
  (`BottomSheet` ignores backdrop taps for 350 ms after opening — the device check is still owed), 28
  (`/app` boundary). NOT done: 18a (browser Back / hardware back with unsaved changes — a history
  sentinel costs a double-Back after every saved form; left), 21d (in-process miss counter —
  documented trade-off, left). Staging CI + e2e green (371768e3), **LIVE ON MAIN 371768e3 2026-10-14**.
- **2026-10-14, Tier 3 (same branch):** 29 (start.ts loses the "Verify your business" step; the Siri
  `noJob` line now reads "You have no job up next right now" for all four intents — Intents.swift,
  ships with the next store build; the account.ts Siri copy was fixed in the Help Center pass), 30
  (every listed heading in sentence case, and the Help Center + line copy that named "Business Info" /
  "Online Payments" follows), 31 (copy says Help Center; the /app/support page keeps its own
  "Help & Feedback" name — it's reached from the Help Center's footer buttons), 32 (the in-app 404
  uses the theme button and the same "Back to Home"; the root page stays light outside the shell — one
  look per surface), 33 (both "+ Add new client" leftovers gone; the picker's New client covers it), 34
  (remove badge's hit area is the tile's 40 px top-right square), 35 (blob: URLs revoked when the
  server row or a retry replaces the bubble; a paste while any aria-modal dialog is up that doesn't
  hold the pane is left alone; `mergePendingFiles` dedupes by name+size+mtime — moved to
  `lib/pending-files.ts`), 36 (settings PATCH refuses anything but a list key or "Other: …";
  Settings → Company shows the Other box and keeps a typed "Other: …"), 37 (a probe answered `ok`
  clears the wall and fires a real claim beat), 38 (the phone strip's bottom anchor is looked up again
  once the page settles), 39 (GetStartedRow subtext → InfoTip; attach tooltips, drop-overlay hints
  and the expired bubble trimmed to the action; the public-door IndustrySelect hint is left — site
  style, not app), 40 (runner takes `.mts`, the PDF test writes to the temp dir; new
  `test-get-started` (pure `buildGetStarted`), `test-toast` (`kindForUrl`), `test-pending-files`).
