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
- **Calls page redesign (2026-09-22, after the first working calls)**:
  `LineCard.tsx` — the number as the headline, one sentence saying where a
  call rings right now (this browser → cell; other tab; switched off; mic
  blocked), the dialer, a stat strip (today / missed unseen / voicemails
  unheard / talk time 7 d), a Line settings link for managers. Rows
  (`CallRow.tsx`) are grouped by day in the company zone (Today / Yesterday /
  Fri, Sep 19), carry a tinted status tile with a red "new" dot and a red left
  edge while unseen, show who took the call and where, and offer **Call back**
  (browser if registered, else the cell flow; `CallFromLineButton` now takes a
  raw `to`). Filters: All / Missed / Voicemail / Outgoing (`?f=`). The native
  `<audio controls>` (whose ⋮ menu was Chrome's own download/speed popup, i.e.
  Windows chrome inside a WorkBench card) is replaced by `VoicemailPlayer.tsx`:
  play/pause, scrubbable bar, elapsed/total, 1×/1.5×/2×, hidden `<audio
  preload="none">` behind `/api/app/calls/[id]/voicemail`.
- **Not built (deliberate)**: ringing the same person on several *devices*
  (each browser profile registers; Telnyx forks to all — should work,
  unverified), a keypad for IVR menus (`call.dtmf` is one line when
  needed), transfer between team members, per-user ring order, and a nav badge
  while a call is ringing on another page (the card is fixed-position, so it's
  visible everywhere already).

## Tier 3 — native ringing when the app is closed — iOS BUILT 2026-09-23 (store build 1.3, build 8), Android PLANNED

**The engine is native (build 8, after builds 6–7 proved the web engine can't
do it).** The first two on-device tests failed the same way: slide to answer on
the lock screen, the caller keeps hearing ringback, nothing until the app is
opened by hand. iOS freezes a background WKWebView — no JavaScript, no
sockets — so a softphone that lives in the page can never register or take a
leg while the app sits behind the CallKit screen. WhatsApp-style answering
needs native code, so `ios/App/App/VoipPlugin.swift` now embeds the Telnyx
iOS SDK (`telnyx-webrtc-ios` 4.2 via SPM):

- VoIP push (`lib/apns.ts`, `lib/voip.ts`) → CallKit reports the call at once
  → the engine fetches a login token with the webview's cookies
  (`GET /api/app/line/softphone`), registers, POSTs
  `/api/app/line/softphone/ready` → the server dials its SIP leg
  (`wakeSoftphoneLeg`, client_state `woke: true`) → the SDK receives the
  INVITE and answers it the moment CallKit's Answer was (or is) tapped. Audio
  runs under the `voip`/`audio` background modes; Mute, Hold (with the
  server's hold music via `PATCH /api/app/line/call`), End and the keypad on
  the system screen drive the real call. Two call groups, so a second call is
  call waiting (hold & accept), and Decline goes to voicemail
  (`POST …/call/decline` first, like the browser).
- The page (`components/SoftphoneNativeEngine.ts`, `lib/native-voip.ts`) never
  touches WebRTC on iOS: it mirrors the engine's events on the call card
  (incomingCall / callAnswered / callActive / callEnded / muteChanged /
  holdChanged / engineState) and forwards taps, each of which goes through
  CallKit so the system screen agrees. A reloaded page catches up from
  `currentCalls()`.
- Outbound from the app: the page POSTs `/api/app/line/call` (via app) and
  hands the id to `placeCall`; the engine reports an outgoing CallKit call and
  answers the INVITE that carries `X-WB-Outbound`. `startOutboundCall` accepts
  a VoIP-registered phone in place of the browser's presence heartbeat
  (`voipRegisteredSoftphone`) — the engine sends no presence; the INVITE for
  its own call is what wakes it.
- Another company on the same login: the ready route answers `switch`, the
  engine re-registers with a token minted for that membership
  (`GET …/softphone?membership=`, `POST …/ready { membership }`,
  `membershipOf` checks it is the same Account) and asks again; the page
  switches companies for its own UI meanwhile.
- The microphone: iOS's one prompt is requested natively when the page first
  registers with calls on (`requestMic`), never during an answer.

**One credential per device (build 10, from the build 9 trace).** The phone
and the desktop shared the user's one SIP credential. With the desktop
online, the server dialed that credential the instant the call came in
(`onlineSoftphoneUsers`), the INVITE went to the desktop's registration, and
the phone — registered two seconds later — posted ready and was told
`already`: nothing for it to answer, so a lock-screen Answer sat on silence
until the leg timed out. Worse, the phone's login bumped the desktop's
registration, so the desktop stopped ringing and could not place calls
until it re-registered. Now `User.sipCredentialIdIos` / `sipUsernameIos` is
the iPhone's own Telnyx credential (`GET …/softphone?device=ios`,
`ensureUserCredential(…, "ios")`), `CallLeg.device` says which one a leg was
dialed to, `wakeSoftphoneLeg` dials the phone credential and only counts
phone legs as "already", `voipRegisteredSoftphone` returns it, and
`POST /api/app/line/call { device: "ios" }` places the phone's outbound leg
on it. Both ring on an inbound call — the desktop's leg at once, the phone's
once it wakes — and the first answer wins as before.

Server pieces unchanged from the web engine: VoIP tokens in `PushSubscription`
as platform `ios-voip` (dropped on sign-out from any membership), the
VOIP_WAKE_SECS (35 s) window before the cell, a woken leg that rings out
going to voicemail rather than the cell. See `native-release-queue.md`
§ App Store for the console/Mac steps.

**Every company on the login rings the phone (2026-09-23).** A token is
registered under whichever membership the app is signed into, but
`voipTargetsFor` judges eligibility on the membership in the *call's* company
and finds the token on any membership of the same Account. When the woken app
is signed into a different company, `POST …/softphone/ready` answers
`switch` (+ the membership id; `probe: true` asks without dialing, so the app
starts switching before it registers). `Softphone.tsx` parks the call in
localStorage (`stashPendingVoipCall`, 40 s TTL), re-points the session with
`switchToMembership` and reloads; on the other side it takes the parked call
back, registers as that company, and POSTs ready for real. CallKit keeps the
call up across the reload (the native side outlives the page); the lock-screen
label carries the company name for multi-company logins. The platform layout
mounts the softphone in the iOS shell even when the current company has no
line, so the push is heard and the switch happens. Sign-out deletes the token
from any membership of the login. Known gap: an Answer tapped during the
~3 s reload itself is carried only if the page saw it — the INVITE still
rings the app afterwards, so it is a second tap, not a missed call.

**No cell ring once a phone has woken (2026-09-23, from the first real test).**
Answer on the lock screen, then the cell rang too and the two calls collided.
The woken phone's SIP leg had timed out (APP_RING_SECS 15 s, with iOS's
first-ever microphone prompt sitting in front of the answer) and the app-leg
hangup handed the call to the cell as it would for a browser. Now a leg dialed
by `wakeSoftphoneLeg` carries `woke: true` in its client_state, rings for
VOIP_APP_RING_SECS (35 s), and when it runs out goes to **voicemail**, never
the cell. The cell still rings when no phone wakes at all (the 28 s
`scheduleCellFallback`). The microphone is now requested the first time the
softphone registers on a device (always on the iPhone; once per device on
the web) and when "Calls in the app" is turned on — not at Answer.

Original plan, kept for the Android half:


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
