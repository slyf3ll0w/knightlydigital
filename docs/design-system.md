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
   (`.ds-eyebrow`), the hero pill, the title reveal's sweeping edge
   (`.ds-wipe`, replaced the hand-drawn underline — David found the
   scribble unprofessional for the software), status-chip dots, "news" counts
   (`.ds-count-news`, `--rail-news`), KPI label dots, the hovered list row's
   hairline, ledger totals (`.ds-ledger-total`), the link underline on hover,
   text selection, arrow sparks, and the phone canvas bloom
   (`.page-atmo::before`). Buttons, tabs and links stay primary. Retired
   2026-09-26 at David's request: the active-row dot and the keel line.
15. **Every nav item has a quick menu:** right-click on the desktop rail,
   press-and-hold on the tab bar and the More tiles (`RowActions` from
   `components/QuickMenu`, actions from `navQuickActions` in AppShell:
   open, open in new tab, the section's New …, copy link). QuickMenu
   portals both its popover and its phone sheet to the app root — a
   `fixed` sheet left under a glass surface is trapped by its backdrop
   filter.

## Rolling out a page

1. Wrap the page's content in `<DsPage>` (drop its own padding/max-width).
2. Replace its header with `PageHeader` (move any explanation into `info`).
3. Swap cards/rows/buttons/badges for kit pieces; delete `card-ledger`,
   `card-tool`, `text-green-*` and raw hex classes from the page.
4. Check light + dark, desktop + phone, and `/app/design` for reference.

When every page is on the kit: move `.ds` to the AppShell root (the sidebar
and mobile bars get Lexend too), drop Oxanium from `app/layout.tsx`, and
delete the green→blue bridge and ledger/tool styles from `globals.css`.

## Client pages (the Client Kit, 2026-10-22)

Everything a CLIENT of a business sees is a different product from the
app: one job per page, no navigation, read on a phone from a text or an
email, often by someone who will never see WorkBench again. It gets its
own kit — `app/client.css` (tokens + styles under `.client`),
`components/client` (pieces), `lib/client-theme.ts` (the ONE brand
resolver for client surfaces), fixtures in `lib/client-fixtures.ts`, and the
gallery at `/app/design/client` (frames of `/client-preview`, the fake
Brightwire Electric). Phase 1 = the estimate (`/quote/[token]`) and the
invoice (`/pay/[token]`); emails, booking, the hub and agreements follow
in that order, each reviewed on the gallery first.

1. **The business is the brand, WorkBench is the paper.** Their logo,
   their name, ONE accent (`clientAccent`: document color → secondary →
   primary → WorkBench blue, darkened only until it reads on white). The
   accent appears on the letterhead rule, the total's rule, the primary
   button and the stamp — nowhere else. Everything else is ink on white.
   WorkBench appears once, small, at the very foot ("Sent with WorkBench").
2. **Documents look like documents.** Letterhead (logo + business left,
   document type + number + dates right), a single brand rule, PREPARED
   FOR / BILLED TO, a ruled item table, a totals ledger with the accent
   rule over the total, a stamp for state. The same letterhead on web, PDF
   (`lib/pdf.tsx`) and email.
3. **State stays on the document.** Approving or paying never swaps the
   sheet for a "Success!" card: the stamp slams onto the paper
   (`Stamp slam`), the sign-off / remittance stub becomes the `Receipt`
   (who signed, what was paid, what happens next). Withdrawn and expired
   are muted stamps with one plain sentence.
4. **Forms look like a good clipboard.** One column, labels above,
   48 px fields, the accent only on the focus ring and the primary button,
   `Choices` for two or three big options. No cards inside cards.
5. **No heroes, no gradients, no icon in a tinted circle, no "Hi {name}!"**
   Copy is the business's voice: short, second person, specific.
6. **Type.** Lexend for the company name, document number, headings,
   stamps and buttons; Inter with tabular figures (`.c-num`) for body
   copy and every column of money. A company's own brand font replaces
   Lexend when set.
7. **Phones first.** Items stack (name, qty × unit under it, amount
   right), totals go full width, the next action rides the bottom edge in
   the `ActionBar`. The desk gets the sheet on a desk-colored ground with
   a soft shadow; the phone IS the sheet.
8. **Always light** (`ForceLightTheme`), never the operator's dark mode.
9. **No raw colors in pages** — tokens (`var(--c-…)`) or the kit. Status
   colors (good / warn / bad) are fixed.
10. **Review on the gallery before shipping**, at 390 and 900, in the
    navy, unbranded, yellow and black-and-white brands.

The platform console (`/superadmin`) is on the kit since 2026-09-30:
`components/console/ConsoleShell` is the rail + top bar (the app's rail
hardware, WorkBench blue/orange as the fixed brand), every page is a
`DsPage`, and `npm run check:theme` covers `app/superadmin` too. Its
own pieces live in `components/console/` (PresenceDot, DeviceIcons,
ConsoleSearch, AccountsClient, SignupsClient).
