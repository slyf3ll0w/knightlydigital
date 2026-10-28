# Conference calls on the Voice line — plan (2026-10-28)

**Status: PLANNED, not built.** David asked 2026-10-28 whether the WorkBench
Voice line can do conference calls. It cannot today: every call is exactly two
legs (the customer, and either the ring-through cell or one app leg) joined
with the Call Control `bridge` command in `lib/voice.ts` (`bridgeLegs`). This
plan adds **Add a person** to a live call, which gives three things in one
mechanism: a three-way call (a supplier, the homeowner's spouse, a second
tech), a **warm transfer** (add a teammate, introduce, leave), and the ability
to pull a teammate in for a minute without hanging up.

## Why it fits the current design

Every call already runs through Telnyx Call Control, and a registered browser
or phone is just another dial target, never an originator (no E911 exposure —
see CLAUDE.md "Business line"). Telnyx conferences are Call Control objects
built from existing legs:

- `POST /v2/conferences { call_control_id, name, start_conference_on_create }`
  creates a conference **from an existing call leg** and bridges that leg into
  it. Conferences expire when the last participant leaves or after 4 hours.
- `POST /v2/conferences/{id}/actions/join { call_control_id, beep_enabled,
  end_conference_on_exit | soft_end_conference_on_exit, hold, mute,
  start_conference_on_enter }` adds a leg. `…/actions/leave`, `…/actions/mute`,
  `…/actions/unmute`, `…/actions/hold { call_control_ids, audio_url }`,
  `…/actions/unhold` manage participants.
- Webhooks: `conference.created`, `conference.participant.joined`,
  `conference.participant.left`, `conference.ended` (plus recording / floor
  events we ignore). They arrive at the same voice application webhook
  (`app/api/public/webhooks/telnyx/voice/route.ts`), which already forwards any
  `event_type` to `handleVoiceEvent`; today the `switch` drops unknown types.

So a conference is additive: ordinary calls keep the two-leg bridge, and only
a call where someone presses **Add a person** is promoted to a conference.
Nothing in `onInboundInitiated` / `onAnswered` / `ringSoftphones` changes.

### The one unknown: promoting a bridged pair

The docs do not say whether `POST /conferences` accepts a leg that is
currently bridged to another leg, or whether we must `unbridge` first (there
is no unbridge command; Telnyx tears a bridge down when either leg gets a new
media command). **Spike 0** settles it on staging before anything else is
built. Two outcomes, both fine:

- **A (expected):** create-conference on the customer leg re-homes it from the
  bridge to the conference mixer; the agent leg hears silence for a beat and
  is then `join`ed. Build on-demand promotion (the rest of this doc).
- **B:** Telnyx rejects or garbles it. Fallback is *conference-first for
  app-answered calls*: `bridgeLegs` creates a conference from the customer leg
  and joins the agent leg instead of bridging, for `via === "app"` calls only
  (cell-answered calls stay bridged, since the cell has no Add button
  anyway). Costs every app call a conference leg-minute (check the Telnyx
  rate deck: conferencing is priced per participant-minute on top of the
  call legs; expect ~0.2¢/min/leg), hence not the default.

## What the user sees

**Call screen (`app/platform/calls/[id]/CallScreenLive.tsx`, phones and
desktop):** a new `Control` next to Mute / Hold / Keypad: **Add** (UserPlus).
It opens a sheet with three ways to pick who:

1. **Your team** — people on this company with a live softphone (browser
   `User.softphoneSeenAt` inside the 100 s window, or an iOS/Android VoIP
   registration, `voipTargetsFor`), with their presence dot. Tapping rings
   them in-app exactly like an inbound call (the same `dial` to
   `sip:<sipUsername>@sip.telnyx.com` + VoIP push), but the card says
   "**Dave** wants to add you to his call with **Sarah Chen**".
