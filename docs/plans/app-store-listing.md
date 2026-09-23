# App Store — Workbench FSM, 1.3 update (2026-09-23)

The listing (name, screenshots, privacy labels, age rating) is already live
from 1.2 (id6789991103). This is only what changes for 1.3.

## What's New (paste into App Store Connect)

WorkBench 1.3 turns your iPhone into your business line.

• Calls ring your phone even when WorkBench is closed — answer from the lock screen, talk in the app, and the caller only ever sees your business number
• Sign in with Apple or Google — one tap, no password to remember
• Siri: "Hey Siri, clock me in with WorkBench", "clock me out", or "next job"
• Mute, hold and end calls from the iPhone call screen, with your phone locked

## Review notes (App Review Information)

Sign-in: the app offers Sign in with Apple and Sign in with Google side by
side (guideline 4.8); email + password login remains available.

Demo account: [owner fills in — a Summit Plumbing login with the business
line enabled, so the reviewer can place a call from the Calls page].

VoIP push: the app registers a PushKit VoIP token only to ring the user's
own business-line calls (Telnyx). Every VoIP push reports an incoming call
to CallKit immediately; no VoIP push is used for anything else. Background
modes: `voip` for that, `audio` so an in-progress call keeps going when the
phone locks.

Siri: three App Intents (clock in, clock out, next job). Clock in/out call
the app's own API with the user's session; nothing is shared with Siri
beyond the spoken confirmation.

## Privacy labels

No change from 1.2: contact info, user content (photos), identifiers, all
linked to the user, for app functionality. Sign in with Apple adds no new
data type (the Apple user id is an identifier already declared). Call audio
is not recorded by the app.

## Version / build

`MARKETING_VERSION = 1.3`, `CURRENT_PROJECT_VERSION = 6` — bump build to 7
if a second upload is needed for the same version.
