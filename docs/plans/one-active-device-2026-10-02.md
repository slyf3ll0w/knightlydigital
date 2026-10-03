# One active device per login — 2026-10-02

**Status: BUILT 2026-10-02** (branch `one-device`). Decided with David the same
day: "second device takes over" rule, superadmins and the e2e owners exempt.
The seat limit itself (Core = 2 included, $10 a seat) is still NOT enforced —
David wants that once payment processing is set up.

## Why

WorkBench prices by the seat, and a crew sharing one owner login is the
obvious way around it. There was nothing to notice it with: NextAuth runs on
14-day JWTs with no session table, presence rows hold only user + time, and
the team invite route says "Free, no seat limits."

## The rule

One login can be **active on one device at a time**. Any number of devices
may stay signed in; the rule is about who is looking at the app right now.

- Every browser / app install carries a random `wb_device` cookie
  (httpOnly, 400 days), set by `POST /api/app/presence` on its first beat.
- The User row remembers the holder: `activeDeviceId`, `activeDeviceAt`,
  `activeDeviceLabel` ("the iPhone app", "Chrome on Windows", …).
- The presence beat (every 45 s while the page is visible, plus on
  focus/visibility) is the check. The holder keeps the lock; any device
  may take it once the holder has been quiet for the online window
  (3 min — a backgrounded tab or pocketed phone sends no beats, so it
  lets go on its own).
- Another device beating while the holder is active gets `busy` and the
  app is covered by a full-screen wall: **"This login is in use on
  &lt;device&gt;"**, one sentence, **Use it here** and **Sign out**. "Use it
  here" beats again with `takeover: true` and claims the lock outright;
  the old device learns on its next beat (≤ 45 s) and gets the same wall.
  While covered, a device beats every 15 s so the wall lifts soon after
  the other side goes idle.
- The wall is a front door, not a security boundary: API routes are not
  gated, so a queued offline write or an in-flight save is never lost.

Two people sharing one login bounce each other every minute. One person
moving phone → desktop never notices (the previous device is idle, or one
tap).

## Switches and exemptions

- `ONE_ACTIVE_DEVICE=0` on Railway turns the rule off (beats become plain
  presence stamps again). No deploy needed.
- `ONE_ACTIVE_DEVICE_EXEMPT=a@b.com,c@d.com` exempts specific logins.
- Always exempt: `SUPERADMIN` rows (they never hold a tenant session anyway)
  and the e2e harness owners `e2e-*@workbenchfsm.com` (Playwright gives
  every test a fresh cookie jar; the suite would wall itself).

## Files

- `lib/active-device.ts` — `decideDevice` (pure), `deviceLabel`,
  `claimDevice` (conditional `updateMany` so two devices beating in the same
  instant can't both win), cookie helpers, switches.
- `app/api/app/presence/route.ts` — reads/sets the cookie, runs the claim,
  answers `{ ok }` or `{ busy, device, since }`; a busy device is not
  stamped as present.
- `components/PresenceBeacon.tsx` — the beat + the wall.
- `prisma/schema.prisma` — three nullable columns on `User` (db:push via
  `db:predeploy`, no backfill).
- `scripts/test-active-device.ts` — unit test (in `npm run test:unit`).

## Test recipes (David's device pass)

1. **Phone then desktop (one person).** Open the app on the iPhone, then
   open workbenchfsm.com on the PC within a minute. The PC shows "This
   login is in use on the iPhone app". Tap **Use it here** → the PC works.
   Within 45 s the iPhone shows "in use on Chrome on Windows" (or Edge).
2. **Idle hand-off.** Put the phone app in the background (or switch tabs
   on the PC) and wait 3 min. Open the app on the other device: no wall at
   all, it simply takes over.
3. **Two people at once.** Sign in as the same user in a second browser
   (Edge vs Chrome, or a private window) and keep both visible. Press
   **Use it here** on one, then on the other: each press walls the other
   side within 45 s. Neither side can work for long while the other is
   active — that is the point.
4. **Same browser, two tabs.** Two tabs of the same browser never wall each
   other (same cookie = same device).
5. **Sign out from the wall.** Press **Sign out** on a walled device →
   /app/login. Signing back in on that device while the other is still
   active walls it again.
6. **Kill switch.** Set `ONE_ACTIVE_DEVICE=0` on Railway staging → redeploy
   → recipe 3 shows no wall. Remove the variable to restore.
7. **Dark mode.** The wall follows the app's dark mode (white / navy).
8. **Team page still right.** While one device is walled, the Team page
   shows the person Online now from the holding device only.
9. **e2e unaffected.** The staging E2E run stays green (owners exempt).
