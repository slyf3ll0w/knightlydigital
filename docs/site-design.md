# WorkBench site design standard (workbenchfsm.com)

Set 2026-11-18, when David asked for the site to stop looking AI-made and
to read like "a software site and a contractor site had a baby". References David gave (second pass, same day): steadfastoutdoorco.com,
fenceprosoftexas.com, railway.com, dotcomglobalmedia.com, stripe.com. `scripts/test-wb-site.ts` (section 6) enforces the parts a
script can see; the rest is on whoever builds the page.

## Colors on the home hero and every brand graphic

WorkBench colors only (David round 4): navy #0A1428, blue #0B57D8 / #2E6FF2, orange #F86A0A / #FF8B33, and light tints of those. No violet, pink or rainbow gradients (WBRibbon, WBBento washes, the cycling word all follow this).

## What stays

- Fonts: Nunito headings over Inter body (David kept them). No new faces.
- Colors: navy `#0A1428`, WorkBench blue `#0B57D8`, orange `#F86A0A`
  (sparingly: the active-link rule, numbers, small accents), grays.
- Real screenshots of the app (desktop first) and real job photos.

## What is gone, and must not come back

| Out | Instead |
| --- | --- |
| Small-caps eyebrow labels over titles ("FIELD SERVICE MANAGEMENT SOFTWARE", "PRICING"), with or without a dot | Nothing: the headline carries the section (David round 4). Don't add `.wb-label` back |
| Pill eyebrows over a title (`rounded-full bg-blue-50 …`) | `<p className="wb-label">` |
| The old floating pill header and the navy utility strip | `WBNav` (round 3): one rounded white bar floating under the top edge, menus (Features, Compare, Resources), phone, Log in, orange Get started; tightens on scroll |
| Phone mockup, zoom bubble, floating notification cards in a hero | Home: big centered headline with a cycling word (`WBCycleWord`) over two flowing ribbons, then `WBLiveApp`, a coded copy of the REAL dashboard (match public/screens/desktop-dashboard.jpg, Lexend) that works by itself, with hand-drawn notes. Inner pages with a photo: `WBSplitHero` (photo panel, navy wash, white type, one caption plate) |
| Bobbing / tilted cards (`wb-float`, `--wb-tilt`) | `wb-card-shadow`, sitting still |
| Blue/orange glows (`radial-gradient`) and ANY grid/graph-paper background (David: the worst offender) | White heroes with `WBRibbon` (Stripe-style brand ribbon, top right); navy `.wb-dark` bands |
| Boxed FAQ accordion with chevrons | `WBFaqSection`: title + bar + "call us" on the left, ruled rows with +/− on the right |
| Big soft radii (`rounded-2xl`, `rounded-[1.5rem]`) and pill buttons | Cards top out at 12 px (clamped in globals.css); buttons `.wb-pill` are 8 px |
| Photo tiles with icons, numbered trade directories, counting the trades | `WBTradeCards`: plain photo cards with the name under the photo, then "Also built for …" links |
| Boxed feature tabs, and the busy bento grid | `WBFeatureTabs`: four jobs on the left, one real screen on the right, auto-advancing with an orange progress line (round 5) |
| Written review cards | The Knight Light video testimonial only (David) |

## Building a new page

1. **Open with a shared hero.** `WBPageHeader` (label, title, intro,
   actions, optional breadcrumb and right column) for most pages;
   `WBSplitHero` when there is a job photo; a page template when one fits
   (`WBFeaturePage`, `WBComparePage`, `WBAlternativePage`,
   `WBFreeSoftwarePage`, `ToolPage`). The test fails a page without one.
2. **Section titles:** just the `<h2>`. No eyebrow label above it.
3. **Headlines** may be two-tone (Stripe): the second half in a
   `text-gray-400` span, which renders slate on the same line.
4. **Bands** alternate white and `#F5F7FA`, with navy (`wb-dark`) for one
   strong band per page at most, plus `WBCta` at the end.
5. **Lists and specs** are ruled rows under a 2 px navy top rule (see the
   FAQ, the trades directory, the announcements list), not grids of
   rounded cards with icon tiles.
6. **FAQ:** `WBFaqSection` with `WBFaqJsonLd`. Never a hand-built
   `<details>` list.
7. **Copy:** prices, seats and rates come from `lib/plans.ts` (the same test
   scans for literals). Never a real client's name or logo.
8. Check it at 390 px wide: no sideways scroll (`.wb-pill` sets its own
   `display`, so hide a pill by wrapping it, never with `hidden` on the pill).

## Motion

- `WBRibbon` bands drift and the colors breathe; `WBLiveApp` loops a booking, a payment and a text; `WBCycleWord`; `WBCountUp`; the works-with row (`WBIntegrations`) slides forever. All of it stops under reduced motion.
- Arrow notes: `WBNote` (words + an arrow drawn for the job, never CSS-rotated) inside an `AnimateIn`, so it draws as the section scrolls in. Put the arrow TIP on the exact thing named, keep z-20 so nothing covers it, xl screens only, and use few of them.
- The trades on Home slide (`WBTradeStrip`); /trades keeps the grid (`WBTradeCards`).
- The live-site hand-drawn notes stay: `WBScribble` + a short bold line, inside an `AnimateIn` so they draw as you scroll there (feature screens, trades, pricing; `note` on `WBSplitHero`). On a photo panel they turn white automatically.
- The footer is four short columns plus a legal line; trades, free pages and alternatives are reached from their index pages, not listed in the footer.
- Integrations live in one list, `INTEGRATIONS` in components/wb/WBIntegrations.tsx. Only list what WorkBench really connects to.

## Content that lays itself out

- **Announcements** (`lib/wb-announcements.ts`): add an entry; the list
  (date column, tag, title, summary, the bolded points of the first list)
  and the post page (header, article with "On this page", the Help guide
  card, older/newer) are templates. Write a `list` block with bold titles
  so the list page has highlights to show.
- **Help Center guides** (`lib/help/sections/*.ts`): the public copy wears
  `.help-public` (components/help/help.css): white hero with the ribbon, squared search,
  cards and chips, navy step squares, ruled headings. The in-app Help keeps
  its own look.

## Try the real thing (home)

`WBTryIt`: the app's own quote screen (`QuoteEditor` with its `demo` prop: Save hands the quote back, no API) in the app look (`.app-ui .ds`, Brightwire's colors), and Brightwire's real booking form. The client-portal tab is built but OFF (`SHOW_PORTAL`) until the client-facing redesign. The demo company runs itself (lib/demo-company.ts). The site is pinned light (ForceLightTheme in the site layout) so app pieces never go dark.

## The mascot

David's koala (`public/wb/koala.webp`, `components/wb/WBKoala.tsx`), called
"our mascot", no name. He appears on the contact page, book-a-call, the 404
and the floating contact launcher (his face is the button) only. `WBSplitHero mascot={{ say }}` puts him on the navy
panel with a speech bubble. Transparent PNG for other uses:
~/Downloads/WorkBench koala (transparent)/workbench-koala.png.
