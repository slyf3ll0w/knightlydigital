# Estimate tools that learn from the owner's own quotes (2026-11-17)

Item 1 of `ahead-of-the-curve-2026-11-17.md`, and the "per company" step of
`estimator-standard-2026-11-14.md`.

David: "we just have to REALLY make sure that it's giving good suggestions and
not looking like it's making dumb predictable suggestions."

## What it does

When an owner keeps changing the same thing on quotes that came from a tool,
the tool's Overview shows **From your quotes**: "Cedar fence: you charge about
$34 per ft, the tool says $31", the quotes behind it, and one button. Nothing
changes until they press it, and the old rules stay under History.

## The rule that keeps it honest

Nothing is offered unless it is proven on the owner's own quotes. A candidate
change is applied to a copy of the tool, each recent job is priced again from
its saved answers, and the change is offered only when it reproduces what the
owner actually sent. No model is involved: it is arithmetic, so it costs
nothing, gives the same answer every time, and is scored exactly.

The bar (`CORRECTION_BAR` in `lib/estimator-corrections.ts`):

- At least three quotes behind any suggestion.
- The edit is on at least three of the last five quotes AND three quarters of
  them, or on the last three in a row (prices went up recently).
- The edits agree with each other within 5% and all go the same way.
- The change is at least 2%.
- With the change, the tool matches what was sent (within 2%) on at least
  three quarters of the quotes behind it, and on more recent quotes than today.
- A raise is held back when two or more of those quotes were lost and none won.
- Quotes older than 180 days do not count.

What is never a correction:

- Rounding ($4,402 sent as $4,400).
- A changed quantity at the same unit price (a measurement, not a price).
- The quote's discount field (a favour to one client).
- A quote the tool no longer prices the same way (its lines changed since).
- A website quote that went out on its own, with no person looking.
- A quote with lines from more than one tool run.

## The five suggestions

| Kind | Example | How it is applied |
|---|---|---|
| A rate | "Cedar fence: you charge about $34 per ft, the tool says $31" | Directly, as a rate-card edit |
| A price-book price | "Post caps: you charge about $15, your price book says $12" | Directly, on the price-book item (it applies everywhere the item is used) |
| The minimum | "Small jobs: you charge at least $1,500" | Directly |
| A line they keep typing in | "You keep adding Haul-away by hand" | Handed to the Atlas builder as a change request (uses Atlas tokens) |
| A line they keep taking off | "You keep taking Permit handling off" | Handed to the Atlas builder |

When two rates could explain the same edits (the cedar price or the height
factor), the one that fits more of the recent quotes wins and the other is
dropped.

`Not now` hides a suggestion until three more quotes back it up.
`Don't suggest this again` hides it for good.

## The scorecard

`scripts/test-estimator-corrections.ts` (runs with the unit tests, no database,
no model): 37 simulated owners on a fence tool. 15 are real patterns that must
be offered with the right number; 21 are traps where the right answer is
silence; one checks a dismissed suggestion comes back when it should.

**2026-11-17: 37 of 37 right, silent on 21 of 21 traps.**

Every real miss in production becomes a case here, the same as the estimator
answer key.

## How it is stored

- `EstimatorQuoteRun`: one row per quote made from a tool run. It holds the
  answers and the lines the tool produced. The server runs the tool again from
  the answers to get those lines; it never trusts lines a browser sent.
- What was sent is read from the quote itself: its first revision when it was
  edited after sending, otherwise its lines today. Nothing is copied at send time.
- `Estimator.suggestionState`: the suggestions the owner has answered.
- Every read is by company. One company's quotes never reach another's tool.

Captured from: the quote editor's "Add to quote" and "Create quote" (new quotes
and drafts), website estimate forms that create a draft for review, and quotes
Atlas makes from a tool run in the same request (`ctx.lastEstimate`).

## Added the same day (second round)

- **Atlas-made quotes are captured.** Atlas files lines under their price-book
  names, so a line off and a line on with the same quantity and price is now
  read as the same line renamed, not as one removed and one added.
- **Price-book prices.** A line priced straight from the price book is checked
  the same way as a rate; the suggestion changes the price-book item.
- **The builder reads corrections.** A change request on an existing tool is
  told what the owner's sent quotes show ("Cedar fence: you charge about $34
  per ft, the tool says $31"), as facts. It is told not to apply them unless
  the request asks, and to use the owner's number when the request touches one
  without giving a value. **The estimator answer key was not re-run for this**
  (it needs a model key); the text is only added when a proven suggestion exists.

## Added the same day (third round)

- **Rounding.** A tool can now round its price (`spec.roundTo`: $5, $10,
  $25, $50 or $100; nearest or always up). It is applied last, after the
  minimum and any discount, and the largest line takes the difference. It is
  on the rate card as **Round prices**. When nearly every recent quote went
  out with only the total rounded, the same way each time, "You round your
  prices to the nearest $25" is offered. Rounding is still never read as a
  rate change. Not offered for tools with discount rules (the quote's
  discount is not kept with the run, so its total cannot be read).
- **Across companies.** The platform console has a **Corrections** page
  (`/superadmin/corrections`): every company's proven corrections, grouped
  by trade and kind, with the ones seen in more than one company first. It is
  read-only and for platform staff. Nothing on it reaches another company or
  changes anyone's tool. A pattern there is a builder fix and a new case on
  the estimator answer key, done by hand.

Scorecard after this round: **41 of 41, silent on 22 of 22 traps.** Live
check against a local database: rounding offered, applied, and the tool then
priced all six quotes to within the cents a quote's unit price can hold; two
companies with the same correction showed as one pattern.

## Not built yet

- **Acting on a cross-company pattern automatically.** Deliberately manual.
- **Rounding on tools with discount rules.**
- **Across companies (superseded by the note above):** the same correction in many companies as a builder fix.
  Only counts would cross, never a company's data.

## Checks done

- Scorecard 33 of 33; unit tests green; `tsc` clean.
- Live against a local throwaway database: six quotes saved, sent with cedar
  raised to $34, the report offered $34 with 6 of 6 matched, another company
  read nothing, a second run on a quote dropped its row, and applying the
  change cleared the suggestion.
- **Not checked:** the card in a browser. David: make three or more quotes
  from one tool, change the same price the same way, send them, and open the
  tool's Overview.
