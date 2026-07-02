# Jobber Deep-Dive #2 — 2026-07-02

Fresh 14-day trial: "Cedar & Sun Lawn Care", Lawn Care & Lawn Maintenance vertical, Allen TX, 2-5 people, $50-150K revenue, priority "win more jobs" (login lemur14@yahoo.com).
Complements `jobber-build-spec.md` (2026-06-10, pressure-washing trial). Focus: what changed, what the first pass skimmed (Marketing suite, AI Receptionist, Pipeline/sales, Insights reports, Timesheets, online booking, automations builder), and re-verification of signature flows.

Boundary: mirror workflows/patterns, never copy assets/copy/branding.

---

## Signup & onboarding (fresh observations)

- Signup = auth0 universal login, email+password only upfront (or Google/Intuit/Apple). Password rejected if it contains any part of the email ("Password contains user information").
- Wizard steps: profile (name+phone) → company (name/address/industry/website) → business (team size, years) → revenue → top_priority → heard_about_us → promotion.
- **Company-name field is a Google Places business lookup** — picks up an existing business's reviews/images to seed their AI website builder. "+ Manually enter company name" fallback.
- Industry taxonomy: 29 verticals in 5 groups (Cleaning: Bin/Carpet/Commercial/Pressure Washing/Residential/Window · Green: Arborist/Landscaping/Lawn Care · Hi Tech: IT/Home Theater/Security · Trade: Construction/Electrical/HVAC/Locksmith/Mechanical/Plumbing · Other: Appliance/Flooring/Handyman/Junk/Other/Painting/Pest/Pool/Renovations/Roofing/Snow).
- Priority question is outcome-phrased ("I want my business to look as professional as my work" / "feel in control" / "win more jobs" / "just exploring") → answer drives a tailored multi-select follow-up (for "win more jobs": leads follow-up, attracting clients, repeat business, more requests, quotes that win, never miss leads). Jobber uses this to reorder the First Steps plan ("We've curated this custom plan just for you").
- Immediately after wizard: full-screen annual-plan discount offer ("Limited Time Offer... 20% off 3 months monthly") BEFORE first app screen; then a persistent countdown banner (2h24m ticking) "Get 20% off your first 3 months — Claim Offer" pinned atop the app. Aggressive.
- Intercom proactive chat fires immediately ("David, welcome to Jobber!").
- Modal on first home load: "Get discovered with Google — A business address is required for Google to share your business and let clients book online. You can keep your address private." → Add Business Address CTA.

## Navigation (2026-07 state)

Sidebar order: Home, Schedule │ Clients, Requests, Quotes, Jobs, Invoices │ Marketing, **Receptionist (`/ai_receptionist`)**, **Pipeline (`/sales`)**, Insights, Expenses, Timesheets, Community, Apps (`/marketplace`) │ Refer and Earn, Get Set Up (progress bar), View pricing plans. Top bar: company name, search (`/`), +create, activity feed, help, settings.

Home has a **First Steps ⇄ Dashboard segmented toggle** during trial. First Steps = "curated plan": Jobber-AI-recommended hero card (website builder for lawn care), 6 learn cards ("Quote templates / Scheduling and tracking / Effective marketing tools / +3 more"), then a workflow explainer strip (Requests/Quotes/Jobs/Invoices tabs, each with bullets + "Try It for Yourself" CTA).

## Home Dashboard (mode=dashboard)

Same 4-card workflow strip as June spec, one change: Requests secondary links are now **"Needs approval" + "Overdue"** (was "Assessments complete") — `?status=needs_approval` likely ties to client-initiated online-booking approvals. Today's appointments KPI tabs (Total/Active/Completed/Overdue/Remaining) with empty-state "Schedule a Job" CTA. Business Performance rail: Receivables (→ /reporting/client_balance), Upcoming jobs this week, Revenue this month (→ /insights).

## Marketing Suite (`/marketing`) — NEW since June pass

