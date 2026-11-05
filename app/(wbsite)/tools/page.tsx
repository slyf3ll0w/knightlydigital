import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileText, PenLine } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import WBCta from "@/components/wb/WBCta";
import { TRADES } from "@/lib/wb-trades";
import { TOOLS, templatePath, toolPath } from "@/lib/wb-tools";

export const metadata: Metadata = {
  title: "Free tools for contractors: invoice and estimate generators",
  description:
    "Free invoice generator and free estimate generator for home-service contractors, with templates for plumbing, HVAC, electrical, lawn care, cleaning and more. Download the PDF with your logo. No account, no email, no watermark. From WorkBench FSM.",
  alternates: { canonical: "https://workbenchfsm.com/tools" },
};

const ICONS = { invoice: FileText, estimate: PenLine } as const;

export default function ToolsPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-5 pb-10 pt-4 sm:px-8 sm:pt-6">
        <AnimateIn>
          <span className="wb-label">Free tools</span>
          <h1 className="mt-4 max-w-3xl text-4xl font-extrabold leading-[1.08] sm:text-5xl">Free tools for people who fix things for a living.</h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-gray-600">
            Make an invoice or an estimate in your browser and download the PDF with your logo on it. No account, no email address, no watermark. Built by WorkBench FSM, the free field service software for home-service companies.
          </p>
        </AnimateIn>
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {TOOLS.map((tool, i) => {
            const Icon = ICONS[tool.kind];
            return (
              <AnimateIn key={tool.slug} delay={i * 90}>
                <Link href={toolPath(tool)} className="group flex h-full flex-col rounded-[1.25rem] border border-gray-200 bg-white p-6 transition-colors hover:border-gray-900">
                  <Icon className="h-7 w-7 text-[#0B57D8]" strokeWidth={1.9} />
                  <h2 className="mt-4 text-[20px] font-extrabold text-gray-900">{tool.title}</h2>
                  <p className="mt-2 flex-1 text-[14.5px] leading-relaxed text-gray-600">{tool.description}</p>
                  <span className="mt-5 inline-flex items-center gap-2 text-[14px] font-bold text-[#0B57D8]">
                    Open the {tool.noun} generator
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
                  </span>
                </Link>
              </AnimateIn>
            );
          })}
        </div>
      </section>

      <section className="border-t border-gray-200 bg-[#F6F8FB]">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
          <AnimateIn>
            <h2 className="text-2xl font-extrabold sm:text-3xl">Templates by trade</h2>
            <p className="mt-2 max-w-2xl text-[14.5px] text-gray-600">The generators with each trade&apos;s usual line items already filled in. Edit the prices, delete what does not apply, download.</p>
          </AnimateIn>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TRADES.map((t) => {
              const Icon = t.icon;
              return (
                <div key={t.slug} className="rounded-xl border border-gray-200 bg-white px-4 py-3.5">
                  <p className="flex items-center gap-2.5 text-[15px] font-bold text-gray-900">
                    <Icon className="h-[18px] w-[18px] text-[#0B57D8]" strokeWidth={2} />
                    {t.name}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] font-semibold">
                    {TOOLS.map((tool) => (
                      <Link key={tool.slug} href={templatePath(tool, t)} className="text-[#0B57D8] hover:underline">
                        {tool.noun[0].toUpperCase() + tool.noun.slice(1)} template →
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <WBCta title="The tools are free. So is the software." body="WorkBench FSM runs the whole job: booking, scheduling, estimates with e-signature, invoicing, card and bank payments, and a client portal. The core is free for a small team, not a trial." secondary={{ label: "See every feature", href: "/features" }} />
    </>
  );
}
