# Automations — test recipes

How to make every trigger fire on purpose, and what the run log should say. Open **Automations → the rule → Run history** after each recipe; the row appears within a second for events, on the next hourly cron tick for sweeps and schedules.

Run statuses: **ok** (every step ran), **skipped** (a filter stopped it — detail says which step — or an action had nothing to do), **failed** (an action threw or a send failed), **waiting** (parked at a wait step; the hourly resume continues it and the same row updates).

## Triggers

### Leads & clients

| Trigger | When it fires | How to fire it | Notes |
| --- | --- | --- | --- |
| `lead.created` | a new lead is added | Add a client with status Lead, or submit the booking form as a new person. |  |
| `lead.stage_changed` | a lead moves to a stage | Drag a lead card to another column on Leads. | Optional stage narrows it. |
| `lead.won` | a lead is marked won | Drag a lead to Won (or approve their quote). |  |
| `lead.lost` | a lead is marked lost | Drag a lead to Lost and give a reason. |  |
| `lead.contact_made` | you reach a lead (a call connects or you text them) | Text a lead from Messages, or finish a call with them. |  |
| `lead.no_answer` | you call a lead and they don't pick up | Call a lead from the app and hang up while it rings. |  |
| `lead.stale` | a lead has sat in the same stage for N days | Set days to 1 on a lead that moved yesterday; fires on the next hourly sweep. | Sweep (hourly). Dedupes per record. |
| `client.created` | a new client is added | Add a client with status Active. |  |
| `client.archived` | a client is archived | Archive a client from their page. |  |
| `client.reactivated` | an archived client is reactivated | Set an archived client back to Active. |  |
| `client.note_added` | a note is added to a client | Add a note on a client page. |  |
| `client.field_changed` | a client's custom field changes | Edit a client and change the chosen custom field. | Optional field narrows it. |
| `client.inactive` | a client hasn't had a job in N days | Set days low for a client whose last job is older; fires on the next sweep. | Sweep (hourly). Dedupes per record. |

### Requests

| Trigger | When it fires | How to fire it | Notes |
| --- | --- | --- | --- |
| `request.created` | a new request comes in | Submit the public booking form, or add a request in the app. |  |
| `request.converted` | a request is turned into a quote, job or appointment | Open a request and press Create quote / job / appointment. |  |
| `request.archived` | a request is archived | Archive a request. |  |

### Appointments

| Trigger | When it fires | How to fire it | Notes |
| --- | --- | --- | --- |
| `appointment.scheduled` | an appointment is booked | Book an appointment in the app or through the public scheduler. |  |
| `appointment.rescheduled` | an appointment is rescheduled | Change an appointment's date or time. |  |
| `appointment.cancelled` | an appointment is cancelled | Cancel an appointment. |  |
| `appointment.completed` | an appointment is marked completed | Mark an appointment Completed. |  |
| `appointment.no_show` | an appointment is marked no-show | Mark an appointment No-show. |  |
| `appointment.upcoming` | an appointment starts in N hours | Book an appointment inside the window; fires on the next hourly sweep. | Sweep (hourly). Dedupes per record. |
| `appointment.no_quote` | an appointment ended N hours ago with no quote sent | Complete an appointment, send no quote, wait for the sweep. | Sweep (hourly). Dedupes per record. |

### Quotes

| Trigger | When it fires | How to fire it | Notes |
| --- | --- | --- | --- |
| `quote.sent` | a quote is sent (first send) | Send a draft quote. |  |
| `quote.viewed` | a client opens a quote (first time) | Open the quote's client link in a private window. |  |
| `quote.approved` | a quote is approved | Approve a quote from its client link, or mark it approved. |  |
| `quote.changes_requested` | a client asks for changes on a quote | Press Request changes on the quote's client link. |  |
| `quote.converted` | a quote is turned into a job | Press Create job on an approved quote. |  |
| `quote.deposit_paid` | a deposit is paid on a quote | Pay the deposit on a quote's client link (test card). |  |
| `quote.unanswered` | a sent quote has had no answer for N days | Set days to 1 on a quote sent yesterday; fires on the next sweep. | Sweep (hourly). Dedupes per record. |

### Jobs

