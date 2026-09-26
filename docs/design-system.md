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

## Rolling out a page

1. Wrap the page's content in `<DsPage>` (drop its own padding/max-width).
2. Replace its header with `PageHeader` (move any explanation into `info`).
3. Swap cards/rows/buttons/badges for kit pieces; delete `card-ledger`,
   `card-tool`, `text-green-*` and raw hex classes from the page.
4. Check light + dark, desktop + phone, and `/app/design` for reference.

When every page is on the kit: move `.ds` to the AppShell root (the sidebar
and mobile bars get Lexend too), drop Oxanium from `app/layout.tsx`, and
delete the green→blue bridge and ledger/tool styles from `globals.css`.
