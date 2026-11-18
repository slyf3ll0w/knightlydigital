import { requireSuperadminPage } from "@/lib/superadmin";
import { Card, Chip, DsPage, PageHeader } from "@/components/ds";
import { crossCompanyCorrections } from "@/lib/estimator-corrections-server";

export const dynamic = "force-dynamic";

/**
 * Corrections across companies (docs/plans/estimator-corrections-2026-11-17.md).
 *
 * Each company's estimate tools learn from that company's own sent quotes.
 * This page looks across all of them for the SAME correction in the same
 * trade: one owner raising a rate is their pricing; three fence companies
 * all adding a haul-away line by hand is the builder leaving it out. A
 * pattern here is a builder fix and a new case on the estimator answer key.
 * Read-only, platform staff only; nothing on it reaches another company.
 */
export default async function SuperadminCorrectionsPage() {
  await requireSuperadminPage();
  const { patterns, toolsRead, toolsWithSuggestions } = await crossCompanyCorrections();
  const shared = patterns.filter((p) => p.companies > 1);
  const single = patterns.filter((p) => p.companies === 1);
  return (
    <DsPage>
      <PageHeader
        eyebrow={`${toolsRead} tool${toolsRead === 1 ? "" : "s"} with enough sent quotes`}
        title="Corrections"
        info="What owners keep changing on quotes made from their estimate tools, grouped by trade. The same change in more than one company points at the builder, not at one owner's prices. Fix the builder, then add the case to the estimator answer key."
      />
      <div className="space-y-6">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">In more than one company</h2>
          {shared.length === 0 ? (
            <Card className="px-6 py-9 text-center text-sm text-gray-500">
              Nothing yet. {toolsWithSuggestions === 0 ? "No tool has a proven correction." : `${toolsWithSuggestions} tool${toolsWithSuggestions === 1 ? " has" : "s have"} a proven correction, each in one company only.`}
            </Card>
          ) : (
            <div className="space-y-3">
              {shared.map((p) => (
                <PatternCard key={`${p.industry}|${p.what}`} p={p} />
              ))}
            </div>
          )}
        </section>
        {single.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-gray-900">In one company so far</h2>
            <div className="space-y-3">
              {single.slice(0, 60).map((p) => (
                <PatternCard key={`${p.industry}|${p.what}`} p={p} />
              ))}
            </div>
          </section>
        )}
      </div>
    </DsPage>
  );
}

function PatternCard({ p }: { p: Awaited<ReturnType<typeof crossCompanyCorrections>>["patterns"][number] }) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-gray-900">{p.what}</p>
        <Chip tone="neutral">{p.industry}</Chip>
        <Chip tone={p.companies > 1 ? "primary" : "neutral"}>
          {p.companies} compan{p.companies === 1 ? "y" : "ies"} · {p.tools} tool{p.tools === 1 ? "" : "s"}
        </Chip>
      </div>
      <ul className="mt-3 space-y-1 text-sm text-gray-600">
        {p.examples.map((e, i) => (
          <li key={i}>
            <span className="font-medium text-gray-800">{e.company}</span> · {e.tool}: {e.said}
          </li>
        ))}
      </ul>
    </Card>
  );
}