| Trigger | When it fires | How to fire it | Notes |
| --- | --- | --- | --- |
| `job.created` | a job is created | Create a job. |  |
| `job.scheduled` | a job is scheduled or its date changes | Set or move a job's date. |  |
| `job.assigned` | a job's crew changes | Assign or change who's on a job. |  |
| `job.started` | a job is started (first clock-in) | Clock in on a job for the first time. |  |
| `job.on_my_way` | a tech sends On my way | Press On my way on a job. |  |
| `job.checklist_done` | a job's checklist is finished | Tick the last checklist item on a job. |  |
| `job.photo_added` | a photo is added to a job | Add a photo on a job. |  |
| `job.note_added` | a note is added to a job | Add a note on a job. |  |
| `job.completed` | a job is marked complete | Mark a job Complete. |  |
| `job.archived` | a job is archived | Archive a job. |  |
| `job.today` | a job is scheduled for today (once per job, each morning) | Schedule a job for today; fires on the next hourly sweep. | Sweep (hourly). Dedupes per record per day. |
| `job.unscheduled` | a job has been unscheduled for N days | Create a job with no date, set days to 1, wait for the sweep. | Sweep (hourly). Dedupes per record. |
| `job.completed_ago` | a job was completed N days ago | Set days to 1 on a job completed yesterday; fires on the next sweep. | Sweep (hourly). Dedupes per record. |

### Invoices & payments

| Trigger | When it fires | How to fire it | Notes |
| --- | --- | --- | --- |
| `invoice.sent` | an invoice is sent | Send a draft invoice. |  |
| `invoice.viewed` | a client opens an invoice (first time) | Open the invoice's pay link in a private window. |  |
| `invoice.partially_paid` | an invoice is partially paid | Record a payment smaller than the balance. |  |
| `invoice.paid` | an invoice is paid in full | Record a payment for the full balance. |  |
| `invoice.past_due` | an invoice goes past due | Set an invoice's status to Past due (or let the due date pass). |  |
| `invoice.overdue` | an invoice is N days past due | Set days to 1 on an invoice due yesterday; fires on the next sweep. | Sweep (hourly). Dedupes per record. |
| `payment.autocharge_failed` | a card-on-file charge fails | Needs a declining test card on an autopay invoice. |  |
| `payment.received` | a payment is received | Record any payment (cash, check, card). |  |
| `payment.refunded` | a refund is issued | Refund a payment from the Payments page. |  |

### Calls & messages

| Trigger | When it fires | How to fire it | Notes |
| --- | --- | --- | --- |
| `call.inbound` | a call comes in and is answered | Call the business line and answer it in the app. |  |
| `call.missed` | a call is missed | Call the business line and let it ring out (no voicemail). |  |
| `call.voicemail` | a caller leaves a voicemail | Call the business line, let it ring out, leave a message. |  |
| `call.outbound_completed` | an outbound call ends | Call a client from the app and hang up after they answer. |  |
| `message.text_received` | a client texts the business line | Text the business line from a client's phone. |  |
| `message.portal_received` | a client sends a message from their portal | Send a message from the client hub. |  |
| `message.email_opened` | a client opens an email you sent | Send a client an email from their page and open it with images on. |  |
| `review.requested` | a review request goes out | Press Request review on a completed job. |  |

### Agreements

| Trigger | When it fires | How to fire it | Notes |
| --- | --- | --- | --- |
| `contract.sent` | an agreement is sent | Send an agreement. |  |
| `contract.signed` | an agreement is signed | Sign an agreement from its client link. |  |

### Team

| Trigger | When it fires | How to fire it | Notes |
| --- | --- | --- | --- |
| `team.clock_in` | a team member clocks in | Clock in on a job. |  |
| `team.clock_out` | a team member clocks out | Clock out of a job. |  |
| `team.long_shift` | someone has been clocked in for N hours | Set hours to 1, clock in, wait for the sweep. | Sweep (hourly). Dedupes per record. |
| `team.member_added` | a team member joins | Invite someone and have them accept. |  |

### Recurring & expenses

| Trigger | When it fires | How to fire it | Notes |
| --- | --- | --- | --- |
| `subscription.started` | a recurring plan starts | Create a recurring plan. |  |
| `subscription.paused` | a recurring plan is paused | Pause a recurring plan. |  |
| `subscription.cancelled` | a recurring plan is cancelled | Cancel a recurring plan. |  |
| `subscription.visit_generated` | a recurring visit is put on the schedule | Create a weekly plan; the next visit is generated on the hourly sweep. |  |
| `expense.added` | an expense is logged | Add an expense. |  |

### Time & external

| Trigger | When it fires | How to fire it | Notes |
| --- | --- | --- | --- |
| `schedule.tick` | on a schedule | Set the hour to the next hour; fires on that hourly sweep. | Hourly cron matches the hour in the company timezone; once per day/week. |
| `webhook.received` | a webhook is received | POST any JSON to the automation's URL (shown on the builder). | Dedupes on token + minute + body. |
| `manual.run` | you press Run on a record | Open a client, job, quote or invoice and choose Run automation. | Every press is its own run. |

