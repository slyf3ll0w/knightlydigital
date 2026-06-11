# Plan: Industry-based starter price books (onboarding)

**Status: planned, not built.** Agreed 2026-06-10. Build alongside the onboarding flow.

## Problem

JobFlow serves all field-service industries, but the starter price book seeded at
registration (`lib/pricebook.ts` → used in `app/api/app/register/route.ts`) is
hard-coded to pressure-washing services. Fine for early testing; wrong the moment a
plumber or lawn-care company signs up.

## Reference behavior (Jobber)

During trial signup Jobber asks for your industry, then seeds an industry-specific
price book AND a matching quote template (see
`docs/jobber-research/jobber-build-spec.md` §9 — our trial picked pressure washing
and got "House Wash", "Driveway Cleaning", etc., plus the "House & Driveway
Pressure Washing" quote template offered during request→quote conversion).

## Design

1. **Onboarding step** (part of the future onboarding flow): after registration,
   ask "What kind of work do you do?" — a grid of industries:
   - Pressure washing, Lawn care & landscaping, Cleaning, HVAC, Plumbing,
     Electrical, Handyman, Painting, Pest control, Roofing, Pool service,
     Junk removal, Other (start generic, expand as real signups show demand)
2. **Schema**: `Company.industry String?` — also useful later for analytics,
   marketing-page personalization, and industry-specific defaults (e.g. visit
   duration, deposit norms).
3. **Presets**: replace the single list in `lib/pricebook.ts` with
   `lib/pricebooks/<industry>.ts` (or one file exporting a
   `Record<Industry, StarterItem[]>`). 8–12 items per industry with realistic
   names, descriptions, ballpark prices, and unit costs (costs power the
   profit-margin features — don't skip them in presets).
   "Other" gets a small generic set (Service Call, Labor — hourly, Materials).
4. **Seeding**: move work-item creation out of the register route into the
   onboarding industry step. Registration creates the company with an empty
   price book; picking the industry seeds it. If the user skips the step, seed
   the generic set so the autocomplete is never empty.
5. **Editing**: no change — Products & Services page already lets them edit /
   delete / add. Presets are a starting point, never locked.

## Later, on top of this

- Industry-specific **quote templates** (intro text + preselected line items),
  offered in the request→quote conversion like Jobber's template modal.
- Industry default **lead sources** and request-form service dropdowns
  (`/book/[slug]` currently has a free-text service field).

## Touchpoints when building

- `lib/pricebook.ts` (replace), `app/api/app/register/route.ts` (remove seeding),
  new onboarding route(s), `prisma/schema.prisma` (Company.industry),
  settings page (show/change industry).