"Marketing Dashboard" hub with quick links: Marketing Plan (New), Reviews, Campaigns, Job Showcase (New), Social Posting (New). Card grid — every card is AI-branded, has outcome tags (SEO/Get Found · Convert Leads · Build Trust · Grow Repeat Business) and a time estimate:
1. **Marketing Plan** (5 min, `/marketing/plan`) — "Jobber AI creates marketing content using your services, seasonality, and goals — so you always know what to do next."
2. **Campaigns** (5 min, `/campaigns`) — targeted email campaigns from your real business data (client segments).
3. **Reviews** (2 min, `/marketing/reviews` a.k.a `/reviews`) — automated review requests + AI-assisted replies.
4. **Job Showcase** (2 min, `/marketing/job_showcase`) — AI turns completed-job photos+details into a polished social post.
5. **Google Business Profile optimizer** (5 min, `/marketing/listings`) — AI recommendations for GBP.
6. **Social Posting** (2 min, `/marketing/social`) — AI social content from services+seasonality.
7. **Website** (10 min, `/website`) — "Approve your free website" — AI pre-builds a site from business details (fed by the Google-Places signup lookup).
8. **Referrals** (5 min, `/marketing/referrals`) — automated referral requests to happy customers.

Takeaway: Jobber's answer to "win more jobs" is an AI marketing layer ON TOP of the FSM core. Streamflaire's wedge (free FSM) could pair with a lighter version: review requests (already built!), referral links (portal already has hooks), and its PageBot-style site generation David already owns.

### Reviews (`/reviews`) — paid add-on, landing page on trial
Marketing Suite tools are PAID ADD-ONS (cart + "See Plans and Pricing"); trial shows sales pages only. Mechanics gleaned: auto review-ask **by text or email** triggered on visit completed / job closed / invoice paid ("you remain in control of who gets asked"); AI-generated one-click replies to Google reviews; review-trend dashboard (count + avg rating); competitor comparison snapshot ("how your reviews compare to local competitors"). Social proof claim: 100→250 reviews in 5 months.
→ Streamflaire already sends review requests FREE on job completion (ReviewRequest model). That is a genuine free-vs-paid wedge to advertise. Missing pieces worth stealing: trigger choice (visit/close/paid), per-client suppression, and a simple "reviews received" trend widget (manual or via Google Business Profile API later).

### AI Receptionist (`/ai_receptionist`) — paid add-on, $29/mo for 30 conversations
Answers **phone calls and web chat** as the business. Capabilities: schedules jobs using your online-booking settings; creates Requests using your customized request form; takes messages → creates follow-up tasks; escalates (text you / live-transfer) on specified keywords. Dashboard with per-conversation outcome, full transcript + recording; on/off control; works via call-forwarding rules (after N rings / certain hours) so businesses keep their number. Claim: handles ~20 calls/week for avg business. Also embeds on the Jobber Website "no add-on required."
→ Not a near-term Streamflaire build, but the demand signal is huge (missed calls = lost jobs for 1-5 person crews). A cheap wedge: web-chat-only intake bot on the booking page that fills the existing WebForm. Phone AI is a later/never.

