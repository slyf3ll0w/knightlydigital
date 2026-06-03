# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Commands

```bash
npm run dev        # local dev server at localhost:3000
npm run build      # production build (required before deploy)
npm start          # production server (Railway uses this)
npm run db:push    # push Prisma schema to database (needs DATABASE_URL)
npm run db:seed    # seed initial admin user
npm run db:generate # regenerate Prisma client after schema changes
```

To regenerate the Prisma client locally (required after schema changes):
```bash
node node_modules/prisma/build/index.js generate
```

## Architecture

Next.js 15 App Router, React 19, TypeScript, Tailwind CSS v4. Prisma 5 ORM with PostgreSQL (Railway). NextAuth v4 for authentication.

**Font**: Oxanium (Google Fonts, loaded in `app/layout.tsx` via `<link>` tag).

**Theme**: Black + Streamflare blue (`oklch(0.45 0.20 265)`) palette defined as CSS custom properties in `app/globals.css`. The logo row in the header uses a white background so the colored logo displays correctly.

**Background pattern**: `/public/bg-pattern.svg` (diamond grid). Applied via `.bg-patterned` utility class.

## Page structure

```
app/
  page.tsx                          → Allen, TX home (root)
  [city]/page.tsx                   → City home (20 other cities)
  [city]/[service]/page.tsx         → City + service page
  custom-software/page.tsx          → Allen service page
  meta-ads-management/page.tsx      → Allen service page
  social-media-posting/page.tsx     → Allen service page
  about/page.tsx
  contact/page.tsx
  portal/
    login/page.tsx                  → Client/admin login
    dashboard/page.tsx              → Client dashboard
    messages/page.tsx               → Client messaging
    orders/page.tsx                 → Client orders list
    orders/new/page.tsx             → Request new service
  admin/
    dashboard/page.tsx              → Admin overview
    clients/page.tsx                → Client list
    clients/[id]/page.tsx           → Client detail + messaging
    messages/page.tsx               → All conversations
    orders/page.tsx                 → All orders with status management
```

## Data layer

**`lib/cities.ts`** — 21 DFW cities. **`lib/services.ts`** — 3 services.
**`lib/auth-options.ts`** — NextAuth v4 config (credentials provider, JWT strategy).
**`lib/db.ts`** — Prisma client singleton.

## Authentication

NextAuth v4 with Credentials provider. JWT sessions.
- Login URL: `/portal/login` (handles both client and admin)
- After login, role-based redirect: CLIENT → `/portal/dashboard`, ADMIN → `/admin/dashboard`
- Middleware in `middleware.ts` enforces role-based access to `/portal/*` and `/admin/*`

## Environment variables required

```
AUTH_SECRET=     # generate: openssl rand -base64 32
DATABASE_URL=    # PostgreSQL connection string from Railway
NEXTAUTH_URL=    # your deployed URL (e.g. https://streamflaremedia.com)
```

## Database setup (Railway)

1. Create PostgreSQL database in Railway
2. Set `DATABASE_URL` in Railway environment variables
3. Run `npm run db:push` to push the schema
4. Run `npm run db:seed` to create the initial admin user (admin@streamflaremedia.com / ChangeMe123!)
5. **Change the admin password immediately after first login**

## Deployment

Railway detects Next.js automatically and runs `next start`. GitHub remote: `https://github.com/slyf3ll0w/knightlydigital`

## Business details to update

- **Phone**: Replace `(214) 555-0100` / `tel:2145550100`
- **Email**: `info@streamflaremedia.com` (update when domain is live)
- **Contact form**: `components/ContactForm.tsx` currently fakes submission. Wire to Formspree, Resend, or an API route.
- **Social links**: Header social icons link to `#` — update when accounts are set up.
