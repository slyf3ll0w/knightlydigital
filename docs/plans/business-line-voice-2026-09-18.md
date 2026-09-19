# Business line — voice tiers (2026-09-18)

Where this came from: the first cut of the business line (`business-line-2026-09-15.md`)
used Telnyx's number-level call forwarding. It works, but the forwarded call carries
the customer's caller ID, so the owner's cell rings like any personal call, and the
cell's own voicemail answers before the business can. David: "will it tell me the call
is being forwarded… how hard would it be to get it to be an actual phone number
separate from my cell phone that can call via Workbench?" Three tiers were laid out;
tier 1 is built for every number (not just Streamflaire's), tiers 2–3 are the plan.

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

## Tier 2 — softphone inside WorkBench — PLANNED (2–3 days)

Calls in the browser and desktop app via Telnyx WebRTC, so nobody's cell is
involved when the app is open. Tier 1 stays as the fallback when it isn't.

1. **Telnyx side**: one SIP credential connection per company
   (`/credential_connections`), per-user telephony credentials
   (`/telephony_credentials` → JWT via `/telephony_credentials/{id}/token`, short
   TTL, minted by `/api/app/line/webrtc-token`). Outbound voice profile reused.
   E911 address on the number becomes required once a softphone can dial 911
   (`/phone_numbers/{id}` `address_id`, an emergency address per company).
2. **Inbound routing change** in `lib/voice.ts`: on `call.answered` (customer leg),
   dial the SIP credentials of everyone online (`to: sip:<cred>@sip.telnyx.com`,
   fan-out with `link_to`) *and* the cell after N seconds if nobody picks up; first
   answer wins, the rest get hung up. Whisper is skipped for SIP legs (the app shows
   who's calling).
3. **Client** (`@telnyx/webrtc`): a `<CallBar>` mounted in `AppShell` — incoming
   toast with Answer/Decline, dialer (from a contact or a typed number), mute, hold,
   hangup, elapsed time; mic permission prompt on first use. Presence = the client
   registers a SIP session; server tracks `online` via `call.answered`/registration
   webhooks or a heartbeat.
4. **Native shells**: Capacitor WebView supports WebRTC on iOS 14.3+/Android; mic
   permission strings in Info.plist / manifest (a store build — queue in
   `native-release-queue.md`). Background ringing is tier 3.
5. **Call rows** gain `answeredByUserId` and `via` ("cell" | "app").

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

## Costs
Telnyx voice ≈ $0.007/min per leg (US), TTS basic tier included, recordings
stored free for 30 days by default (raise retention in Mission Control if
voicemails must outlive that). WebRTC minutes bill like any other leg.
