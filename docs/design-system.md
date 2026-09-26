# WorkBench design system

One look for the whole app. Built 2026-09-25 on the dashboard (staging) for
David's review; roll out page by page once approved.

- **Kit:** `components/ds` (`DsPage`, `PageHeader`, `SectionTitle`,
  `ActionLink`, `Card`, `Stat`, `Chip`, `Button`, `ListRow`, `Hint`,
  `InfoTip`). Styles: `app/ds.css`, everything scoped under `.ds`.
- **Brand tokens:** `lib/ds-theme.ts` → `dsBrandVars(brandColor,
  brandColorSecondary, brandFont)`, injected on the AppShell root. Tests:
  `npx tsx scripts/test-ds-theme.ts`.
- **Gallery:** `/app/design` (unlisted) shows every piece in the signed-in
  company's colors, light and dark.

## Rules

1. **Lexend, only.** No Oxanium, no Inter for text. A company's own brand
   font (Settings → Branding) replaces Lexend when set. Exception: amounts
   stacked in a column use `.ds-num` (Inter tabular figures), because Lexend
   has no tabular figures and a column of money would wobble. A single big
   number (a stat) stays Lexend.
2. **Two brand colors drive everything.** `--ds-primary` (company primary):
   buttons, active states, links, the hero, charts. `--ds-secondary`
   (company secondary): sparing highlights only — the hero's status pill,
   appointment markers, today's bar in a chart, arrow sparks, the Secondary
   chip. Defaults: WorkBench blue `#0B57D8` / orange `#F86A0A`. Colors are
   darkened/lightened only as far as needed to stay readable (3:1).
3. **Status colors are fixed:** good (green), warn (amber), bad (red). Never
   branded, never used for decoration.
4. **No raw colors in pages.** Use the tokens (`var(--ds-…)`) or the kit.
5. **Explanations go in an InfoTip.** A page never gets a sentence of
   subtext explaining itself; that goes in an (i) bubble (hover on desktop,
   tap on phones). Context lines are fine ("3 clients owe you", a date).
6. **One of each:** one card, one list row, one button family, one chip, one
   hero per page (the single saturated surface).
7. **Motion:** `ds-rise` (content arriving, staggered with `--ds-i`),
   `ds-float` / pop (something new or confirmed), draw (hand-drawn arrows,
   `WBScribble tone="current"`). The quote stamp and payment celebrations
   stay the loudest moments; nothing competes with them. Everything honors
   reduced motion.
8. **Phones are simpler, not smaller.** iOS-style: one column, the next
   action first, fewer numbers, bigger tap targets. Build the phone tree
   deliberately rather than shrinking the desktop.
9. **Empty states point at the next step** with `Hint` (one line + arrow +
   one button), and disappear once there's data.
10. **Decorations never overlap content** (David, 2026-09-26, after the first
   dashboard arrow landed on its sentence and button). A hand-drawn arrow or
   any decorative element gets its own slot in the layout: never
   absolutely positioned over text/controls, never CSS-rotated (a rotated
   SVG draws outside the box the layout reserved). Need another direction?
   Add a path to `WBScribble` drawn that way (`down` exists). Check it at
   phone and desktop widths before shipping.
11. **In-app arrows come from `components/ds/Arrow`** (2026-09-26). It holds
   a set of down-pointing scribbles and deals a different one on every
   mount, so a page of empty states never repeats. Each head is placed by
   geometry (tip on the shaft's end, barbs 32–36° off it) and
   `npm run check:arrows` fails the build if a head would retrace its
   shaft (the old "down" arrow doubled back over its tail). The marketing
   site keeps `WBScribble`; the app never imports it.
12. **Everything that floats is glass** (David, 2026-09-26): right-click
   menus, "…" dropdowns, info bubbles, pickers, confirm dialogs and modals
   wear `.ds-glass` (`.ds-glass-strong` for dialogs with forms) — the same
   frosted material as the notifications panel. A floating surface is
   portaled to `<body>` or positioned `fixed` (see `InfoTip`), never
   trapped inside a card's `overflow-hidden` or a `.ds-rise` stacking
   context, and never carries a transform (iOS drops the blur).
13. **Dark mode is guarded twice.** Screens use bridged Tailwind shades or
   `--ds-*` tokens, never `text-black`, raw hex text, or an inline
   near-black `color:` — `npm run check:theme` (in CI) fails on any of
   those in `app/platform` + `components`; add `// theme-ok: <why>` only
   for surfaces that are light by design (client-page mocks). On staging,
   `e2e/specs/theme-contrast.spec.ts` measures every text node and field
   on the main screens in both themes and both widths and fails under
   2:1. The rule that matters: text with no color class inherits the
   `.ds` ink, so never set a background without also setting the ink.
14. **The secondary color is present, never loud:** the eyebrow dot
   (`.ds-eyebrow`), the hero pill, the active-item dot on the rail and the
   More sheet (`.ds-dot`), "news" counts (`.ds-count-news`, `--rail-news`),
   the link underline on hover, text selection, the desktop keel line
   under the top bar, arrow sparks, and the phone canvas bloom
   (`.page-atmo::before`). Buttons, tabs and links stay primary.

## Rolling out a page

1. Wrap the page's content in `<DsPage>` (drop its own padding/max-width).
2. Replace its header with `PageHeader` (move any explanation into `info`).
3. Swap cards/rows/buttons/badges for kit pieces; delete `card-ledger`,
   `card-tool`, `text-green-*` and raw hex classes from the page.
4. Check light + dark, desktop + phone, and `/app/design` for reference.

When every page is on the kit: move `.ds` to the AppShell root (the sidebar
and mobile bars get Lexend too), drop Oxanium from `app/layout.tsx`, and
delete the green→blue bridge and ledger/tool styles from `globals.css`.
