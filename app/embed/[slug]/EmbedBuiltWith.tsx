/**
 * "Built with WorkBench" under every form a business embeds on its own
 * website (David 2026-11-20: the one place WorkBench names itself on
 * anything a client sees — "that is where competitors would be looking and
 * will help us advertise"). Hosted pages, the portal, quotes, invoices and
 * emails carry no WorkBench note at all. Locked: the AI page designer can't
 * remove it (docs/plans/ai-portal-designer-2026-11-20.md).
 *
 * Skipped on WorkBench's own forms and the demo company, which the
 * marketing site embeds under its own, fuller note (WBBuiltWith).
 */
const OWN = new Set(["work-bench", "brightwire-electric"]);

export const BUILT_WITH_URL = "https://workbenchfsm.com/?utm_source=embed&utm_medium=form&utm_campaign=built-with";

export default function EmbedBuiltWith({ slug }: { slug: string }) {
  if (OWN.has(slug)) return null;
  return (
    <p data-built-with className="pb-3 pt-2 text-center text-[12px] text-gray-400" style={{ fontFamily: "var(--font-lexend), Lexend, system-ui, sans-serif" }}>
      <a href={BUILT_WITH_URL} target="_blank" rel="noopener" className="text-gray-400 hover:text-gray-600">
        Built with <span className="font-semibold">WorkBench</span>
      </a>
    </p>
  );
}
