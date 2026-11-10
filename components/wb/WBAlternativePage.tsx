import Link from "next/link";
import { ArrowRight, Check, ClipboardCheck, Minus } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import WBSplitHero from "@/components/wb/WBSplitHero";
import WBCta from "@/components/wb/WBCta";
import WBFaq from "@/components/wb/WBFaq";
import WBAgentLink from "@/components/wb/WBAgentLink";
import WBFaqJsonLd from "@/components/wb/WBFaqJsonLd";
import WBTestimonials from "@/components/wb/WBTestimonials";
import { featureByTitle } from "@/lib/wb-features";
import { FREE_PAGE_PATH } from "@/lib/wb-free";
import { WB_SHOTS } from "@/lib/wb-site";
import { COMPETITORS, EXAMPLE_SHOPS, SAVINGS_AS_OF, dollars, estimate } from "@/lib/wb-savings";
import { ALTERNATIVES, ALTERNATIVES_PATH, type Alternative } from "@/lib/wb-alternatives";
import { EXTRA_SEAT_CENTS, FREE_PLAN_NAME, INCLUDED_SEATS, PLANS, RATES_SHORT, formatCents } from "@/lib/plans";
import { TOOLS_PATH } from "@/lib/wb-tools";

/**
 * Template for /alternatives/<competitor>. Honest by construction: a
 * "what you give up" list on every page, a pricing example computed by
 * lib/wb-savings.ts (which leans in the competitor's favour and fails the
 * build when its figures go stale), and a link to the feature-by-feature
 * vs page. Every WorkBench number comes from lib/plans.
 */
