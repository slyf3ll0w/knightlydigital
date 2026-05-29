# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # local dev server at localhost:3000
npm run build    # production build (required before deploy)
npm start        # production server (Railway uses this)
```

## Architecture

Next.js 15 App Router, React 19, TypeScript, Tailwind CSS v4. No external UI library.

**Font**: Oxanium (Google Fonts, loaded via `next/font/google` in `app/layout.tsx`, exposed as `--font-oxanium` CSS variable, mapped to `--font-sans` in `@theme`).

**Theme**: Olive/charcoal palette defined as CSS custom properties in `app/globals.css`. All Tailwind color classes (`bg-primary`, `text-muted-foreground`, etc.) resolve to these variables.

**Background pattern**: `/public/bg-pattern.svg` (diamond grid). Applied via `.bg-patterned` and `.bg-muted-patterned` utility classes in globals.css — not via Tailwind.

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
```

Allen's service pages live at the root level (`/custom-software`) rather than `/allen-tx/custom-software` for SEO reasons. All other city service pages use the dynamic `[city]/[service]` route.

## Data layer

**`lib/cities.ts`** — 21 cities with name, slug, and a one-sentence local blurb. `getAllCitySlugs()` returns all slugs except Allen (used in `generateStaticParams`). `getCityBySlug()` used in dynamic routes.

**`lib/services.ts`** — 3 services with name, slug, tagline, description, details array, and hero image URL. `getServiceBySlug()` used in dynamic routes.

Both files feed `generateStaticParams()` in the dynamic route pages so all city/service combos are pre-rendered at build time.

## Deployment

Railway detects Next.js automatically and runs `next start`. No special config needed. Ensure `npm run build` passes before pushing.

GitHub remote: `https://github.com/slyf3ll0w/knightlydigital`

## Business details to update

- **Phone**: Replace `(214) 555-0100` / `tel:2145550100` — appears in Header, Footer, contact forms, and sidebar contact blocks on service pages.
- **Email**: Replace `info@knightlydigital.com` — same locations.
- **Contact form**: `components/ContactForm.tsx` currently fakes submission (`setSubmitted(true)`). Wire up to Formspree, Resend, or a Next.js API route for real email delivery.
