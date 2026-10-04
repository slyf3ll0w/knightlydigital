# Messaging holes — notification taps, unknown numbers (2026-10-03)

**Status: BUILT 2026-10-03** (branch `messaging-holes`). Three things David
found in Messaging on prod:

1. Tapping a message notification was clunky and sometimes showed the old
   black-and-green "Streamflaire Hub" retry page.
2. A number that texts in should be saveable as a contact, client or lead,
   onto the right Leads column, the way a phone offers "Create contact".
3. Could anything stop a text from an unknown number reaching him?

## 1. Notification tap → the thread

### What was happening
Every push link is wrapped as `/app/open?u=<membership>&to=<page>` so a tap can
switch companies first. A tap therefore did TWO cold page loads (the shim, then
the page) — and a phone that has just woken up drops its first requests. The
service worker tried the navigation twice, then fell back to
`public/offline.html`: the Streamflaire-era page (black `#0C0F0C`, green
button, "You're offline … Retry"). It did reload itself after 1.5 s, which is
the "clunky" part — a flash of the wrong page, then the thread.

### What changed
- **The running app navigates itself.** The service worker's
  `notificationclick` now posts `wb:open` to an open /app tab instead of
  `client.navigate()`; AppShell resolves the link with `lib/push-open.ts`
  (`resolvePushOpen`) and `router.push`es the thread — no page load at all.
  Only a tap from ANOTHER company on the account still goes through
  `/app/open`. Fallback: a tab without AppShell (suspended, get-started) that
  hasn't moved after 1.5 s gets the old navigation.
- **The native apps do the same** (`components/NativeShell.tsx`
  `pushNotificationActionPerformed` → `router.push`); the layout passes the
  signed-in user id so the membership check works.
- **`/app/open` is a server redirect** when the membership matches (or none
  is named): one HTTP 307, no spinner, no session fetch. The client switch
  component (`OpenSwitch.tsx`) only renders for a real company switch.
- **Three navigation attempts** in the service worker (now, +0.7 s, +1.5 s)
  before any fallback.
- **`offline.html` restyled** to the app (light canvas, Lexend when cached,
  console-ink button, dark-mode aware) and smarter: while the browser says it
  is online it shows "Opening…" and retries on its own (1 s, 3 s, 7 s / up to
  three visits), then "Still can't reach WorkBench" with Try again + Go to
  Home; offline it says so and reloads the moment signal returns. The inline
  "Opening…" page for `/app/open` matches.
- Service worker `VERSION` → v7 so every device drops the cached old page.

### Recipes
1. **Message tap, app in background (phone).** Have someone text your line
   while WorkBench is in the background. Tap the notification → the thread
   opens inside the app with no white flash, no black retry page, no spinner.
2. **Message tap, app closed.** Swipe WorkBench away, get a text, tap the
   notification → the app cold-starts straight into the thread (one load).
   If the radio is slow you may see a light "Opening…" card for a second —
   never the black page.
3. **Message tap, browser on the desk.** Chrome open on Home, phone in
   pocket. Text comes in → OS notification. Click it → the Chrome tab moves
   to the thread in place (no reload; the Home page's scroll position is
   gone but nothing reloads).
4. **Tap while already on that thread** → nothing jarring; the thread
   refreshes.
5. **Airplane mode, tap an old notification** → the "You're offline" card
   (light, app-styled). Turn airplane mode off → it opens on its own.
6. **Two companies.** If you have a second company on the account, a push
   from it still switches companies and lands on its page.

## 2. Unknown number → lead / client / contact

### What changed
- **Inbound texts from unknown numbers** (`/api/public/webhooks/telnyx`) now
  create a **placeholder** contact named after the number — the same shape as
  a thread you start by typing a number — instead of a LEAD called
  "Unknown caller · (214) 555-0100". Hidden from Contacts, the board and
  pickers until saved. `lead.created` fires at the save, not at the text
  (`message.text_received` still fires for every inbound text, so auto-reply
  automations are unaffected).