export default function WBAlternativePage({ alt }: { alt: Alternative }) {
  const competitor = alt.savingsId ? COMPETITORS.find((c) => c.id === alt.savingsId) : undefined;
  const shop = EXAMPLE_SHOPS[1];
  const example = competitor ? estimate({ ...shop, model: "company" }) : null;
  const row = example?.competitors.find((c) => c.id === alt.savingsId);
  const asOf = new Date(SAVINGS_AS_OF + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const faq = alt.faq;
  const others = ALTERNATIVES.filter((a) => a.slug !== alt.slug);

  return (
    <>
      <WBFaqJsonLd items={faq} />
      <WBSplitHero
        photo={alt.photo}
        phone={WB_SHOTS.jobs}
        chip={{ icon: <ClipboardCheck className="h-[18px] w-[18px] text-[#F86A0A]" strokeWidth={2.2} />, title: "Client list imported", sub: "From a spreadsheet, in minutes" }}
      >
        <span className="wb-label justify-center lg:justify-start">{alt.name} alternative</span>
        <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] sm:text-5xl">
          {alt.headline[0]} <span className="text-[#0B57D8]">{alt.headline[1]}</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-gray-600 lg:mx-0">{alt.intro}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
          <Link href="/apply" className="wb-pill wb-pill-primary">
            Get started free
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
          </Link>
          <Link href={`/vs/${alt.slug}`} className="wb-pill wb-pill-outline">
            Feature by feature
          </Link>
        </div>
        <p className="mx-auto mt-5 max-w-2xl text-[12.5px] text-gray-400 lg:mx-0">
          {alt.name}&apos;s plans and features change; what is said about them here is general and public. WorkBench&apos;s numbers are exact and current.
        </p>
      </WBSplitHero>

      {/* Why people look */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <AnimateIn>
          <h2 className="text-2xl font-extrabold sm:text-3xl">Why people look for a {alt.name} alternative</h2>
        </AnimateIn>
        <div className="mt-10 grid gap-8 sm:grid-cols-3">
          {alt.reasons.map((r, i) => (
            <AnimateIn key={r.title} delay={i * 90}>
              <div className="flex gap-4">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#0B57D8] text-[13px] font-bold text-white">{i + 1}</span>
                <div>
                  <h3 className="text-[15.5px] font-bold text-gray-900">{r.title}</h3>
                  <p className="mt-1 text-[14px] leading-relaxed text-gray-600">{r.body}</p>
                </div>
              </div>
            </AnimateIn>
          ))}
        </div>
      </section>

      {/* Keep / give up */}
      <section className="border-y border-gray-200 bg-[#F6F8FB]">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1.4fr_1fr]">
          <AnimateIn>
            <h2 className="text-2xl font-extrabold sm:text-3xl">What you keep</h2>
            <p className="mt-2 text-[14.5px] font-semibold text-gray-500">All of it in {FREE_PLAN_NAME}, the free plan.</p>
            <ul className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {alt.keeps.map((title) => {
                const f = featureByTitle(title);
                const Icon = f.icon;
                return (
                  <li key={title} className="flex gap-3">
                    <Icon className="mt-0.5 h-5 w-5 flex-none text-[#0B57D8]" strokeWidth={1.9} />
                    <div>
                      <p className="text-[15px] font-bold text-gray-900">{f.title}</p>
                      <p className="mt-0.5 text-[13.5px] leading-relaxed text-gray-600">{f.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </AnimateIn>
          <AnimateIn delay={120}>
            <div className="rounded-[1.25rem] border border-gray-200 bg-white p-6">
              <h2 className="text-xl font-extrabold">What you give up</h2>
              <p className="mt-1 text-[13.5px] text-gray-500">The honest list, so the switch is not a surprise.</p>
              <ul className="mt-5 space-y-4">
                {alt.gives.map((g) => (
                  <li key={g} className="flex gap-3 text-[14px] leading-relaxed text-gray-700">
                    <Minus className="mt-1 h-4 w-4 flex-none text-[#F86A0A]" strokeWidth={2.75} />
                    {g}
                  </li>
                ))}
              </ul>
              <Link href={`/vs/${alt.slug}`} className="mt-6 inline-flex items-center gap-2 text-[14px] font-bold text-[#0B57D8] hover:underline">
                The full comparison
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </Link>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* Pricing example */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <AnimateIn>
          <h2 className="text-2xl font-extrabold sm:text-3xl">What it costs, side by side</h2>
          <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-gray-600">
            {FREE_PLAN_NAME} includes {INCLUDED_SEATS} users free; extra users are {formatCents(EXTRA_SEAT_CENTS)} a month each, or unlimited with {PLANS.SHOP.name} at {formatCents(PLANS.SHOP.monthlyCents)} a month. When a client pays through WorkBench the processing fee is {RATES_SHORT}, which is about what the subscription platforms charge on top of their plans.
          </p>
        </AnimateIn>
        {example && row ? (
          <AnimateIn delay={90}>
            <div className="mt-8 overflow-x-auto rounded-[1.25rem] border border-gray-200 bg-white">
              <table className="w-full min-w-[520px] text-left text-[14.5px]">
                <thead className="bg-[#F6F8FB] text-[12px] font-bold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-bold">{shop.label}, a month</th>
                    <th scope="col" className="px-4 py-3 font-bold">{alt.name}</th>
                    <th scope="col" className="px-4 py-3 font-bold text-[#0B57D8]">WorkBench</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="px-4 py-3 text-gray-600">Software</td>
                    <td className="px-4 py-3">{dollars(row.softwareCents)} <span className="text-[12.5px] text-gray-400">({row.label})</span></td>
                    <td className="px-4 py-3">{dollars(example.workbench.softwareCents)} <span className="text-[12.5px] text-gray-400">({example.workbench.label})</span></td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-gray-600">Card processing</td>
                    <td className="px-4 py-3">{dollars(row.processingCents)}</td>
                    <td className="px-4 py-3">{dollars(example.workbench.processingCents)}</td>
                  </tr>
                  <tr className="font-bold text-gray-900">
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3">{dollars(row.totalCents)}</td>
                    <td className="px-4 py-3 text-[#0B57D8]">{dollars(example.workbench.totalCents)}</td>
                  </tr>
                  <tr className="bg-blue-50/50 font-bold text-gray-900">
                    <td className="px-4 py-3">Kept a year with WorkBench</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-[#0B57D8]">{dollars(row.savingsYearCents)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-gray-400">
              {alt.name}&apos;s figures are its published annual-commitment list prices for the cheapest plan that fits, read {asOf}, with card processing at the common published rate; the estimate leans in {alt.name}&apos;s favour. The{" "}
              <Link href="/pricing#savings" className="font-semibold text-gray-600 underline-offset-2 hover:underline">
                calculator on the pricing page
              </Link>{" "}
              uses your own numbers.
            </p>
          </AnimateIn>
        ) : (
          <p className="mt-6 text-[14.5px] leading-relaxed text-gray-600">
            {alt.name} does not publish a list price, so there is no worked example here. The{" "}
            <Link href="/pricing#savings" className="font-semibold text-[#0B57D8] hover:underline">
              calculator on the pricing page
            </Link>{" "}
            shows what WorkBench costs for your team and volume.
          </p>
        )}
      </section>

      {/* Switching */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <AnimateIn>
            <h2 className="text-2xl font-extrabold sm:text-3xl">How the switch goes</h2>
          </AnimateIn>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {[
              { title: "Open the account", body: "The sign-up form takes a few minutes and the account opens today. Connect Square when you are ready to take payments; everything else works before that." },
              { title: "Bring the clients", body: `Export your client list from ${alt.name} as a spreadsheet and import it. Names, addresses, phones and emails come across. Rebuild the price book by hand, or tell Atlas what you charge.` },
              { title: "Start the next job here", body: `Finish open invoices in ${alt.name}; they stay there as records. New quotes, jobs and invoices start in WorkBench, and your clients get a portal link with no password.` },
            ].map((s, i) => (
              <AnimateIn key={s.title} delay={i * 90}>
                <div className="flex gap-4">
                  <Check className="mt-0.5 h-6 w-6 flex-none text-[#15803D]" strokeWidth={2.5} />
                  <div>
                    <h3 className="text-[15.5px] font-bold text-gray-900">{s.title}</h3>
                    <p className="mt-1 text-[14px] leading-relaxed text-gray-600">{s.body}</p>
                  </div>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      <WBTestimonials />

      <section className="mx-auto max-w-4xl px-5 py-16 sm:px-8">
        <AnimateIn>
          <h2 className="text-2xl font-extrabold sm:text-3xl">Questions</h2>
          <div className="mt-8">
            <WBFaq items={faq} />
          </div>
        </AnimateIn>
      </section>

      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
          <p className="text-[13.5px] font-bold text-gray-500">Keep exploring</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {[
              { label: `WorkBench vs. ${alt.name}`, href: `/vs/${alt.slug}` },
              ...others.map((o) => ({ label: `${o.name} alternative`, href: `${ALTERNATIVES_PATH}/${o.slug}` })),
              { label: "The free plan", href: FREE_PAGE_PATH },
              { label: "Free invoice and estimate tools", href: TOOLS_PATH },
              { label: "Pricing", href: "/pricing" },
            ].map((r) => (
              <Link key={r.href} href={r.href} className="rounded-full border border-gray-200 px-4 py-2 text-[13.5px] font-semibold text-gray-700 transition-colors hover:border-gray-900">
                {r.label} →
              </Link>
            ))}
          </div>
        </div>
      </section>

      <WBAgentLink href={`${ALTERNATIVES_PATH}/${alt.slug}.md`} what="this page" />

      <WBCta title="Free to start. Full access, not a trial." body={<>Your account opens today. Bring your client list, set your prices, and send the first quote this afternoon.</>} />
    </>
  );
}
