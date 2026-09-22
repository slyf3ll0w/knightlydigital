# Business line — voice tiers (2026-09-18)

Where this came from: the first cut of the business line (`business-line-2026-09-15.md`)
used Telnyx's number-level call forwarding. It works, but the forwarded call carries
the customer's caller ID, so the owner's cell rings like any personal call, and the
cell's own voicemail answers before the business can. David: "will it tell me the call
is being forwarded… how hard would it be to get it to be an actual phone number
separate from my cell phone that can call via Workbench?" Three tiers were laid out;
tiers 1 and 2 are built for every number (not just Streamflaire's), tier 3 is the plan.

## Tier 1 — a real business line on your cell — BUILT 2026-09-18

Telnyx Call Control replaces number-level forwarding. Code: `lib/voice.ts`
(flow), `lib/telnyx.ts` (commands), `/api/public/webhooks/telnyx/voice`.

- **Inbound**: we answer, play ringback, dial the owner's cell FROM the business
  number, whisper "Streamflaire call from Maria Lopez. Press 1 to accept", bridge on
  1. No 1 (declined, timed out, the cell's voicemail picked up) → TTS greeting →
  beep → recording (≤3 min, stops on 10 s silence) → owners/admins get a push.
- **Outbound**: "Call from line" on a client page rings the user's cell (My Profile
  phone, else the line's ring-through number), whispers "Press 1 to call Maria
  Lopez", rings the customer from the business number, bridges. Customer only ever
  sees the business number.
- **Calls page** (`/app/calls`, nav next to Messages): every call, status, talk
  time, voicemail playable inline (`/api/app/calls/[id]/voicemail` redirects to a
  fresh Telnyx download URL — recordings stay at Telnyx). Contact page: "Recent
  calls" card + the button.
- **Settings**: ring-through number (same field as before), voicemail greeting
  (custom text or the generated default). Superadmin: voice status + "move onto the
  voice app".
- **Data**: `Call` (direction, status machine, both legs' Telnyx ids, voicemail
  recording id), `Company.lineVoiceAppAt`, `Company.lineVoicemailGreeting`.
- **Migration**: numbers provisioned/attached with `TELNYX_VOICE_APP_ID` set go
  straight onto the app. Older numbers move the next time the tenant saves their
  ring-through number, or via superadmin `line-voice-sync`. Without the env var
  everything falls back to number-level forwarding exactly as before.
- **Setup per environment**: `npx tsx scripts/telnyx-voice-setup.ts https://<host>`
  creates the outbound voice profile + Call Control app and prints the id.

### Not built (deliberate, small)
- Missed-call text-back (consent: a caller hasn't opted in to texts; would need an
  explicit company setting and the registration ACTIVE).
- Business-hours routing (after hours → straight to voicemail) and multiple ring
  targets / ring order for teams.
- Voicemail transcription (Telnyx `transcription: true` on `record_start`, one flag +
  a column + a push body).
- E911 on the number (only needed for softphone tier 2), port-in of an existing
  number (Telnyx portal process, not API).
- A nav badge for unseen missed calls / voicemails (push covers it for now).

## Tier 2 — softphone inside WorkBench — BUILT 2026-09-21

Calls in the browser, so nobody's cell is involved while the app is open on a
computer. Tier 1 is the fallback the moment it isn't. Code: `lib/softphone.ts`
(resources, presence, the ring plan), `components/Softphone.tsx` (the WebRTC
client + call card), `lib/softphone-client.ts` (browser-side store the buttons
talk to), the `app` branches in `lib/voice.ts`.

The one design decision that made it small: **every call still runs through
Call Control**. A registered browser is just one more destination we can dial
(`sip:<username>@sip.telnyx.com`), exactly like the cell — it never originates a
call of its own. So every call has a Call row, the customer always sees the
business number, recordings/voicemail/stale sweeps are untouched, and — because
the browser can't dial 911 — **no E911 address is needed** (the plan's item 1
was wrong about that; it only applies to a softphone that places PSTN calls).

- **Telnyx side**: one credential connection per company
  (`Company.lineSipConnectionId`, created on first use, *no* outbound voice
  profile — which is the "can't originate" guarantee) and one telephony
  credential per team member (`User.sipCredentialId` / `sipUsername`). The
  browser logs in with a JWT minted per page load by `GET /api/app/line/softphone`
  (`{ off: reason }` when calls shouldn't ring there). `releaseLine` deletes all
  of it with the number.
- **Presence**: heartbeat every 30 s while registered
  (`POST /api/app/line/softphone/presence`, `User.softphoneSeenAt`), beacon on
  pagehide; online = within 100 s (a long-hidden tab only fires timers once a
  minute). `ringPlan` (pure, `scripts/test-voice.ts`) decides who rings first.
- **Inbound**: on the customer leg's `call.answered`, every online browser is
  dialed as a SIP leg (`CallLeg` row each, `link_to` the customer, 15 s
  timeout, `Call.appRingAt` is the fan-out lock). First browser to answer
  claims `agentCallId` + `answeredByUserId` + `via: "app"` and is bridged; the
  rest are hung up. When the *last* browser leg ends unanswered the cell is
  dialed (tier 1, ringback still looping); no browsers online → the cell right
  away; neither → voicemail. A browser leg's first webhook can beat our insert,
  so `findCallByLeg` adopts unknown SIP legs from their `client_state`.
- **Outbound**: `POST /api/app/line/call { via: "app" }` dials the caller's own
  browser (with `X-WB-Call-Id` / `X-WB-Outbound` headers + the callee as the
  display name); the tab auto-answers, the server skips the whisper and dials
  the customer, then bridges. "Call from line" on a contact becomes **Call in
  app** whenever the softphone is registered; the Calls page gets a dialer.
- **UI**: a fixed card (bottom right) — Answer/Decline with a Web-Audio ring
  tone and a ☎ in the tab title; then mute, hold, hang up, elapsed time. Calls
  page rows say "Maria · in the app". My Profile → **Calls in the app** switch
  (`User.softphoneEnabled`, default on).
- **Native shells never register** (`nativePlatform()`): in the phone app calls
  keep ringing the cell — which is what a phone should do anyway — until tier 3.
  The mic permission strings (`NSMicrophoneUsageDescription`, `RECORD_AUDIO` +
  `MODIFY_AUDIO_SETTINGS`) are already in the tree for that build.
- **Data**: `Call.answeredByUserId`, `Call.via` ("cell" | "app"), `Call.appRingAt`,
  `CallLeg` (one per browser leg), `Company.lineSipConnectionId`,
  `User.softphoneEnabled` / `softphoneSeenAt` / `sipCredentialId` / `sipUsername`.
  **`db:push` before deploy.** No new env var.
- **What the first live test (2026-09-21) taught, all fixed the same night**:
  1. `credential_connections` need `sip_uri_calling_preference: "internal"` or
     Telnyx answers a Call Control dial at `sip:<cred>@sip.telnyx.com` with
     **SIP 403 after ~300 ms** (`user_busy` in the webhook). Set on creation;
     `ensureSipUriCalling` heals older connections once per process.
  2. `from_display_name` only allows `A-Za-z0-9 -_~!.+` — "(469) 833-5853"
     is a **422 that rejects the whole dial**. `sipDisplayName` (tested)
     turns numbers into 469-833-5853 and strips the rest.
  3. The WebRTC SDK reconnects by itself and fires `telnyx.socket.close` on
     our own `disconnect()`; reconnecting on that event looped (dialer
     flicker, grant 429). Generation guard + SDK-first with a 45 s fallback.
  4. Two tabs = two registrations = both get the INVITE and a 486 race when
     both answer (SDK docs). One tab per browser via Web Locks
     (`wb-softphone`); the others show "ringing in your other tab". An
     outbound leg placed elsewhere is neither answered nor rejected.
  5. The browser asks for the microphone BEFORE the server dials it, and the
     Calls page offers to grant it up front; a Cancel before the INVITE lands
     hangs the server-side call up (`DELETE /api/app/line/call`).
  Diagnosis from a laptop, read-only:
  `{ railway variables -s Streamflaire --json; echo "<<<SEP>>>"; railway variables -s Postgres --json; } | node scripts/diag-with-public-db.mjs 8`
  (rows + presence + Telnyx resources) and
  `railway variables -s Streamflaire --json | node scripts/diag-telnyx-events.mjs 8`
  (every Telnyx command/webhook with hangup causes and SIP codes).
- **Not built (deliberate)**: ringing the same person on several *devices*
  (each browser profile registers; Telnyx forks to all — should work,
  unverified), a keypad for IVR menus (`call.dtmf` is one line when
  needed), transfer between team members, per-user ring order, and a nav badge
  while a call is ringing on another page (the card is fixed-position, so it's
  visible everywhere already).

## Tier 3 — native ringing when the app is closed — PLANNED (≈1 week + review)

- iOS: PushKit VoIP push + CallKit (`@capacitor-community/callkit-voip` or a
  small custom plugin). On `call.initiated` the server sends a VoIP push per
  online device; the OS shows the native call screen; answering brings the app up
  and the WebRTC leg connects. Apple requires CallKit reporting for every VoIP
  push — a missed report gets the app's pushes throttled.
- Android: FCM high-priority data message → foreground service + full-screen
  intent with the incoming-call UI (ConnectionService for the native dialer look).
- Both need a store build and review; keep tier 1's cell fallback forever for the
  "phone off / app killed" case.
- Tier 2 already did the groundwork: the mic permissions are in the native
  projects, `Softphone.tsx` only needs its `nativePlatform()` gate lifted once
  the shell can ring in the background, and the server side is unchanged (a
  phone is just another registered credential).

## Costs
Telnyx voice ≈ $0.007/min per leg (US), TTS basic tier included, recordings
stored free for 30 days by default (raise retention in Mission Control if
voicemails must outlive that). WebRTC minutes bill like any other leg.
