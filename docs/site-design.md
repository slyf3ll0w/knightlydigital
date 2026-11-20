# WorkBench design standard: the "heavy" look

Rewritten 2026-11-20, when the marketing-site redesign was released to main
(d2345529). **This is the baseline for what comes next:** the same feel
carried into the client-facing pieces (portal / hub, pay page, quote page,
booking page) and the app itself on phone and desktop (David's plan,
2026-11-19: "an app screen and a client-facing element, then written rules
for all of them, then redesign everything in need of it").

`scripts/test-wb-site.ts` (section 6) enforces the parts a script can see on
the marketing site. Everything else is on whoever builds the page.

## What "heavy" means (David's words, 2026-11-18/19)

The reference David gave is the app's own **lead kanban board** (Leads):
"when things are higher quality, they feel polished and heavy." The cheap
version is "weightless": thin outlines, see-through boxes, floating bits,
gimmicks. The heavy version is:

- **Solid surfaces.** White cards with a real shadow and a 1 px ring, sitting
  still on a tinted background. Never an outlined-only or see-through box.
- **Strong type.** Headlines at weight 900, tight tracking, big. One accent
  phrase in the brand blue or orange.
- **Color in the backgrounds.** Sections alternate white / `#F5F7FA`, with
  one strong band (navy → blue gradient, or brand blue) where it matters.
  Never one flat color for a whole page.
- **The product sells itself.** Coded copies of real app screens, moving the
  way the app really moves (a quote gets signed, a payment lands, a stamp
  slams), beat any illustration. Show the real steps as they are in the app;
  a generic animation reads as fake.
- **Purposeful, clean motion.** Things rise in, numbers roll, bars grow,
  checklists tick. Motion explains something; nothing bobs or tilts for its
  own sake. Everything stops under reduced motion.
- **A human hand.** Short hand-drawn notes with an arrow (`WBScribble`), and
  faint hand-drawn drawings behind a section (`WBDoodle`). David likes both.

## Never (each of these was called "AI-made" by David)

- Rows of pill / chip / tag buttons (including "popular" pills and jump nav).
- A row of three check marks under a title.
- Clear / outlined-only boxes. Use solid cards.
- Eyebrow / small-caps labels over titles; numbered section labels ("01").
- Grid / graph-paper backgrounds; glows (`radial-gradient`); floating or
  tilted cards; fanned phone bezels; a phone pill in the header.
- Navy text or navy cards on a bright-blue band ("black on blue").
- A plain grid of identical icon cards as the whole idea of a section (the old
  9-card "What's included"). A ruled spec list or a real screen instead.
- Uneven grids: a card count that leaves a ragged last row. Pick a column
  count that divides it, or let the last card span.
- Hover animation in the header. Arrows that loop, sit under things, or are
  CSS-rotated.
- Invented features, prices, promises or customers; a real client's name
  (Summit Plumbing is real). Demo data is the fake **Brightwire Electric**
  with the demo clients Grace Kim, Maria Hernandez, Derek Olsen, Olivia Park,
  Hannah Brooks, Marcus Bell.

## Tokens

| | Value |
| --- | --- |
| Navy | `#0A1428` (cards, icon tiles), `#12234A` / `#10214A` (hero top) |
| Blue | `#0B57D8` (accent text, bands), `#2E6FF2`, `#0065FC` (header at depth) |
| Orange | `#F86A0A` (primary button, accent), `#FF8B33` (accent on navy, icons in navy tiles) |
| Hero | `WB_HERO_BG` in `components/wb/WBHero.tsx`: `linear-gradient(180deg, #10214A 0%, #12306E 60%, #1847AE 100%)` |
| Blue band | `linear-gradient(135deg, #0A45B8 0%, #0B57D8 55%, #2563EB 100%)`, white text, white cards |
| Solid card | `rounded-xl bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)]` |
| Icon tile | `rounded-lg bg-[#0A1428]` with an `#FF8B33` icon |
| Corners | cards max 12 px, buttons 8 px |
| Section title | `text-[2.2rem] leading-[1.05] sm:text-[3.2rem]` (h1/h2 are 900 site-wide) |
| Body | 17–18 px `text-gray-600` |
| Fonts | site: Nunito headings / Inter body. App pieces (coded screens, the app): **Lexend** only |
| Buttons | `wb-pill wb-pill-orange` primary, `wb-pill wb-pill-outline` secondary |

## The pieces (components/wb)

- **Shell:** `WBNav` (one header everywhere: transparent over a `data-wb-hero`
  navy hero, then a solid bar shifting navy → `#0065FC` as you scroll; solid
  from the top on pages without a navy hero; menus close after a click),
  `WBFooter` (four short columns), `WBCta` (blue closing band).
- **Heroes:** `WBHero` / `WBPageHeader` (navy gradient), `WBSplitHero` (photo
  framed on the right, cut off by the bottom edge), templates `WBFeaturePage`
  (takes a live `demo`), `WBComparePage`, `WBAlternativePage`, `ToolPage`.
- **Coded app screens (the heart of it):** `WBLiveApp` (home hero),
  `WBAppJourney` (request → quote → approved → scheduled → done → invoiced →
  paid; props `job` and `steps`, so feature pages play a subset and trade
  pages follow their own job), `WBAtlasDemo` (12 assistant scenes; name from
  `lib/wb-assistant.ts`), `WBInsights`, `WBPhoneStack`, `WBReceipt`,
  `WBAnnounceVisual`, `WBContactLanding`, `WBBookSlot`, `WBCustomBuilds`,
  `WBApplyPreview`, `WBVsImport`.
- **Numbers:** `WBOdometer`, `WBPriceAverage` (computed savings),
  `WBVsYearBars`, the home counter (`lib/wb-volume.ts`; shown for review now,
  re-gate with `volumeShowable()` before launch).
- **Hand-drawn:** `WBScribble` (variants droop / ess / swoop only), `WBDoodle`
  (free, clipboard, voice, coins, atlas, piggy; "hollow" needs the section's
  `paper` color), `WBMarker` (underline).
- **Motion helpers:** `AnimateIn` + `.wb-stagger` (children rise one by one,
  up to 11), keyframes `wb-pop-in`, `wb-row-in`, `wb-toast-in`, `wb-stamp-now`
  (no fill-mode on anything that must stay visible).
- **Forms:** `WBEmbedForm` and the booking embed carry a "Built with
  WorkBench" note (`WBBuiltWith`) wherever a WorkBench form or booking is used.

## Mascot

The koala (`components/wb/WBKoala.tsx`) appears only on contact,
book-a-call, the 404 and the floating contact launcher. No pop-up bubble.

## Carrying it into the client-facing pieces and the app (next)

The app already has its own system: `docs/design-system.md` (`.ds` tokens,
Lexend only, the COMPANY's two brand colors drive color, fixed
good/warn/bad status colors, explanations only in (i) bubbles, phones get a
simpler iOS-style tree). The heavy look must live inside those rules, not
replace them:

| Site rule | In the app / client-facing |
| --- | --- |
| Brand navy / blue / orange | The company's primary / secondary (`lib/ds-theme.ts`, `lib/hub-brand.ts` for the portal) |
| Solid card + ring + deep soft shadow | Same recipe as a `.ds` token (the Leads board card is the reference) |
| Heavy headlines | Lexend 700–800, tight tracking, page titles larger than today |
| Color in the backgrounds | Tinted page background with white cards; one strong brand band (header / summary) per screen |
| Purposeful motion | Real state changes only: a card lands, a total rolls, a stamp on Paid / Signed (`project-celebrations`, `project-micro-animations` already exist) |
| Hand-drawn notes | Marketing only. Not in the app |

Suggested order (David's plan): one app screen on desktop and phone (the
dashboard or the invoice page) and one client-facing page (the portal home or
the pay page) in this feel, get his OK on both, write the shared rules into
`docs/design-system.md`, then roll it across. Still owed from the site work:
where a live client-portal demo goes on the site (the home Try-it was
removed), and the Help Center guide updates (free tools two-step flow; Atlas
Full is no longer sold on its own).
