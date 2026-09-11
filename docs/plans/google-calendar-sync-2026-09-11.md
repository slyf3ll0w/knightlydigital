# Calendar sync — ICS feed + Google Calendar push (2026-09-11)

Where this came from: the Appointments deferred list (2026-06-11, "ICS
calendar attachments / Google Calendar sync") and the scheduling plan's
"Not done" list (2026-09-09, "Two-way Google/Outlook sync"). Neither had a
design. This is the design, and tiers 1 and 2 ship together behind env vars.

## What a user gets

Every signed-in user (any role) has a **Calendar sync** card on My Profile
(`/app/settings/profile`) with two independent things:

1. **Subscribe link (tier 1, no setup).** A private `.ics` feed URL of *their*
   schedule — the jobs they're assigned to, the appointments assigned to
   them, their personal time blocks, and company-wide blocks. Paste it into
   Google Calendar ("From URL"), Apple Calendar (webcal), or Outlook. Read
   only, refreshes on the calendar app's schedule (Google: every 12–24 h;
   Apple: user-picked). Regenerate = old link dies.
2. **Google Calendar push (tier 2, needs Google OAuth keys).** Connect a
   Google account; Workbench writes the same events into that account's
   primary calendar within seconds of a schedule change and keeps them
   updated / removed. One way: nothing in Google writes back. Disconnect
   revokes the grant and deletes the events Workbench created.

Tier 2 is invisible until `GOOGLE_CALENDAR_CLIENT_ID` + `_SECRET` are set.

## What is an "event" (shared by both tiers)

`lib/calendar-events.ts` → `loadUserCalendarEvents(userId, { from, to })`
returns a normalized list, the single source both renderers use:

| kind        | rows                                                        | title                      | location                 |
|-------------|-------------------------------------------------------------|----------------------------|--------------------------|
| JOB         | Job with an assignment for the user, `scheduledAt` set      | `Job · title · client`     | job.address ?? contact   |
| APPOINTMENT | Appointment `assignedToId = user`, status ≠ CANCELLED       | `type label · title · client` | address / meeting link |
| BLOCK       | TimeBlock `userId = user` OR `userId = null` (company-wide) | block title                | block.address            |

- Anytime jobs/appointments and all-day blocks become all-day events on the
  company-timezone date (`VALUE=DATE` in ICS, `date` in Google).
- End defaults: job 1 h, appointment 30 min (matches the UI defaults).
- Description carries the deep link (`/app/jobs/<id>` etc.), client phone,
  and notes. Nothing a tech can't already see on that record.
- UID / private id: `wb-<kind>-<id>@workbenchfsm.com` — stable, so a
  re-subscribe or re-sync dedupes.
- Fingerprint = sha256 of the normalized fields → tier 2 only PATCHes what
  changed.

## Tier 1 — ICS feed

- **Table `CalendarFeed`** (`userId @unique`, `token @unique`, `lastFetchedAt`).
  New table rather than a column on User so `prisma db push` on boot has
  nothing to rewrite.
- **Route** `GET /api/public/calendar/[token]` (also accepts `<token>.ics`
  for apps that sniff the extension). 32-byte random token; wrong token or
  suspended company → 404, no body. Window: 60 days back, 365 forward.
  `Cache-Control: private, max-age=300`. Public path is added to the
  middleware's public-read allow list; rate-limited like other public GETs.
- **Authed API** `/api/app/profile/calendar-feed`: GET (current URL or
  null), POST (create / rotate), DELETE (disable).
- **ICS builder**: `buildIcsCalendar(events, { name, tz })` in `lib/ics.ts`
  next to the single-event builder — `X-WR-CALNAME`, `REFRESH-INTERVAL`,
  `VALUE=DATE` all-day support.

## Tier 2 — Google push