## Actions

| Action | Log line when it works | Common skip reasons |
| --- | --- | --- |
| `notify_team` — Notify the team | `notify_team: notified N` | — |
| `notify_user` — Notify one person | `notify_user: notified <name>` | that team member is no longer active |
| `email_client` — Email the client | `email_client: emailed <address>` | client has no email · email not configured · company email blocked · client already emailed 3× today · company daily email cap |
| `text_client` — Text the client | `text_client: texted <phone>` | client has no phone · client can't be texted (opted out or texts off) · texting isn't live on your line yet · client already texted 2× today |
| `portal_message` — Message the client in their portal | `portal_message: portal message sent` | no client |
| `email_address` — Email an address | `email_address: emailed <address>` | email not configured |
| `send_quote_link` — Send the quote link | `send_quote_link: quote link emailed (+ texted)` | no quote · the quote already has an answer · client has no email · email not configured |
| `send_pay_link` — Send the pay link | `send_pay_link: pay link emailed (+ texted)` | no invoice · already paid · invoice archived · client has no email |
| `send_payment_reminder` — Send a payment reminder | `send_payment_reminder: reminder emailed (<stage>)` | invoice is draft/paid/archived · nothing owed · client has no email |
| `send_appointment_reminder` — Send an appointment reminder | `send_appointment_reminder: reminder texted|emailed (day|hour)` | appointment is cancelled/completed · appointment already started · client can't be texted and has no email |
| `request_review` — Request a review | `request_review: review request sent (or already sent recently)` | client has no email · no review link set |
| `add_client_note` — Add a note on the client | `add_client_note: note added` | no client · no active owner to author the note |
| `add_job_note` — Add a note on the job | `add_job_note: job note added` | no job |
| `move_lead` — Move the lead to a stage | `move_lead: moved to <stage>` | no stage named … · already in that stage · client is not on the leads board |
| `set_lead_outcome` — Mark the lead won or lost | `set_lead_outcome: lead marked won|lost` | not a lead on the board · not on the leads board |
| `set_custom_field` — Set a client custom field | `set_custom_field: <field> set` | that custom field no longer exists · “…” isn't a valid value for <field> |
| `assign_job` — Assign the job | `assign_job: assigned to <name>` | no job · <name> is already on the job · team member no longer active |
| `add_checklist_item` — Add a checklist item to the job | `add_checklist_item: checklist item added` | no job |
| `create_request` — Create a request | `create_request: request #N created` | no client |
| `create_appointment` — Book an appointment | `create_appointment: appointment #N booked for <when>` | no client · nobody to assign it to |
| `create_quote_draft` — Create a draft quote | `create_quote_draft: draft quote #N created` | no client |
| `create_invoice_draft` — Create a draft invoice from the job | `create_invoice_draft: draft invoice #N created` | no job · job already has invoice #N · the job has no line items |
| `create_agreement` — Create an agreement from a template | `create_agreement: draft agreement #N created` | no client · that agreement template no longer exists |
| `create_time_block` — Put a follow-up on the schedule | `create_time_block: follow-up on the schedule for <when>` | no active owner |
| `push_to_quickbooks` — Push to QuickBooks | `push_to_quickbooks: invoice|estimate|payment pushed to QuickBooks` | QuickBooks isn't available on this server · QuickBooks isn't connected · draft invoices/quotes don't sync |
| `send_webhook` — Send to a URL | `send_webhook: sent (HTTP 200)` | only https:// URLs · that host is private / resolves to a private address · payload too large; failed: HTTP <code> / timed out |
| `atlas_draft` — Draft text with Atlas | `atlas_draft: drafted N chars` | no active owner to bill · <Atlas's error, e.g. out of tokens> |

## Steps

- **filter** — a stop shows as `skipped` with detail `stopped at step N: Only if …`. The leading filter (right after the trigger) writes no row at all when it doesn't match; only later filters log the stop.
- **wait** — the row shows `waiting N days` and status **waiting**; an `AutomationJob` row holds the resume time. Pausing or editing the rule cancels it (row becomes `skipped · cancelled: automation paused or changed while waiting`).

## Dry run (Test button)

`POST /api/app/automations/test { spec }` finds up to 100 records the trigger would have matched in the last 30 days, evaluates the leading filter, and renders every step for three of them. It sends nothing and writes nothing. Warnings list anything that will make a step skip (no review link, texting not live, QuickBooks not connected, missing stage/field/template/user).
