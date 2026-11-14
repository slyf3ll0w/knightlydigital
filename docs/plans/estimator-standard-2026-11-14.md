# The estimator standard and scorecard (2026-11-14)

David: "find a standard and do some training for the estimator tool, and then once that is good, add new features and train them."

## The standard

A tool the builder makes is good when:

1. **It builds.** Every request ends in a saved tool, never "couldn't answer".
2. **It prices the owner's way.** When the owner gave their rates, a job run through the tool comes to what the owner would charge by hand, within 2% (a dollar of rounding never fails a job).
3. **The owner's numbers are on the rate card, marked theirs**, and their minimum is the tool's minimum.
4. **Nothing is passed off as theirs.** When the owner gave no rates, every price is labelled an estimate to confirm.
5. **It lands in the market.** With no rates given, the typical job prices inside what published cost guides say it goes for.
6. **The form has a place for everything** that changes the price of a real job.

Launch bar: every case builds, 95% of owner-rate jobs right, 90% of market jobs in range. A new AI feature gets its own answer key and the same bar before it ships.

## How it is scored

`scripts/eval-estimator/cases.ts` is the answer key: one owner per case (their words to the builder) plus real jobs with the right price, written as plain arithmetic from that owner's own rates. No customer data is needed for this — the right answer is whatever the owner's stated rates come to. Published market prices are used for two things only: making the cases realistic, and bounding the cases where the owner gives no rates (`estimator-market-ranges-2026-11-14.md`).

`scripts/eval-estimator/run.ts` runs it: a throwaway company in a local database → the real builder (same code and model as the app) → the saved tool. A second, stronger model reads each job's facts and fills in the tool's form as a customer would; the tool's own math prices it; the total is held against the answer. It writes a scorecard (`.md`) and the full detail (`.json`).

```
DATABASE_URL=<local throwaway Postgres>  ANTHROPIC_API_KEY=…  GEMINI_API_KEY=…
npx tsx scripts/eval-estimator/run.ts [--only id,id] [--concurrency 4] [--label name] [--out dir]
```

The script refuses a Railway database. `AI_MODEL_ASSISTANT` swaps the model being tested (to compare Haiku against Sonnet on the same key); `EVAL_GRADER_MODEL` swaps the grader.

## The cases (22 owners, 63 jobs, one change request)

- Fencing, owner's rates: simple cedar, four materials with gate openings deducted, per-foot upgrades, a percent height factor and cash discount, price-book only.
- Fencing change request: six changes at once to a finished tool (the kind that failed on 2026-11-12).
- Other trades, owner's rates: pressure washing, mowing, interior painting, house cleaning, gutter cleaning, tree removal, junk removal, roofing, concrete, an HVAC flat menu.
- No rates given: fencing (skipped questions, and one answered), mowing, pressure washing, house cleaning, concrete.

## Growing it (the continuous part)

- **Every real miss becomes a case.** A ticket about a wrong estimate → the owner's words, the job, the right price, added to `cases.ts`. The fix ships only when the scorecard holds.
- **Per company (not built yet):** when an owner edits a quote that came from a tool, save the before and after as that company's correction; the builder reads the company's corrections on the next change, and a repeated correction is offered as a rate change. One company's corrections never reach another's.
- **Across companies (not built yet):** the same kind of correction turning up in many companies is a builder fix and a new case.

## Customer photo and description fill-in

The "add a photo or describe the job and Atlas fills in the form" step (lib/estimator-assist.ts) is part of the standard:

- When the owner asks for it in their words, the tool must come back with fill-in ON and instructions written (`wantsFillIn` on a case).
- A job can carry `said` — the customer's own words as typed on the web form — and `photo` — a file under `scripts/eval-estimator/photos/`. The job is then priced a second time by the real fill-in and must come to the same answer.
- Scored today: descriptions (case `fence-fill-in`). **Photos: none yet** — the runner takes them, the answer key has none. Needed: 10–20 real job photos with what each shows (length, material, what is in the way).

## Status

- **2026-11-14, Haiku 5.5 builder, Sonnet 5.5 grader.** Baseline: 21 of 22 tools built, 52 of 53 owner-rate jobs right, slowest build about 7 minutes. After the fixes below (full run): 23 of 23 built, 55 of 56 owner-rate jobs right, 5 of 6 market jobs in range, fill-in 3 of 3, slowest about 5 minutes; a re-check of the cases touched by the last fix passed 6 of 6.
- **What the scorecard found and what was changed:**
  - A no-rates fence build thought to the 32k cap and came back cut off (the 2026-11-12 ticket's fault). A cut-off answer now retries lean. Capping effort at "medium" was tried and dropped: 49 and 51 of 53 against 52 and 53 at full effort.
  - `honestSources` turned the owner's own percentages ("10% off for cash") into estimates to confirm — whole numbers under 20 only counted after a "$". Fixed, unit-tested.
  - The market check held owner-rate tools against the trade's one typical job (gutter cleaning vs installation, a tune-up menu vs a system replacement). It now runs only when the numbers are guesses, and then it is tight (within 10% of the range).
  - The playbook beat the owner's stated method (gate openings deducted after "full line, gates on top"). New first principle: the owner's way wins.
  - The minimum written as a rate plus its own line left `minimumTotal` empty, and the owner was told the tool had no minimum. Now sent back (`minimumAsRate`).
  - Baselines: house cleaning raised to published ranges; "trip minimum" rows became minimums (they were read as an added fee); concrete trimmed.
- **Still open:** forms that cannot express a real job turn up from run to run (one tree only; a house wash that forces a driveway); the no-rates house-cleaning tool prices by bedrooms and lands just under the national range; a no-rates build sometimes skips its questions to the owner; photo cases need photos. The builder varies from run to run by a job or two — judge a change on two runs, not one.
- **Running it on this machine:** `--concurrency 2`; three at a time plus the local database has been killed for memory twice. The scorecard is written after every case.