- **The thread shows the Save card** ("(214) 555-0100 texted you — who is
  this?") for placeholders AND for the old "Unknown caller" rows. First name
  only required (the last-name field said optional but blocked Save — fixed).
  Lead / Client / Contact buttons as before.
- **Right column.** Saving as a lead puts them on the board even though the
  status didn't change (old rows were LEAD already); if you have already
  replied in the thread they land in **Contacted** (the CONTACT_MADE trigger,
  same as a team text), otherwise **New**.
- Thread header and inbox row show the formatted number until they are named.

### Recipes
7. **Unknown number texts in.** From a phone your account has never seen,
   text your business line "hi, do you do gutters?". Messages inbox shows a
   row named by the number; open it → Save card at the top; the number is
   NOT in Contacts or on the Leads board yet.
8. **Save as lead before replying** → fill a first name, Lead, Save → card
   gone, header shows the name, Leads board has them in **New**.
9. **Reply first, then save as lead** (new unknown number): reply in the
   thread, then Save as Lead → Leads board shows them in **Contacted**.
10. **Save as client** → on Contacts (Clients tab), not on the board.
11. **Save as contact** → Clients → Contacts tab, not on the board.
12. **First name only** → Save enabled with just a first name; last name and
    company optional.
13. **Old rows.** Any earlier thread whose name is "Unknown caller · (…)"
    now shows the same Save card; saving as lead puts them on the board.

### Add to existing (round 2, same day)
`POST /api/app/contacts/[id]/merge { into }` folds an unsaved number into a
saved client: the thread (with photos), calls, text log and anything else on
the number move to them, the client's phone becomes this number, the unsaved
row is deleted, and the page shows the client's thread. A saved contact is
never merged this way (400). If the client was a lead in New and the team had
already replied, they move to Contacted.

14. **Add to existing.** On an unknown number's thread press `Add to
    existing`, search a client you already have, tap them → the button reads
    "Add to Maria · replaces (469) …" when they had a different number →
    press it. You land on Maria's thread holding the texts; the old
    number-named thread is gone from the inbox; Maria's profile shows the
    new number. Text from that number again → it lands on Maria.
15. **Client with no number.** Same, with a client who had no phone → button
    reads just "Add to Maria"; afterwards their profile has the number.

## 3. What could stop an unknown number's text (audit, code side)

Nothing refuses unknown senders on purpose. The conditions that would lose a
text, all unchanged by this batch except the first:

- **The `to` number doesn't match `Company.lineNumber`** (E.164 drift) and
  the sender has no contact → the text was dropped silently. It is still
  dropped (nowhere to land it) but now reports to Sentry with the sender's
  number, so a drifted line shows up.
- **Signature / config:** `TELNYX_PUBLIC_KEY` unset → every inbound rejected
  (503), as documented; a bad signature → 400. Same for known numbers, so if
  known senders reach you, unknown ones do too.
- **Keyword-only texts:** a message that is exactly STOP/START (opt-out
  flags) or exactly HELP (Telnyx auto-reply) never becomes a thread message.
  "Help me with my sink" is fine — only the bare word.
- **Who gets told:** owners, the default lead user, and the assigned user get
  the push + bell row; the company notify address gets the email (first
  unread only). Unknown numbers have no assignee → owners + default lead user.
- **Who can see it:** Sales roles without "sees all leads" only see contacts
  assigned to them; an unknown number has no assignee, so only
  owners/managers see that thread. Tech role has no Messages at all.
- **Telnyx side (not code):** the number must sit on the line's messaging
  profile with the inbound webhook URL `${NEXTAUTH_URL}/api/public/webhooks/telnyx`,
  and the 10DLC campaign must be live — both true for Lessly Holdings since
  2026-09-28 (texts from known numbers land). Production HTTP logs only show
  the last 500 requests, so inbound webhook hits could not be confirmed from
  the laptop today.

## Files
`public/sw.js`, `public/offline.html`, `lib/push-open.ts` (+
`scripts/test-push-open.ts`), `components/AppShell.tsx`,
`components/NativeShell.tsx`, `app/platform/layout.tsx`,
`app/platform/open/page.tsx` + `OpenSwitch.tsx`,
`app/api/public/webhooks/telnyx/route.ts`,
`app/platform/messages/thread/[contactId]/page.tsx` + `SaveContactCard.tsx`,
`app/api/app/contacts/[id]/route.ts`, `e2e/specs/contacts-crm.spec.ts`.

## Help Center
Revised (David 2026-10-03): `messages-inbox` (phone.ts) gained "A text from a
number you don't know" (Save card, Lead/Client/Contact, Add to existing);
the Notifications guide (account.ts) says a tap opens the page inside the
open app, with the Opening… card on a cold radio.

## Not done
- Merging two SAVED clients (profile conflicts) — out of scope; the merge
  route refuses it.
- Native apps: the shell code is served live, so no store build is needed.
