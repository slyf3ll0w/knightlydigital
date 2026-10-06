# Client websites (Lane 1: studio-built) — 2026-10-05

**Status: BUILDING 2026-10-05** (branch `websites`, worktree
`~/knightlydigital-wt/websites`; sites repo `~/workbench-sites`).

## Why

WorkBench's own site is the quality bar: a real brief, a chosen direction,
bespoke layout and type, real photos, a device pass. Clients' sites are
mostly template builders that look like every other contractor site. The
product is the same process, productized: the app collects the brief and
feeds the data, a separate static site per client carries the design, and
the studio (David + Claude on a subscription) builds each one by hand.
Lane 2 (self-serve generation billed by API usage) reuses the brief, the
data endpoint, the kit and the skill; only the generator is new.

## Decisions (David, 2026-10-05)

- Pilot: a made-up demo company (not a real tester).
- Hosting: Cloudflare Pages, one project per site, static.
- Scope: everything in Lane 1 this round.
- Code: new private GitHub repo `workbench-sites`.

## What WorkBench gets

| Piece | Where |
| --- | --- |
| `Website` row per company (status, brief JSON, domain, Pages project, preview URL, studio notes) | `prisma/schema.prisma`, `lib/website.ts` |
| `WebsitePhoto` (truck / team / shop photos the owner uploads for the site) + `JobPhoto.siteUse` / `alt` | schema, `/api/app/website/photos`, `PATCH /api/app/jobs/[id]/photos/[photoId]` |
| Settings → Website: status hero, brand brief, photos, FAQ, "Send to the studio" | `/app/settings/website` |
| Public site-data endpoint the site build reads | `GET /api/public/site/[slug]` |
| Public photo bytes for flagged photos | `GET /api/public/site-photos/[id]` |
| Rebuild trigger: relevant writes → debounced GitHub `repository_dispatch` | `lib/db.ts` middleware → `scheduleSiteRebuild` |
| Console → Websites: the studio queue (status, domain, project, notes, Rebuild now, Mark live) | `/superadmin/websites` |
| Help Center guide "Get a custom website" | `lib/help/sections/account.ts` |

Env (Railway, both envs): `SITES_DISPATCH_TOKEN` (GitHub fine-grained PAT,
contents + actions write on `workbench-sites`); optional
`SITES_DISPATCH_URL` (default = that repo's dispatches endpoint). Unset =
no rebuilds fire, everything else works.

## The sites repo

```
workbench-sites/
  packages/kit/      data loader (+ runtime validation), Seo, Schema (JSON-LD),
                     CallButton, BookingEmbed, Hours, ServiceAreas, LegalLinks,
                     seo-lint (fails the build on a missing title/desc/H1/alt/
                     canonical/schema or a NAP mismatch)
  sites/<slug>/      one Astro site per client; bespoke layout + CSS, kit for plumbing
  studio/            SKILL.md (the standardized process), banned-patterns.md,
                     trades/<trade>.md, checklist.md, directions/<slug>/
  .github/workflows/ rebuild.yml: repository_dispatch {slug} → build → wrangler pages deploy
```

A site build reads `SITE_DATA_URL` (the endpoint) and falls back to the
site's checked-in `site.json` snapshot, so a build never fails because
WorkBench is down and the demo builds with no account at all.

## SEO floor (enforced by `seo-lint`)

One H1, title + description per page, canonical, sitemap + robots, OG
tags, alt on every image, LocalBusiness JSON-LD generated from the
endpoint (NAP identical to the app), one Service schema per service page,
FAQ schema only where the page has a real FAQ, no doorway city pages (only
cities the brief lists, each with unique content).

## Not in this round

Lane 2 generator, Search Console API verification, Cloudflare for SaaS
custom hostnames (the owner points a CNAME at the Pages project for now),
a per-company deploy hook (one GitHub dispatch covers every site).

## Test recipes

1. Settings → Website: fill the brief, upload a truck photo, flag a job photo "Use on website", Send to the studio → status "Sent to the studio", console Websites shows the row.
2. `GET /api/public/site/<slug>` returns profile + hours + services + booking items + brief + photos with absolute URLs.
3. Console → Websites → set project + domain → Mark live → Settings → Website shows "Live" with the domain; `Company.website` filled if it was empty.
4. Change hours in Settings → Business info → console row shows "Rebuild queued" (with `SITES_DISPATCH_TOKEN` set, the Actions run starts).
5. Demo site: `npm run build -w sites/<slug>` passes seo-lint; `wrangler pages deploy` publishes it.
