# Messaging from the card + business contacts + texting status (2026-09-28)

Built on branch `texting-contacts` the day Lessly Holdings' 10DLC campaign
went live at Telnyx while Settings still said "The carriers sent the texting
application back". Four asks from David, one batch.

## What changed

### 1. Texting status stuck on REJECTED
Root cause (production row, read with `scripts/diag-texting.mjs`): the
campaign was filed 2026-09-25 and the same call tried to bind the number
while the campaign was still `TCR_PENDING`. Telnyx refused ("Campaign … is
still pending and has not been approved yet"), `advance()` threw a
`LineError`, and `fileFromRow` recorded that error text as the rejection
reason with status REJECTED. Nothing re-reads a REJECTED row: the hourly
sweep only took the pending statuses, the 10DLC webhook returned early on
REJECTED, and the card had no Check now in that state. Meanwhile
`lib/sms.ts companySender` requires status ACTIVE, so no text went out
from the line even though the carriers had approved it.

Fixes in `lib/business-line.ts`:
- `deriveRegistration`: `assign_number` only once the campaign is past TCR
  (`TCR_ACCEPTED`, `MNO_PENDING`, `MNO_ACCEPTED`, `MNO_PROVISIONED`); while
  `TCR_PENDING` it waits. Pinned in `scripts/test-business-line.ts`.
- `LineError.transient`: `advance()` marks its mid-chain Telnyx failures
  transient; `fileFromRow` rethrows those without stamping REJECTED.
- Hourly sweep also re-reads campaign-stage REJECTED rows (10DLC with a
  campaignId) — the GET is free and a portal-side appeal re-queues silently.
- `refreshByTelnyxId` (webhook) no longer short-circuits REJECTED.
- Settings card: the campaign-stage rejected state has a Check now button.

After deploy the sweep (≤ 1 h) or Check now re-reads Lessly Holdings:
campaign `MNO_PROVISIONED` → binds the number → `PENDING_ASSIGNMENT` →
next check `ASSIGNED` → ACTIVE, owner gets the "Texting is on" push/email.

### 2. Message from the contact card
- Desktop header: **Message** button (before Call / Text) → the client's
  conversation at `/app/messages/thread/<id>`. Tooltip says whether it
  texts from the line or reaches the portal + email.
- Phone: **Message** circle first in the action row (`JobActionRow
  messageHref`). "Text" beside it still opens the phone's own Messages app
  from the tech's number.

### 3. New message on the inbox
`app/platform/messages/NewMessageButton.tsx`: New message → glass modal
(desktop) / bottom sheet (phone) with a search over name, company and phone
digits (picker feed `/api/app/contacts`, now also returning `companyName`,
`phone`, `kind`). Picking someone lands in their thread — an existing one
or an empty one; the thread page already handles a contact with no
messages. The composer shows the channel line: "Texts Jane from (469)
860-5060 · replies land here" / "Reaches Jane in their client portal and by
email" / "No phone or email on file".

### 4. Business contacts
`Contact.kind` (`CLIENT` | `CONTACT`, default CLIENT; `db:push` adds the
column, no backfill needed). A CONTACT is a business connection — sub,
supplier, referral partner, inspector:
- never a LEAD, never on the Leads board (API forces status ACTIVE and
  clears the stage; the form hides Lead for them);
- Clients page gets a **Contacts** tab (`?status=CONTACTS`); the default
  Clients tab hides them; search still finds them; New Contact from that
  tab (`/app/contacts/new?type=contact`); phones use the FAB → the form's
  third option;
- the create form has Lead / Client / **Contact**; the edit form has a Type
  select;
- they appear in every picker (jobs, quotes, appointments…) and in the New
  message picker with a "Contact" tag;
- **first job → client**: `lib/pipeline.ts becomeClient` runs in the jobs
  POST route and quote conversion, inside the transaction.

## Test recipes

Texting status (David, after deploy):
1. Settings → Phone & texting. The card should say either "Texting is on"
   already (the sweep ran) or still show the rejected card **with a Check
   now button**. Press it. Expect "Carriers are reviewing…" (number bound,
   assignment pending) or "Texting is on". If still pending, Check now
   again after a minute.
2. Open any client with a phone → Message → send "test". Their phone gets
   a text from (469) 860-5060 prefixed "Lessly Holdings:". Reply from the
   phone → the reply appears in the thread within ~15 s and in the inbox.

Contact card:
3. Desktop: a client's card shows Message · Call · (Text on Mac) · Call
   from line · Email · Edit. Message opens the thread. Phone: the circles
   read Message · Call · Text · Directions.

New message:
4. Messages → New message. Type part of a name, a company, or 3+ digits of
   a phone. Pick someone with no history → empty thread with the channel
   line under the composer. Pick someone with history → the same thread as
   the inbox row.

Contacts:
5. Clients → Contacts tab → New Contact → save "Sam Supplier". Sam shows a
   grey "Contact" dot, is not on the Clients tab, not on the Leads board.
6. Search "Sam" from the Clients tab → found. Message Sam from the card →
   works (portal + email line, or text if Sam has a phone).
7. Create → Job for Sam → Sam's chip disappears (they are a client), Sam is
   on the Clients tab.
8. Edit an existing client → Type: Contact → they move to the Contacts tab;
   a Lead switched to Contact leaves the board.

Automated: `npm run test:unit` (25/25), `npx tsc --noEmit`, `npm run
check:design`, `npx next build`; e2e `contacts-crm.spec.ts` gained "a
business contact is never a lead and becomes a client with their first
job" (kind, status, no stage, message thread POST, job → CLIENT).

## Round 2 (same day)

**Status still not ACTIVE.** Production after the deploy: the row moved
REJECTED → CAMPAIGN_PENDING and the number was bound at 20:58; Telnyx shows
the binding `PENDING_ASSIGNMENT` (AT&T and T-Mobile mapping still
`PENDING`). That is the carriers' last step, typically hours. The sweep
flips it to ACTIVE on its own; the card now says "Approved — the carriers
are attaching your number" for this exact state instead of "reviewing".

**Text a typed-in number** (only with a business line):
- Messages → New message → type a 10-digit number nobody has → "Text (xxx)
  xxx-xxxx" row → `POST /api/app/messages/new-number` → a PLACEHOLDER
  contact named after the number (`Contact.placeholder`, hidden from
  Clients, the Leads board and every picker; a known number reuses its
  contact) → the thread.
- The thread shows a "Who is (xxx) xxx-xxxx?" card: first/last, company,
  Lead / Client / Contact, Save → `PATCH` clears the placeholder, sets
  kind/status, a lead enters the board, `lead.created` / `client.created`
  fire. The card disappears once saved.
- Without a line the picker never offers the row and the route answers 409.

**White on white.** Lessly Holdings' secondary brand color is `#FFFFFF`.
`Monogram` painted a third of all people (by name hash) with the secondary
fill and hard-coded white initials → white circle, white letters, in dark
mode especially (the light theme darkens the fill to a readable grey). The
initials now use the matching `--ds-on-primary` / `--ds-on-secondary` ink.

Recipes:
9. Messages → New message → type your cell (not the line). Expect the
   "Text (…)" row; tap → empty thread titled with the number, Save card on
   top. Send "hi" → your cell gets it from (469) 860-5060 once texting is
   ACTIVE. Fill the card as a Lead → title becomes the name, card gone, the
   lead is on the Leads board. Clients list never showed the number.
10. New message → type a number already on a client → their thread, no
   "Text" row.
11. Dark mode, Clients list and Messages inbox: every monogram's initials
   readable (black letters on the white circles).

## Decisions taken without asking (flag if wrong)
- Contacts are a `kind` on Contact, not a new model: the thread, calls,
  notes, custom fields and pickers all keep working for them unchanged.
- A contact stays in every picker so a job can be created for them; the
  job is what makes them a client (also via quote conversion).
- The Contacts tab lives on the Clients page as a filter, not as a nav
  item — David asked for it "accessible from the client page".
- The personal-phone "Text" button stays next to the new "Message" button.

## Round 3 (same day, texting live)

David's first live texts: the thread and inbox felt slow, and every reply
went out as "Lessly Holdings: … Reply STOP to opt out." — a name nobody who
texts him knows him by.

**Live conversations.** `TeamThread` polls every 3 s whenever texts are in
play (the channel is SMS, or the thread holds an inbound text) — the same
tick website chat already had — and catches up the moment the tab or phone
comes back to the foreground. Portal-only threads keep the 15 s tick. The
inbox got `InboxLive.tsx`: a 4 s heartbeat against `GET
/api/app/messages/latest` (the company's newest message stamp, one indexed
row) that re-renders the list only when something landed.

**Bare texts.** `conversationText` in `lib/portal-messages.ts` is what a
thread reply goes out as: the message itself, up to ~1,000 chars (was cut at
260), no company prefix, no opt-out tail. The single exception is the first
text the business ever sends someone who has never written it and never
been texted by it — that one ends "— David at Lessly Holdings. Reply STOP to
opt out." because a business-initiated conversation has to say who is
texting and how to stop, once (CTIA). Someone who texted first never sees
it. Telnyx still honours STOP at the edge on every message. Automated texts
(appointment reminders, invoice links, schedule changes) keep their brand +
STOP wording: they are the registered campaign's templates, not a
conversation. Pinned in `scripts/test-conversation-text.ts`.

Recipes:
12. Open a thread with someone who has texted you. Have them text you: the
    bubble appears within ~3 s, no tap needed. Leave the thread open in a
    background tab, come back — it catches up instantly. Reply: their phone
    gets just the words, nothing before or after.
13. Messages inbox open on the desktop; a text arrives — the row moves to
    the top with the bold unread count within ~4 s, no reload.
14. New message → type a number you have never texted and that never texted
    you → send "Hi". That phone gets "Hi" plus one line "— David at Lessly
    Holdings. Reply STOP to opt out." Send a second message: bare.
