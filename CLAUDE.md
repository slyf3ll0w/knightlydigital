# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Commands

```bash
npm run dev        # local dev server at localhost:3000
npm run build      # production build (required before deploy)
npm start          # production server (Railway uses this)
npm run db:push    # push Prisma schema to database (needs DATABASE_URL)
npm run db:seed    # seed initial superadmin user
npm run db:generate # regenerate Prisma client after schema changes
```

To regenerate the Prisma client locally (required after schema changes):
```bash
node node_modules/prisma/build/index.js generate
```

## Architecture

Next.js 15 App Router, React 19, TypeScript, Tailwind CSS v4. Prisma 5 ORM with PostgreSQL (Railway). NextAuth v4 for authentication. lucide-react for icons.

**Font**: Oxanium (Google Fonts, loaded in `app/layout.tsx` via `<link>` tag).

**Theme**: Black (`#0C0F0C`) + Green (`#22C55E`) throughout both the marketing site and the job manager app.

**Background pattern**: `/public/bg-pattern.svg` (diamond grid). Applied via `.bg-patterned` utility class.

## Project structure

This repo has two distinct products:

### 1. Streamflare Marketing Site (`/`)
DFW digital agency marketing pages. URL structure:
- `app/page.tsx` → Allen, TX home
- `app/[city]/page.tsx` → City homes (20 DFW cities)
- `app/[city]/[service]/page.tsx` → City + service pages
- `app/about/page.tsx`, `app/contact/page.tsx`, `app/services/page.tsx`
- `app/crm/page.tsx`, `app/custom-software/page.tsx`, etc.

### 2. JobFlow — Free Job Manager SaaS (`/app/*`)
Free field service management tool (like Housecall Pro / Jobber).
Multi-tenant: each field service company gets their own account.
Monetized via payment processing fees (processor stub in `lib/payments.ts`).

```
app/app/
  login/                  → Sign in
  register/               → New company signup (creates Company + OWNER user)
  dashboard/              → Overview stats + recent jobs
  contacts/               → Customer database
  contacts/[id]/          → Contact detail + job history
  contacts/new/           → New contact form
  jobs/                   → Kanban pipeline board (LEAD → PAID)
  jobs/[id]/              → Job detail (notes, photos, status, quote/invoice)
  jobs/new/               → New job form
  schedule/               → Monthly calendar view
  quotes/                 → Quotes list
  quotes/[id]/            → Quote detail (line items, send, accept)
  quotes/new/             → Quote builder
  invoices/               → Invoices list with tab filters
  invoices/[id]/          → Invoice detail + payment actions
  invoices/new/           → Invoice builder
  settings/               → Company profile + surcharging + review link
```

**Public pages** (no auth required):
- `/book/[slug]` — Online booking widget (embeddable per company)
- `/pay/[token]` — Invoice payment page (card + ACH)
- `/quote/[token]` — Customer quote acceptance page

**API routes** (`/api/app/*`):
All job manager API routes are scoped to `session.user.companyId` for multi-tenancy.
- `/api/app/register` — Company + owner user creation
- `/api/app/contacts[/[id]]` — CRUD contacts
- `/api/app/jobs[/[id]]` — CRUD jobs
- `/api/app/jobs/[id]/status` — PATCH job status
- `/api/app/jobs/[id]/notes` — POST note to job
- `/api/app/quotes[/[id]]` — CRUD quotes
- `/api/app/invoices[/[id]]` — CRUD invoices
- `/api/app/invoices/[id]/status` — PATCH invoice status
- `/api/app/invoices/[id]/pay` — Record payment (calls payment processor)
- `/api/app/settings` — PATCH company settings
- `/api/public/*` — Public booking, payment, quote acceptance

## Data layer

**`lib/db.ts`** — Prisma client singleton.
**`lib/auth-options.ts`** — NextAuth v4 config. JWT includes `id`, `role`, `companyId`.
**`lib/payments.ts`** — Payment processor stub. Swap functions here when integrating Stripe/Finix/Square.
**`lib/cities.ts`** — 21 DFW cities.
**`lib/services.ts`** — 3 Streamflare services.

## Database models

Key multi-tenant models, all scoped by `companyId`:
- `Company` — tenant, has slug for booking URL
- `User` — roles: SUPERADMIN (Streamflare), OWNER, MANAGER, TECH
- `Contact` — customer database
- `Job` — work order, statuses: LEAD → SCHEDULED → IN_PROGRESS → COMPLETE → INVOICED → PAID
- `Quote` / `QuoteLineItem` — estimates with customer acceptance via `publicToken`
- `Invoice` / `InvoiceLineItem` — with `publicToken` for pay-by-link
- `Payment` — payment records with surcharge support
- `ServicePlan` — recurring jobs
- `BookingRequest` — from the /book widget
- `ReviewRequest` — post-payment review requests

## Authentication

NextAuth v4 with Credentials provider. JWT sessions.
- Login URL: `/app/login`
- After login: all routes require `session.user.companyId` (except SUPERADMIN)
- No company → redirected to `/app/register`
- Middleware in `middleware.ts` protects `/app/*` and `/superadmin/*`

## Payment processor

`lib/payments.ts` is a stub. To go live:
1. Add your processor's SDK (e.g., `npm i stripe`)
2. Replace `chargePayment()` and `createPaymentLink()` with real calls
3. For Stripe: mount Stripe Elements on the `/pay/[token]` page
4. For surcharging: enable in company settings and the rate is applied automatically

## Environment variables required

```
AUTH_SECRET=     # generate: openssl rand -base64 32
DATABASE_URL=    # PostgreSQL connection string from Railway
NEXTAUTH_URL=    # deployed URL (e.g. https://jobflow.streamflaremedia.com or https://streamflaremedia.com)
```

## Database setup (Railway)

1. Create PostgreSQL database in Railway
2. Set `DATABASE_URL` in Railway environment variables
3. Run `npm run db:push` to push the schema
4. Run `npm run db:seed` to create the initial superadmin user (admin@streamflaremedia.com / ChangeMe123!)
5. **Change the admin password immediately after first login**

## Deployment

Railway detects Next.js automatically and runs `next start`. GitHub remote: `https://github.com/slyf3ll0w/knightlydigital`

## Business details to update (marketing site)

- **Phone**: Replace `(214) 555-0100` / `tel:2145550100`
- **Email**: `info@streamflaremedia.com` (update when domain is live)
- **Contact form**: `components/ContactForm.tsx` currently fakes submission. Wire to Formspree, Resend, or an API route.
- **Social links**: Header social icons link to `#` — update when accounts are set up.
