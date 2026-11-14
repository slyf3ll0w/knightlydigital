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

## The cases (21 owners, 60 jobs, one change request)

- Fencing, owner's rates: simple cedar, four materials with gate openings deducted, per-foot upgrades, a percent height factor and cash discount, price-book only.
- Fencing change request: six changes at once to a finished tool (the kind that failed on 2026-11-12).
- Other trades, owner's rates: pressure washing, mowing, interior painting, house cleaning, gutter cleaning, tree removal, junk removal, roofing, concrete, an HVAC flat menu.
- No rates given: fencing (skipped questions, and one answered), mowing, pressure washing, house cleaning, concrete.

## Growing it (the continuous part)

- **Every real miss becomes a case.** A ticket about a wrong estimate → the owner's words, the job, the right price, added to `cases.ts`. The fix ships only when the scorecard holds.
- **Per company (not built yet):** when an owner edits a quote that came from a tool, save the before and after as that company's correction; the builder reads the company's corrections on the next change, and a repeated correction is offered as a rate change. One company's corrections never reach another's.
- **Across companies (not built yet):** the same kind of correction turning up in many companies is a builder fix and a new case.

## Status

- 2026-11-14: harness and answer key written. Smoke run of two cases on the staging Gemini key: both built, gutter cleaning 3 of 3 jobs right; the staging key then ran out of quota. **No full run yet** — it needs a model key with room (see the memory file for where this stands).
- Found before any full run: the builder's market check holds a tool against the trade's one "typical job" whatever the tool is for — a gutter CLEANING tool was told its typical job should sell for $1,400–$2,600 (that is gutter installation), and an HVAC tune-up menu was held against a $8,000–$15,000 system replacement. Those lines reach the owner as warnings.