- **Tables** `GoogleCalendarConnection` (`userId @unique`, `companyId`,
  `googleEmail`, `calendarId` = `primary`, encrypted access/refresh tokens,
  `accessTokenExpiresAt`, `syncEnabled`, `lastSyncAt`, `lastSyncError`) and
  `GoogleCalendarEvent` (`connectionId`, `kind`, `localId`, `googleEventId`,
  `fingerprint`; unique on connection+kind+localId).
- **OAuth** (`lib/google-calendar.ts`): same shape as QuickBooks — signed
  `state = userId.expiresAt.hmac`, AES-256-GCM tokens keyed off
  `AUTH_SECRET`. Scopes `calendar.events` + `userinfo.email`;
  `access_type=offline&prompt=consent` so a refresh token always comes back.
  Redirect URI `${NEXTAUTH_URL}/api/app/integrations/google-calendar/callback`.
  Routes: `connect` (GET → redirect), `callback` (GET), `status` (GET),
  `sync` (POST, "Sync now"), `disconnect` (POST). All per-user, any role.
- **Sync = reconcile**, not write-through. `syncUserGoogleCalendar(userId)`:
  1. load events (30 d back, 180 d forward) + existing link rows;
  2. insert events with no link (`extendedProperties.private.workbench`),
     patch links whose fingerprint changed, leave the rest alone;
  3. for links with no matching event, look the record up: gone, cancelled,
     unscheduled, or no longer this user's → delete in Google + drop the
     link; merely outside the window → keep.
  Google 404/410 on delete = already gone, drop the link. 401 → refresh
  once. Any other failure → `lastSyncError`, next run retries.
- **Triggers**: (a) hourly cron step `googleCalendar` sweeps every enabled
  connection (catches everything, incl. visit-series generation); (b)
  near-real-time: a Prisma `$use` middleware in `lib/db.ts` watches writes
  to Job / JobAssignment / Appointment / TimeBlock and calls
  `scheduleGoogleCalendarSync(companyId)` — 4 s debounce per company,
  dynamic-imports the sync module so `db.ts` stays dependency-free. Zero
  cost when no company has a connection (cached "any connections?" flag,
  60 s TTL). (c) "Sync now" button.
- **Disconnect** deletes Workbench-created events from Google first (best
  effort), revokes the token, deletes the connection (links cascade).

## Not doing (deliberate)

- Two-way (Google → Workbench busy time). Needs Google push channels or
  polling plus a "foreign busy" concept in the booking engine. Next tier.
- Outlook/Microsoft Graph push — the ICS feed covers Outlook read-only.
- Per-user secondary calendars — always the account's primary calendar.
- Reminders/notifications on the Google side — `reminders.useDefault: false`
  with none, so Google doesn't double-remind on top of Workbench pushes.

## David's side (Google Cloud)

1. console.cloud.google.com → project → enable **Google Calendar API**.
2. OAuth consent screen: External, scopes `.../auth/calendar.events` and
   `.../auth/userinfo.email`; add test users while unpublished.
3. Credentials → OAuth client ID → Web application → redirect URIs
   `https://workbenchfsm.com/api/app/integrations/google-calendar/callback`
   and `http://localhost:3000/api/app/integrations/google-calendar/callback`.
4. Railway + `.env.local`: `GOOGLE_CALENDAR_CLIENT_ID`,
   `GOOGLE_CALENDAR_CLIENT_SECRET`.
5. Publishing the consent screen (past test users) needs Google's
   verification for the `calendar.events` scope — a sensitive scope. Until
   then only listed test users can connect. Do this before telling testers.

## Verify

- `npx tsx scripts/test-calendar-sync.ts` — pure: event mapping, ICS
  calendar output, fingerprints, Google payload shape.
- `npm run e2e -- calendar-feed` — feed create/rotate/disable, a scheduled
  assigned job appears, the other tenant's token doesn't see it, a wrong
  token 404s.
- Google push: connect from My Profile with a test-user account, drag a job
  on the schedule, watch it move in Google within ~5 s; hourly cron log line
  `googleCalendar`.
