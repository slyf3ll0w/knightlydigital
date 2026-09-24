# Automations builder — build plan (2026-09-24)

**Status: PLANNED 2026-09-24. Building on branch `automations-builder`.**

## What David asked for (2026-09-24)

A simple Zapier for WorkBench. A page listing automations; create one; add a
trigger, conditions, and actions as cards in a vertical Zapier-style stack;
drag to reorder. Keep the feature simple so it is easy to verify, but give
users enough triggers and actions that almost anything can be automated.
Atlas must be able to create and edit automations the same way it builds
estimate tools (a panel on the page that drafts the cards in place).

### Decisions (David, 2026-09-24)

| Question | Answer |
| --- | --- |
| Placement | Top-level **Automations** page under Business (rail + phone More sheet). Settings row keeps pointing at it. |
| Shape | **Linear only**: one trigger → filter cards → action cards. No branches. |
| Delay step | **In v1**: "Wait N hours/days". |
| SMS action | **Yes**, consent-gated through `sendSms` / `canText`. |
| Money / destructive | **None.** No charging, no deleting, no archiving, no status changes. |
| Outbound webhook | **Yes**, SSRF-guarded "Send to URL". |
| Schedule trigger | **Yes**, daily at an hour / weekly on a weekday (hourly cron precision). |
| Who builds | **Owners and admins.** |
| Test button | **Dry run only** (last 30 days: would have fired N of M, samples, rendered first action). |
| Limits | Keep 30 rules / 5 actions per rule. Filters and waits don't count toward 5; 12 steps total. |
| Atlas edits | **Panel on the builder page** (like Estimates' BuildPanel): a sentence → cards update in place → Save. |
| Catalog | **Full** trigger + action list below. |

## What already exists (shipped 2026-09-19, `fe96f5d`)

- `lib/automations.ts` — spec v1 (`trigger` + `when` expression + `actions`),
  compiler, plain-English describer, evaluator, `AUTOMATION_GUIDE`.
- `lib/automations-server.ts` — `fireAutomations()` (fire-and-forget after
  commit), `runAutomationSweeps()` (hourly), `previewAutomation()` (dry run),
  `loadContext()` per entity. Dedupe = one `AutomationRun` per
  (automation, entity, event). 300 ok runs / company / day. Email caps.
- 9 triggers, 5 actions, Atlas `manage_automation` tool, list page at
  `/app/settings/automations`, `scripts/test-automations.ts`.

Everything below **extends** this. v1 specs keep compiling (they are
normalized to v2 on read), existing rules keep running unchanged.

## Spec v2 (`lib/automations.ts`)

```ts
type AutomationSpec = {
  version: 2;
  trigger: {
    event: TriggerName;
    days?: number;                       // sweep triggers
    hours?: number;                      // "starts in N hours" sweeps
    schedule?: { every: "day" | "week"; hour: number; weekday?: 0-6 }; // schedule.tick
    stage?: string;                      // lead.stage_changed: only this stage (optional)
  };
  steps: Step[];
};

type Step =
  | { type: "filter"; match: "all" | "any"; rules: Rule[]; expr?: string }   // "Only continue if…"
  | { type: "wait"; amount: number; unit: "hours" | "days" }                 // "Wait…"
  | Action;

type Rule = { field: string; op: Op; value?: string | number };
type Op = "eq" | "neq" | "contains" | "not_contains" | "starts" | "empty" | "not_empty"
        | "in" | "gt" | "gte" | "lt" | "lte" | "before" | "after"
        | "weekday" | "weekend" | "between_hours";
```

- A `filter` compiles to the existing expression language (`==`, `contains(lower(x), lower(y))`,
  etc.), so evaluation is unchanged. `expr` is the Advanced escape hatch;
  when set it wins over `rules`.
- The builder shows the first filter step (if it directly follows the
  trigger) as the "Conditions" section; later filters render as
  "Only continue if…" cards between actions (the after-a-wait re-check).
- v1 → v2: `when` becomes `steps[0] = { type: "filter", match: "all", rules: [], expr: when }`, then the actions.
- `describeAutomation` renders every step in plain English (cards, Atlas confirmation, list page).
- Context gains per-entity fields (below). Templates stay `{field}`, `{field|money}`, `{field|int}`.
- Webhook trigger context: top-level scalar keys of the JSON body become `data_<key>`; any `data_*` identifier compiles for that trigger.
- Schedule trigger context: company fields + `today` (YYYY-MM-DD), `weekday` (Mon…), `hour`, and counts: `open_quotes`, `overdue_invoices`, `jobs_today`, `unscheduled_jobs`, `new_leads_today`.

### Limits

`AUTOMATION_LIMITS`: actions 5, steps 12, perCompany 30, dailyRuns 300, sweepBatch 200, maxDays 120, maxWaitDays 60, webhook 5 s timeout / 64 KB body.

## Engine changes (`lib/automations-server.ts`)

- `loadContext()` learns new entity types: `call`, `message`, `contract`, `payment`, `time_entry`, `subscription`, `expense`, `company` (schedule), `webhook`.
- Steps run in order. A `filter` that fails ends the run as `skipped` with detail "stopped at step N". A `wait` writes an `AutomationJob` row (below) and ends the run with status `waiting`; the hourly `runAutomationResumes()` reloads context (fresh status!) and continues from the next step. The same `AutomationRun` row is updated, not duplicated.
- New `AutomationJob` model: `{ id, automationId, runId, companyId, event, entityType, entityId, nextStep Int, resumeAt DateTime, status "waiting"|"done"|"cancelled", createdAt }`, indexed on `(status, resumeAt)`. Pausing or deleting an automation cancels its jobs.
- Schedule trigger: `runScheduledAutomations(now)` hourly; dedupe entityId = `YYYY-MM-DD` (daily) or ISO week (weekly), so a rerun of the same hour is a no-op.
- Webhook trigger: `POST /api/public/automations/[token]` (token = `Automation.webhookToken`, generated on save when the trigger is `webhook.received`, shown in the builder). 64 KB max, 60/min per token. Dedupe entityId = a hash of body + minute.
- New actions each become one `case` in `runAction`, using existing lib helpers (never raw sends). SMS goes through `sendSms` + `canText`; portal messages through `prisma.portalMessage.create` + `notifyClientOfReply`; webhook through `fetch` behind `websiteUrlIssue` / `isPrivateIp` + DNS check; QuickBooks through `pushInvoice`/`pushEstimate`; Atlas draft through `meteredOneShot` under the automation's creator.
- Actions still never call `fireAutomations`, so rules can't cascade.

## Fire points (new triggers)

Each is one `fireAutomations(companyId, "<event>", id)` after the commit. ✓ = already wired.

| Event | Entity | Where |
| --- | --- | --- |
| request.created ✓ | request | requests/route.ts, public book/schedule, booking-checkout, estimator-lead |
| request.converted | request | requests/[id]/booking, quotes/route.ts + jobs/route.ts (when `requestId` set), to-appointment |
| request.archived | request | requests/[id]/route.ts PATCH status ARCHIVED |
| lead.created | contact | contacts/route.ts (status LEAD), lib/pipeline.ts `enterPipeline` |
| lead.stage_changed | contact | contacts/[id]/stage/route.ts, lib/pipeline.ts `autoAdvance` (when it moves) |
| lead.won | contact | lib/pipeline.ts `recordLeadWin` |
| lead.lost | contact | contacts/[id]/stage/route.ts (lost branch) |
| lead.contact_made | contact | lib/voice.ts `advanceLeadForCall` (CONTACT_MADE), messages/[contactId] POST |
| lead.no_answer | contact | lib/voice.ts (CALL_NO_ANSWER) |
| lead.stale ✓ (sweep) | contact | — |
| client.created | contact | contacts/route.ts (status ACTIVE), public lead/booking creates |
| client.archived / client.reactivated | contact | contacts/[id]/route.ts status change |
| client.note_added | contact | contacts/[id]/notes/route.ts |
| client.field_changed | contact | contacts/[id]/route.ts when customFields patch changes a value (trigger `field` option) |
| client.inactive (sweep, days) | contact | no job completed in N days, ACTIVE |
| appointment.scheduled ✓ | appointment | — |
| appointment.rescheduled | appointment | appointments/[id]/route.ts when scheduledAt changes, hub/visits/reschedule |
| appointment.cancelled / completed / no_show | appointment | appointments/[id]/route.ts status change, lib/approval-bookings |
| appointment.upcoming (sweep, hours) | appointment | SCHEDULED and scheduledAt within N hours |
| appointment.no_quote (sweep, hours) | appointment | COMPLETED N hours ago, contact has no quote since |
| quote.sent ✓ / quote.approved ✓ / quote.unanswered ✓ | quote | — |
| quote.viewed | quote | public/viewed/route.ts (first view) |
| quote.changes_requested | quote | lib/quote-approval.ts |
| quote.converted | quote | jobs/route.ts when quoteId set / quotes/[id]/convert |
| quote.deposit_paid | quote | lib/payments.ts deposit path |
| job.created | job | jobs/route.ts, lib/subscriptions visit generation (flag `recurring`) |
| job.scheduled | job | jobs/route.ts / jobs/[id]/route.ts when scheduledAt set or changed |
| job.assigned | job | jobs/[id]/route.ts assignment change |
| job.started | job | jobs/[id]/clock/route.ts first clock-in on the job |
| job.on_my_way | job | jobs/[id]/on-my-way/route.ts, siri/on-my-way |
| job.checklist_done | job | jobs/[id]/checklist/route.ts when last item checked |
| job.photo_added / job.note_added | job | jobs/[id]/photos, jobs/[id]/notes |
| job.completed ✓ | job | — |
| job.archived | job | jobs/[id]/status/route.ts ARCHIVED |
| job.today (sweep, daily) | job | scheduled today, once per job per day |
| job.unscheduled (sweep, days) | job | ACTIVE, no scheduledAt, created N days ago |
| job.completed_ago (sweep, days) | job | completedAt N days ago |
| invoice.sent | invoice | invoices/[id]/send/route.ts, status route DRAFT→AWAITING_PAYMENT |
| invoice.viewed | invoice | public/viewed/route.ts |
| invoice.partially_paid | invoice | lib/payments.ts when !fullyPaid |
| invoice.paid ✓ / invoice.overdue ✓ (sweep) | invoice | — |
| invoice.past_due | invoice | wherever status flips to PAST_DUE (status route, reminders sweep) |
| payment.received | payment | lib/payments.ts `recordPayment`, public pay, payments/route.ts manual |
| payment.refunded | payment | payments/[id]/refund/route.ts |
| payment.autocharge_failed | invoice | lib/auto-charge.ts |
| call.inbound / call.missed / call.voicemail / call.outbound_completed | call | lib/voice.ts status transitions (COMPLETED inbound, MISSED, VOICEMAIL, COMPLETED outbound) |
| message.text_received | message | public/webhooks/telnyx/route.ts inbound |
| message.portal_received | message | hub/messages/route.ts |
| message.email_opened | message | public/open/[token] (ClientMessage first open) |
| review.requested | contact | lib/payments.ts `sendReviewRequest` |
| contract.sent / contract.signed | contract | contracts/[id]/send, contracts/route.ts, public/contract/[token] |
| team.clock_in / team.clock_out | time_entry | jobs/[id]/clock/route.ts, time-entries/route.ts |
| team.long_shift (sweep, hours) | time_entry | endedAt null, startedAt older than N hours |
| team.member_added | company | settings/team invite accept / user create |
| subscription.started / paused / cancelled | subscription | subscriptions/route.ts, [id]/route.ts, lib/subscriptions.ts |
| subscription.visit_generated | job | lib/subscriptions.ts `generateDueVisits` |
| expense.added | expense | expenses/route.ts, lib/expenses.ts recurring |
| schedule.tick | company | hourly cron, per schedule setting |
| webhook.received | webhook | POST /api/public/automations/[token] |
| manual.run | contact/job/quote | "Run automation" menu on client, job, quote pages (POST /api/app/automations/[id]/run) |

## Actions (v1)

Messaging: `notify_team` ✓, `notify_user {userId}`, `email_client` ✓, `text_client {body}`, `portal_message {body}`, `email_address {to, subject, body}`, `send_quote_link`, `send_pay_link`, `send_payment_reminder`, `send_appointment_reminder`, `request_review` ✓.

Records: `add_client_note` ✓, `add_job_note {body}`, `move_lead` ✓, `set_lead_outcome {outcome: won|lost, reason?}`, `set_client_status {status: ACTIVE|ARCHIVED}` — **dropped** (archive counts as destructive) → replaced by nothing; `set_custom_field {fieldId, value}`, `assign_job {userId}`, `add_checklist_item {label}`, `create_request {title, details}`, `create_appointment {daysOut, hour, title, type}`, `create_quote_draft {title}`, `create_invoice_draft` (from job), `create_agreement {templateId}`, `create_time_block {daysOut, hour, title}` (follow-up reminder for the assigned person).

Integrations: `push_to_quickbooks`, `send_webhook {url}`, `atlas_draft {prompt}` (result available as `{atlas_text}` to later steps).

Flow: `filter`, `wait`.

## UI

- `/app/automations` (list) and `/app/automations/[id]` + `/app/automations/new` (builder). `app/platform/automations/*`. The Settings link and `/app/settings/automations` redirect here.
- Nav: Business group in `components/AppShell.tsx` (`navGroups` + `railGroups`), `lib/mobile-nav.ts` ROOTS + LABELS, ⌘K entry.
- Builder = vertical stack: TriggerCard → ConditionsCard (rules) → StepCards (actions / wait / filter) with a connector line, "+" between steps, native HTML5 drag to reorder steps. Field pickers per entity; merge-field chip picker in every template textarea. Name + description at top; Save / Test / Pause / Delete in the header; run history and (for webhook triggers) the URL in a side panel.
### Phone (David, 2026-09-24: "iOS styling consistent with what's already there, a lot more concise and simpler than desktop")

The phone version is a **viewer and switchboard, not a card builder**. Same
patterns as the Calls / Clients phone pages: `PageTitle` large title that
collapses into the bar, `card-ledger divide-y` one-line rows, `SwipeRow`
actions, `BottomSheet` for detail, `ConfirmSheet` for delete, haptics on
toggles, section hues only in the icon tile.

- **List** (`lg:hidden` branch of the same page): one row per rule — Zap
  monogram tile, name, one muted line "When a quote is sent → 2 steps",
  status dot (green live / grey paused / red needs attention), "fired 3×
  · 2h ago". Swipe left: Pause/Resume, Delete. Sticky segmented filter:
  All · Live · Paused. Top-right "+" opens the Atlas sheet.
- **Detail** (tap a row → `BottomSheet`): the rule in plain English as a
  short numbered list (trigger, then each step), Pause/Resume pill, "Run
  history" (last 10 rows, dot + one line each), "Change with Atlas" text
  box, and a "Edit cards on desktop" note. No drag, no card editing on
  phones.
- **Create on phone** = the Atlas sheet: one text box with example
  sentences, "Build it" → the plain-English preview → "Turn it on". Same
  draft endpoint as desktop.
- Desktop (`hidden lg:block`) keeps the full Zapier-style card builder.

- Atlas panel (`AutomationBuildPanel`, modeled on `app/platform/estimates/BuildPanel.tsx` but one metered call): prompt → `POST /api/app/automations/draft {prompt, current?}` → `{name, description, spec, notes}` → cards update in place with a "changed" highlight → user presses Save. Chat-drawer `manage_automation` keeps working and links to the builder.

## Test recipes (one per trigger; run history shows the row within seconds)

Documented per trigger in `docs/automations-test-recipes.md` (written with the code): the action to take in the app, the expected event name, and what the first action should have rendered.

## Phases

1. Spec v2 + compiler + describer + tests (`lib/automations.ts`, `scripts/test-automations.ts`).
2. Schema (`AutomationJob`, `Automation.webhookToken`), engine (contexts, steps, wait/resume, schedule, webhook route, new actions), cron wiring.
3. Fire points across routes and libs.
4. Builder UI + list page + nav + redirects.
5. Atlas: draft endpoint + panel; `manage_automation` guide refresh.
6. Test recipes doc, tsc, unit tests, staging.
