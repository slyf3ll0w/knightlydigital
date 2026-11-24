/**
 * The open page for the app's new/edit forms (wave 2 of the open-page
 * rollout, 2026-11-24). The forms keep their own components untouched; this
 * wrapper puts them on the white open page at a desk and deals a page
 * entrance like <DsPage open> does. `flat` opens the form's cards into
 * sections (bold title, two-color bar, hairline) — styles in
 * app/ds-open-forms.css, all scoped to lg+, so phones are unchanged.
 * `flat={false}` for builders whose cards ARE the content (Automations).
 */
const ENTRANCES = ["rise", "slide", "cascade", "settle", "focus"] as const;

export default function OpenForm({ children, flat = true }: { children: React.ReactNode; flat?: boolean }) {
  const enter = ENTRANCES[Math.floor(Math.random() * ENTRANCES.length)];
  return (
    <div className={`bb-wrap bb-open ${flat ? "fx-open" : ""}`} data-enter={enter} suppressHydrationWarning>
      <div className="bb-page">{children}</div>
    </div>
  );
}