### Pipeline (`/sales`) — paid add-on (Get Started → billing page)
Sales kanban with a key design principle: **"No separate board to maintain"** — pipeline cards ARE your requests/quotes; as requests get assessed and quotes approved, cards advance automatically; drag-drop only for manual pushes. Custom stage names (or Jobber's default template). Salesperson assignment + per-rep filter ("no more 'I thought you were following up'"). Won/lost outcome reasons captured as deals leave the board → win-rate report, patterns (stage where quotes go quiet, job type that rarely converts, follow-up timing).
→ Directly relevant: Streamflaire's old kanban was dropped; if it returns, THIS is the shape — auto-derived from Request/Quote status, not a hand-maintained board. Win/loss reasons on quote archive would be a cheap, high-signal addition (QuoteStatus ARCHIVED + reason field).

### Trial gating summary
Trial (14d, no card) = full Grow-tier core FSM. Paid add-ons gated even during trial: Marketing Suite (Reviews/Campaigns/Referrals/Showcase/Social), AI Receptionist ($29/mo/30 convos), Pipeline. Persistent 20%-off countdown banner + billing page pushes.

## Core workflow re-verification (live exercise)

**Client create**: form as June spec. NEW: vertical-aware "Property details" collapsible now includes property size (Small/Medium/Large) for lawn care. Client picker in quote builder shows **Lead badge** inline + "Create new client" inline option.

**Seeded price book (Lawn Care vertical)** — 10 services, all $0.00 default, all with polished 1-2 sentence descriptions: Free Assessment · Lawn Mowing Service (weekly) · Core Aeration · Mulch Installation · Yard Clean Up · Fertilizer and Weed Control Program (annual multi-treatment) · Pest Control Bundle (6-8wk perimeter apps) · Tree Trimming · Irrigation System Startup · Landscape Enhancement Services. Note the FREE ASSESSMENT as a first-class service — smart lead-gen default. Descriptions do the selling; prices left to the business.

**Quote builder** (all confirmed as June spec): editable Quote #, "Add Field" custom fields, Add-section architecture (Introduction / Attachments / Images / Client message), line items w/ price-book combobox grouped under "Services" header, qty/unit price/total, description, per-item image upload, **Mark as optional**, Add Text blocks, drag reorder. Totals rail: Subtotal, Add Discount, Add Tax, Total, **Add Deposit or Payment Schedule**. Contract/Disclaimer default text ("This quote is valid for the next 30 days...") + "Apply to all future quotes". Internal notes at bottom.
- **Optional items are EXCLUDED from subtotal by default** (client opts IN via hub checkbox). Streamflaire's model (included until opted OUT) is the opposite — worth offering per-item default state or matching Jobber (opt-in reads as upsell, opt-out reads as discount pressure).
- **Deposit dialog**: radio "Deposit only" (collect upfront on quote approval, % or $) vs "Payment Schedule" (split job into multiple invoices; %/$ per payment; per-payment "Required quote deposit" checkbox; running Job Total + Remaining; "Add Invoice to Payment Schedule" to append). 25% of $60 → header dl "Required Deposit $15.00"; totals show "Required deposit (25%)" + "Outstanding deposit" rows.
- Save split-button: Save Quote / Save and… → **Send as Email, Send as Text Message, Convert to Job, Mark as Awaiting Response**.
- **Email/SMS hard-gated on sender email verification** ("You must verify your email address before you are able to send any email or SMS messages") + "Review Test Email" follow-up modal.
- Draft quote More menu: Convert to Job, Create Similar Quote, Collect Deposit, Mark as Awaiting Response/Approved, Preview as Client, Collect Signature, Print or Save PDF, Delete.
- **Preview as Client** → clienthub.getjobber.com/client_hubs/{uuid}/quotes/{id}?preview=true. Shows deposit banner "An outstanding deposit of $15.00 will be required to begin", optional line item with "Not Included" state, "Subtotal 1 OF 2 ITEMS", terms.

## Requests & Bookings + Online Booking (`/request_settings`) — MAJOR since June

Multi-form management (mirrors Streamflaire WebForms!): form list with per-form defaults — "Assessment **Booking** default" vs "**Request** default", "Used in N places", Add New Form. Page sections: Forms · Checklists (attach to on-site assessments) · Customization (logo/colors from Business Profile) · **Availability: business hours (from Company Settings) + SERVICE AREAS ("define your service areas for online bookings") + per-team-member bookable availability (Manage Team)**.

Booking-form editor (per form):
- Contact info: first/last/company/email/phone/address; **built-in consent checkboxes** — marketing-email opt-in, transactional SMS consent (STOP/HELP language), separate marketing-SMS opt-in (STOP MKT). TCPA baked into the form.
- Service details: free text (required toggle), image upload up to 50MB each, "How did you hear about us?" dropdown (Existing Client/Facebook/Flyer/Google/Instagram/Other/Referral/Vehicle Wrap).
- **"Schedule an appointment" section = true self-serve booking**: client picks date + arrival time; admin sets assessment duration (1h), optional "Price of assessment", and **bookable team members** list. "Booking questions appear at the end, after required details are collected."
- Confirmation: custom message title+description OR redirect to custom webpage (redirect disabled inside embedded forms "to protect security" — embeds always show message).
- Add Section architecture like quote builder.

→ Streamflaire gap: WebForms exist (3 types, richer field customization) but NO self-scheduling with availability windows/duration/arrival windows, no service areas, no consent checkboxes, no confirmation redirect. The "needs approval" request status on the dashboard ties in: self-booked appointments enter as requests needing approval.

## Automations (`/automations`)
Same 6 toggleable recipes as June (quotes 2d/5d follow-up + auto-archive; invoices due-day/3d-after follow-up; requests auto-archive) + note: "additional automations related to jobs, visits and requests live under Emails & Text Messages settings." **New Automation** custom builder = two-panel "When this happens" → "Then do this" + Save (full use likely Grow-gated). Also an in-product feedback prompt ("what tasks do you want to automate?").

## Checklists (`/job_forms`) — Plus/Connect/Grow feature
Custom form/checklist builder: Form title, **auto-attach toggles** ("Automatically attach to new jobs" / "to new assessments"), sections, 8 question types: Short answer · Long answer · Dropdown (single choice) · Checkbox · Numerical answer · Upload images · Date picker · Signature. Preview/Edit mode toggle. Used on assessments (attached) and on every scheduled visit when attached to a job.
→ Streamflaire has nothing here; a "job checklist" (even simple per-job to-dos snapshotted from a template) is a plausible later add for tech accountability; full form builder is overkill for v1.

## Client Hub settings (`/client_hub_settings/edit`)
As June, plus finer detail: Menu visibility toggle (quotes+invoices lists); Quote approval: require signature toggle, allow change requests toggle (each w/ Preview links); Appointments: show scheduled time toggle; **Request and booking forms: per-form hub access dropdowns (Request form: None/Default Form · Booking form: None/Assessment Booking Form) + choose hub primary button (Requests = "send a service request" vs Bookings = "book an appointment")**; Referrals: refer-a-friend toggle (leads auto-tagged with referrer) + editable incentive templates; Share login page URL for website. Hub nav: New Request · Requests · Quotes · Appointments · Invoices · **Contact Us** · Log Out.

## Insights (`/insights`) — much deeper than Streamflaire's
Single scrolling dashboard, per-widget date ranges:
- Overview KPIs w/ MoM%: New leads, New requests, Converted quotes, New one-off jobs, New recurring jobs, Invoiced value.
- Revenue chart + **"Set Revenue Goal"** (track progress toward target).
- Revenue by Lead Source; **Revenue heatmap** (geographic, $ buckets).
- **Profit and loss**: recent one-off jobs table (total price/labour cost/expenses/profit/margin) + "Set alert" (margin alerts).
- **Cashflow**: Receivables, Projected income (due today / <7 days), Invoice payment time (30d, commercial vs residential split).
- Payment methods mix (shows sample data pre-usage).
- **Lead conversion**: lead conversion time, quote approval time (30d avgs), lead funnel (new → sent quote → job created) + "Ask Jobber AI" button.
- Quote conversion rate + Quote value sent-vs-converted charts.
- Jobs: scheduled job value 4-week forecast, Recurring vs One-off mix, Average job value (one-off vs recurring).

## Reports (`/reports`) — 23 canned reports
Financial: Projected income · Transaction list · Invoices · Taxation · Aged receivables (30/60/90) · Bad debt · Client balance summary (NEW).
Work: Visits · One-off jobs · Recurring jobs · Requests · Checklists · Quotes · Team productivity · Salesperson performance · Products & Services usage · GPS Waypoints · Timesheets.
Expense: Expenses.
Client: Clients (by lead channel) · Lead source revenue (NEW) · Client communications (all emails sent) · Job follow-up emails · Client contact info · Property list · **Client re-engagement (no closed job in past 12 months)**.
→ Streamflaire /app/insights covers revenue/expenses/profit + lead source. Cheap wins: quote conversion rate, aged receivables buckets, client re-engagement list, projected income (due today/7d). All computable from existing schema.

## Get Set Up (`/get_setup`) — AI-personalized onboarding checklist
Loading state literally says "Using AI to build a step-by-step guide just for your business." Grouped 3 phases: Set up business essentials → Personalize your business → Set up client experience. 13 steps, each with primary CTA + alternates + **"I don't need this step"** skip: Add clients (or via QuickBooks) · Catalogue services/products · Company settings · Enable Jobber Payments · Build a quote template · Download mobile app · Create checklists · Add logo · Configure automations · Add custom fields ("track lawn sizes, locked gates, or pet info" — vertical-aware copy!) · Connect integrations · Discover client hub · Turn on booking. Plus "Schedule a call with your onboarding specialist" + per-guide feedback.
→ Validates Streamflaire's parked "Getting started" checklist idea; data-derived completion + skip affordance are the details that matter.

## Timesheets (`/timesheets`)
Day/Week toggle, team filter, per-member rows; workflow strip: Timesheets → **Approve timesheets → Confirm payroll**. New: auto-track billable time on assessments (start on arrival, stop on leave — GPS-driven).

## Work Settings (`/work_configuration/edit/work_settings`) — small features with big UX payoff
- Quotes: toggle "add a calendar reminder to check on quotes not converted after N days".
- Jobs: **Default arrival window** (None/15/30/1h/2h/3h/4h) + style (append after start time "9:00–10:00" vs centered on start "8:30–9:30"); **Visit Title Template** with custom variables (drives calendar/list labels).
- Invoices: default subject ("use quote or job title if available"); **Payment terms table** — Due upon receipt/Net 7/15/30/45/60/End of month/End of next month + Add New, with SEPARATE default terms for residential vs commercial clients (client-specific override).
- Invoice reminders for recurring jobs: assign owner, bulk reassign incomplete.
- Statements: billing-history sort order + statement disclaimer.
- Chemical tracking toggle (Connect+ plans; lawn/pest vertical compliance).

## ⭐ Online booking end-to-end (the headline finding)

Public form URL: `clienthub.getjobber.com/hubs/{uuid}/public/requests/{formId}/new`. Client-facing flow is a **multi-step wizard**: 1) Contact info (returning hub clients see saved addresses) → 2) Service details (+up to 10 images) → 3) **"Schedule an appointment": month calendar + timezone + slot list in 30-min increments, each rendered as an ARRIVAL WINDOW sized by the form's duration ("11:00 AM – 12:00 PM" for 1h)**, constrained by business hours/team availability → 4) Review (reCAPTCHA) → Confirm.
Confirmation page: "Your request was sent and is **awaiting confirmation** — time may be adjusted for availability; you'll receive confirmation by email or text" + **Add to Calendar** + View All Appointments.
Business side: request lands with status **Needs approval** (dashboard card + requests KPI strip "Needs approval (1)"); request detail primary buttons **Decline / Accept and Schedule**; assessment block shows schedule, team, checklist, reminder plan (1 hr before by email; 1 day before at 3:30 PM), "Client has confirmed the appointment" flag. Requests list Overview strip: Needs approval / New / Assessment complete / Overdue / Unscheduled + new-request count + request→quote/job conversion rate (30d).

Form editor field palette (Add Questions): Short answer · Long answer · Dropdown (multi) · Dropdown (single) · Checkbox · Radio · Numerical · Upload images · Yes/No toggle · Date picker · Area · Address · Company name · Email · Phone · Lead source · **Add products and services** (service picker block) · **Add job booking** · **Add assessment** (self-scheduling blocks). "Copy form URL" + embed. Booking questions always run after required contact details.

## Coverage note
Deep-dived this pass: onboarding, home, Marketing suite, Receptionist, Pipeline, Insights, Reports, Timesheets, Work Settings, Checklists, Client Hub settings, Requests & Bookings (admin + public + approval loop), quote builder + deposit dialog + client preview, quote→job convert. Not re-covered (see June spec, unchanged at spot-check): schedule views, invoice/payment collect screens, communication_settings template list, expenses detail, apps marketplace.
Trial account stays live until ~2026-07-16 (lemur14@yahoo.com) — email/SMS sends still blocked pending sender verification (click link in yahoo inbox to enable).