2. **Clients and leads** — the existing search from `CallActions.tsx` ("Search
   your clients and leads"), dialing their saved number from the line.
3. **A number** — `DialPad` in number mode, for a supplier or anyone not saved.

Once a third person is on, a **participant strip** appears under the name:
chips with first name, elapsed time, a mute toggle and an ✕ (remove), plus a
"Ringing…" chip while a new leg rings. The red button becomes **Leave** when
there are three or more people on the call, with **End for everyone** behind
a hold (owner / the person who answered). Hold music now plays to everyone
except you.

**Desktop fixed card (`components/Softphone.tsx`):** the same Add button and a
"3 on the call" line; the strip stays on the full call screen.

**Call log (`/app/calls`, `CallRow`):** rows show "+1" / "+2" after the name
when others joined; the call detail lists who joined and left, with times.
Call duration stays customer-answered → customer-ended.

**Native shells:** the in-call screen on iPhone and Android is the web call
screen, so Add lives there too. CallKit / the Android engine mirror Mute and
Hold already (`muteChanged`, `holdChanged`); hold in a conference must call
the conference hold path (below), not the per-leg playback.

## Server design

### Data (additive db:push)

```prisma
model Call {
  // …existing
  conferenceId   String?            // Telnyx conference id once promoted
  participants   CallParticipant[]
}

model CallParticipant {
  id            String   @id @default(cuid())
  callId        String
  call          Call     @relation(fields: [callId], references: [id], onDelete: Cascade)
  kind          String   // "team" | "contact" | "number"
  userId        String?  // team member rung
  contactId     String?  // client/lead dialed
  number        String?  // E.164 dialed (contact or raw)
  label         String   // what the chips print, resolved at add time
  telnyxCallId  String?  @unique // the participant's leg (null until Telnyx answers the dial)
  addedByUserId String
  status        String   // "ringing" | "joined" | "left" | "no_answer" | "failed"
  joinedAt      DateTime?
  leftAt        DateTime?
  hangupCause   String?
  createdAt     DateTime @default(now())
  @@index([callId])
}
```

The original two legs are *not* participants rows — the customer stays
`Call.telnyxCallId`, the answering agent `Call.agentCallId` — so every
existing read of a call keeps working. The UI merges them with the
participants for the strip.

### `lib/voice-conference.ts`

- `conferenceAction(id, action, body)` beside `callAction` in `lib/telnyx.ts`
  (same REST client, same error mapping), plus `createConference`.
- `promoteToConference(call)`: idempotent (claims `conferenceId` with an
  `updateMany where conferenceId null` lock — same pattern as the
  RINGING→VOICEMAIL lock). `POST /conferences` from `call.telnyxCustomerLeg`
  with `name = call.id`, `start_conference_on_create: true`, `comfort_noise
  false`, `beep_enabled "on_enter"`, `client_state` `{callId, leg:"conference"}`;
  then `join` the agent leg with `start_conference_on_enter: true`. On the
  customer leg set `soft_end_conference_on_exit: true` via the join options
  (the creator's leg takes the create options; if Telnyx won't let us flag the
  creator, we end the conference ourselves on the customer's `call.hangup`,
  which `onHangup` already receives).
- `addParticipant(companyId, callId, actor, target)`: call must be
  `IN_PROGRESS`; actor must be on the call (`answeredByUserId` / `userId`) or
  an owner/admin; cap `MAX_PARTICIPANTS = 4` (customer + you + 2). Promote if
  needed, insert the row as `ringing`, then dial:
  - **number / contact:** the same outbound dial as `dialCustomer` (from the
    line, `from_display_name` sanitised, 30 s timeout), `client_state`
    `{callId, leg:"participant", participantId}`. On `call.answered` →
    `join` with `beep_enabled on_enter`. On `call.hangup` before answer →
    status `no_answer` / `failed`, chip shows it for 5 s, conference untouched.
  - **team:** `ringSoftphones`-style dial to the person's SIP credential and
    `pushIncomingCall` for a phone (`lib/voip.ts`), `client_state` the same
    with `participantId`. `findCallByLeg` learns to resolve a participant leg
    (one more branch beside customer / agent / app). The ringing app shows the
    "wants to add you" card and answers with the usual `answerWith`.
- `removeParticipant` → `leave` + `hangup` the leg. `muteParticipant` →
  conference `mute` / `unmute` with that `call_control_id`.
- `setHoldMusic` branches: when `conferenceId` is set, `hold` every
  participant except the actor's leg with `audio_url: holdMusicUrl()`, and
  `unhold` them; otherwise the existing per-leg playback.
- `leaveCall(actor)` (new red-button behaviour at 3+): `leave` + hang up the
  actor's leg only. If the actor was `answeredByUserId` and a **team**
  participant remains, the row's `answeredByUserId` moves to them and
  `via` stays `"app"` — that *is* the warm transfer, nothing else to build.
- `endForEveryone` → hang up the customer leg (which ends the conference and
  closes the row the normal way).

### Webhooks (`handleVoiceEvent`)

- `conference.participant.joined` / `.left`: update the participant row
  (`joinedAt` / `leftAt`, `hangupCause`), then push a `call-participants`
  event to the company so cards refresh (the status poll the softphone
  already runs picks it up too — add `participants` to `GET
  /api/app/line/call?id=`).
- `conference.ended`: clear nothing (the row ends on the customer's hangup as
  today); log it.
- `call.hangup` for a participant leg: mark `left`; if `status === "ringing"`
  mark `no_answer`.
- `onHangup` for the **agent** leg while `IN_PROGRESS` and a conference exists
  with a team participant still joined: do *not* treat it as the call ending
  (today it only records `endedBy`); run the hand-off above.
- Customer hangup: unchanged (closes the row); afterwards hang up any leg
  still open (participants included — `soft_end_conference_on_exit` ends the
  mixer but not the legs).

### Routes

- `POST /api/app/line/call/participants { callId, team?: userId | contactId?
  | number? }` → `addParticipant`.
- `DELETE …/participants { callId, participantId }` → `removeParticipant`.
- `PATCH …/participants { callId, participantId, mute }`.
- `POST /api/app/line/call/leave { callId }` → `leaveCall`.
- `GET /api/app/line/call?id=` returns `participants[]` and `conferenceId`.

### Atlas notes, transcription, costs, fair use

- Transcription runs on the customer leg with `transcription_tracks: "both"`.
  In a conference the customer leg's inbound track carries the whole mix, so
  Atlas keeps hearing everyone; "Them:" lines may now be two people. Spike 0
  verifies the transcript still arrives after promotion. Labelling speakers
  per participant is a later nicety.
- Telnyx bills each leg's minutes plus a conference participant-minute; a
  three-way costs roughly double a two-way call. For **fair use** (Voice plan,
  `DISPATCH_FAIR_USE_MINUTES`) count the call once by its duration, not per
  leg — it is one conversation and the ceiling is generous.
- No new compliance surface: the third-party dial is the same outbound-from-
  the-line path as "Call from line" today; browsers and phones never originate.

## Build order and effort

| Step | What | Effort |
|---|---|---|
| 0 | **Spike**: staging, David's two phones + a browser. Promote a bridged call, join a third number, check audio both ways, hold, the webhook stream and the transcript. Decide A or B above. | ½ day |
| 1 | Schema + `lib/voice-conference.ts` + routes + webhook cases + `findCallByLeg` participant branch. Unit script `scripts/test-voice-conference.ts` for the pure parts (participant cap, hand-off rule, hold target set, status transitions). | 1 day |
| 2 | Call screen: Add control + picker sheet (team / clients / number), participant strip, Leave vs End for everyone, hold semantics; desktop card line; CallRow "+N" and call detail list. Phone first, iOS-style, per David's UI rules. | 1 day |
| 3 | Team ring for Add (browser SIP + VoIP push), the "wants to add you" card, hand-off = warm transfer; CallKit/Android hold mirroring to conference hold. | 1 day |
| 4 | Help: new guide "Add someone to a call" in the phone section (how to, who can, Leave vs End, cost: counts once), update "Make and take calls". Atlas tool `add_to_call` (talk screen: "add Mike to this call") if cheap. | ½ day |

Steps 1–2 ship as phase 1 (three-way by number or contact, hold, mute, remove,
log). Step 3 is phase 2 (teammates + warm transfer). Release the usual way:
branch → staging CI + e2e → `git push origin <sha>:main`; the schema change
needs prod `db:push` first (predeploy handles it, but check nothing else on
staging is waiting on a db:push David has not approved).

## Test recipes for David (phase 1)

1. Browser answers an inbound call from phone A. Press **Add** → number of
   phone B. B rings showing the business number, answers, hears a beep, all
   three talk. Hang up B: beep, the other two continue, chip disappears.
2. Same, press **Hold**: A and B hear hold music, you hear nothing; Resume.
3. Same, A (the customer) hangs up: the call ends for everyone, the log shows
   one row with "+1", duration from your answer to A's hangup, Atlas notes
   cover both voices.
4. Add a number that does not answer: chip says "No answer" and goes away; the
   call with A is untouched.
5. Phase 2: Add a teammate on a phone; their app rings with "wants to add
   you"; they answer; you press **Leave**; the log shows the call handed to
   them and their notes land on the same call.

## Decisions for David before step 1

1. Who can press Add: anyone on the call (recommended), or owners/admins only?
2. Participant cap: 4 on a call (customer + you + 2) recommended.
3. Fair-use counting: one call = its duration, regardless of legs (recommended).
4. Join/leave beep on (recommended; it is the cue that someone else is listening).
5. Phase 2 before or after the Route Manager phase 2 / Gallery work.

## Help Center guides affected (ask before revising)

- `make-and-take-calls` (phone section): mention Add / Leave.
- New: `add-someone-to-a-call`.
- `voice-plan-limits`: one line that a three-way counts once toward fair use.
