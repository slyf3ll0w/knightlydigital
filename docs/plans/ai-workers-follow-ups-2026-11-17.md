# AI workers, the first one: Follow-ups (2026-11-17)

Item 2 of `ahead-of-the-curve-2026-11-17.md`: back-office workers that draft,
with a person sending. David's rule (2026-11-14): AI does not talk to
customers, people do.

## The pattern every worker follows

Taken from the estimator work (`estimator-standard-2026-11-14.md`,
`estimator-corrections-2026-11-17.md`):

1. **Deciding is arithmetic, not a model.** Who gets a follow-up is a set of
   plain rules over the company's own records. It costs nothing, gives the
   same answer every time, and is scored exactly.
2. **Most of the answer key is traps.** The cases where the right answer is
   silence outnumber the cases where it is an offer. A worker that nags the
   wrong client once gets switched off.
3. **A model only writes, and what it writes is checked.** Every draft goes
   through a check that knows the facts. A draft that fails is thrown away.
4. **A person sends.** The worker's output is a draft on a page. Sending goes
   through the same route as any message a person types.
5. **Every real miss becomes a case.**

## What Follow-ups does

`/app/follow-ups` (menu: Work → Follow-ups; a "Follow-ups worth sending" row
under **Needs you** on Home) lists the quotes and unpaid invoices worth a
personal nudge today, one card per client: who, which document, how much,
and the plain facts behind "why now" (sent 12 days ago, opened twice, both
automatic reminders done). **Write the message** produces a draft; the person
edits it and presses **Send text** or **Send email**. **Not now** hides it
for a week, **Don't follow up on this one** for good.

Above the list, **Reply first**: clients who wrote or called and got no
answer. Below it, **Left alone today**: how many open documents were left off
and why.

The automatic reminder emails (`lib/reminders.ts`: quotes at 3 and 7 days,
invoices on the due date and 3, 7 and 14 days after) are untouched. Follow-ups
starts where they stop and stays out of their way while they run.

## Who gets one (`lib/follow-ups.ts`, `FOLLOW_UP_BAR`)

A quote is offered when it has been out 4 days and the automatic reminders
are done (or cannot run: no email on file), or sooner when the client keeps
opening it (3 or more views, the last within 2 days, at least 2 days after
sending) or it expires within 4 days.

An invoice is offered from 5 days past due.

Never, whatever the above says:

- The client wrote, called or left a voicemail and nobody answered. They go
  under Reply first instead.
- The client wrote or called in the last 7 days (the conversation is live).
- A person texted, emailed or called them in the last 4 days (6 after an
  earlier follow-up on the same document).
- An automatic reminder went out in the last 2 days (invoice) or 3 (quote).
- Three follow-ups have gone unanswered.
- A note on the client, quote or invoice says to hold: do not contact, will
  call us, payment plan, waiting on insurance / financing / HOA, a death or
  hospital stay, a dispute (`holdNoteIn`; notes older than 180 days are ignored).
- A visit with the client is within 7 days.
- Invoice: a saved card will be retried, part was paid in the last 7 days,
  under $5 is left, or it is more than 120 days late.
- Quote: expired, replaced by a newer quote, or more than 45 days old.
- Archived clients, business contacts, and anyone with no email and no number
  that can be texted.
- The person said Not now (a week) or Don't follow up.

One message per client: an unpaid invoice beats a quote, the client's other
past-due invoices ride along in the same message, and their open quote waits.

A follow-up that was sent is not stored anywhere new. It is the team's own
message, email or call, read where it already lives, so a follow-up sent from
the Messages page or by phone counts the same as one sent from this page. The
only new table is `FollowUpSkip` (Not now / Don't follow up).

## What the message may say (`checkDraft`)

The model gets the facts of the document and nothing a client wrote. Its
draft is rejected when it:

- names an amount, percentage, document number, date or weekday that is not
  on the document;
- adds a late fee or interest, offers a discount, or sets a deadline;
- threatens (collections, legal, credit) or pressures (final notice, urgent);
- mentions a past call or conversation, promises a start date or a place on
  the schedule, promises never to write again, or says how payment works;
- mentions AI, automation or WorkBench;
- carries a link (the app adds the real one), a blank to fill in, emoji,
  capitals, or more than one exclamation mark;
- greets the wrong person, leaves the client's name out, or does not say
  which document it is about;
- runs past 320 characters for a text or 900 for an email.

One retry with the reasons, then the built-in wording (`builtInDraft`), which
is also what an account with Atlas off or out of tokens gets. A person's own
edits are not checked: they are the person's words.

Links: an invoice link goes with a text or an email. A quote link goes by
email only, and a quote follow-up goes by text only when the client has no
email (the texting registration covers account notices; quote links by text
were what the carrier reviewer called marketing on 2026-09-24).

## The scorecards

**`scripts/test-follow-ups.ts`** (runs with the unit tests; no database, no
model). 2026-11-17: **53 of 53 right, silent on 36 of 36 traps.** 34 of 34 bad
drafts thrown away, 7 of 7 good drafts let through, and all 240 built-in
messages (every kind, channel, tone and awkward name) pass their own check.

**`scripts/eval-follow-ups/run.ts`** (real model calls; needs a model key, no
database). The same `writeDraft` production runs, then a stronger model reads
each draft against the facts. Launch bar: at least 90% of cases end with a
model-written draft within two tries, the grader finds an invented fact in
none, and would send at least 90% as written.

2026-11-17, Haiku 5.5 writing, Sonnet 5.5 grading, 18 cases three times over:

| Run | Model-written | Invented facts | Would send as is |
|---|---|---|---|
| First | 54 of 54 | 3 | 50 of 54 |
| After the checks below | 54 of 54 | 0 | 52 of 54 |

The first run's misses, each now a rule and a case: "the work we talked
about" (no conversation is on record), "we'll get your job on the schedule"
and "get your spot set up" (a promise), "you can settle both in one payment"
(how payment works), "I won't reach out again" (a promise). The grader was
also told that offers the tone asks for (answering questions, changing the
quote, a payment plan) are not inventions; before that it counted two of them.

The two it would still not send as written were both a "Thanks, Maria" sign-off
it read as the wrong signature.

## For Atlas and connected AI apps

- `list_follow_ups` (read): today's list with the facts, who is waiting on a
  reply, and what was left alone. Atlas writes the message in the
  conversation and stages it with `reply_in_portal` or `email_client`, so it
  goes through the usual card and the usual Send.
- `update_follow_up` (prepares): Not now / never / undo.
- The page's own **Write the message** button has no tool: it spends Atlas
  tokens, and in a conversation the model writing is the conversation itself.

## Files

- `lib/follow-ups.ts`: rules, `checkDraft`, `builtInDraft`, the prompt, `writeDraft`. Pure.
- `lib/follow-ups-server.ts`: reads the records, `loadFollowUps`, `draftFollowUp`, `skipFollowUp`.
- `app/api/app/follow-ups/` (`GET` list, `draft`, `skip`); sending uses
  `/api/app/messages/[contactId]` and `/api/app/contacts/[id]/message`.
- `app/platform/follow-ups/`: the page.
- `lib/assistant/follow-ups.ts`: the two tools.
- `e2e/specs/follow-ups.spec.ts`.

## Not done

- No push or email telling the owner "3 follow-ups are waiting": it is on Home
  and in the menu only.
- Mixed past-due invoices link to the first invoice only.
- The model scorecard is not in CI (it needs a model key).
- No cross-company console view of what gets sent or skipped.
- The next workers on the list: review requests after a paid job, expense
  categorizing, next-day schedule tidy-up, morning brief.
