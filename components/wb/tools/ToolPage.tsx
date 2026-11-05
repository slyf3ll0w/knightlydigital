import Link from "next/link";
import { Check } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import DocGenerator from "@/components/wb/tools/DocGenerator";
import WBCta from "@/components/wb/WBCta";
import WBFaq from "@/components/wb/WBFaq";
import WBFaqJsonLd from "@/components/wb/WBFaqJsonLd";
import { FREE_PAGE_PATH } from "@/lib/wb-free";
import { TRADES, type Trade } from "@/lib/wb-trades";
import { TOOLS, TOOLS_PATH, templateForTrade, templatePath, toolPath, type ToolMeta } from "@/lib/wb-tools";
import { emptyDoc, newLineId, type ToolDoc } from "@/lib/tool-doc";

/**
 * One page per tool (/tools/invoice-generator) and per trade template
 * (/tools/invoice-template/plumbing): the generator with a trade's usual
 * line items filled in, then the copy a search engine needs — what the
 * document should carry, how it works, the questions people ask — and the
 * grid of other trades. The generator is the page; the copy is under it.
 */

export function initialDocFor(tool: ToolMeta, trade?: Trade): ToolDoc {
  const base = emptyDoc(tool.kind);
  const template = templateForTrade(trade?.slug ?? "");
  return {
    ...base,
    clientMessage: template.message,
    lines: template.lines.map((l) => ({ ...l, id: newLineId(), optional: tool.kind === "estimate" && l.optional })),
  };
}

export function toolFaq(tool: ToolMeta, trade?: Trade): { q: string; a: string }[] {
  const noun = tool.noun;
  const who = trade ? `${trade.noun}` : "a contractor";
  return [
    {
      q: `Is the ${noun} generator really free?`,
      a: `Yes. Build the ${noun}, download the PDF, send it however you like. There is no account, no email address to hand over, no watermark and no limit on how many you make. It is built by WorkBench FSM, which makes free field service software for home-service companies; the only thing we offer beside the download is a free account that keeps the ${noun} and lets the client ${tool.kind === "invoice" ? "pay it online" : "approve it online"}.`,
    },
    {
      q: `What should ${who === "a contractor" ? "a contractor's" : `${who}'s`} ${noun} include?`,
      a:
        tool.kind === "invoice"
          ? "Your business name and contact details, the client's name and address, an invoice number and date, a due date, each item of work with a quantity and price, sales tax if you collect it, the total, and a line about how to pay. Keep the item names in plain words the homeowner recognizes from the conversation."
          : "Your business name and contact details, the client's name and the job address, an estimate number and the date it stops being valid, each part of the work with a price, which items are optional, the deposit you need to start, sales tax if it applies, and a sentence about what the price includes and what it does not.",
    },
    {
      q: `Can I add my logo and colors?`,
      a: `Yes. Upload a PNG or JPG and pick an accent color; both go on the PDF. The file stays in your browser until you download, and it is only sent to our server to render the PDF.`,
    },
    {
      q: "Does it save my work?",
      a: "The page saves what you type in this browser, so a refresh or a closed tab does not lose it. It is not saved on our servers unless you choose to open an account with it.",
    },
    {
      q: `What happens if I click ${tool.kind === "invoice" ? "Get paid online" : "Send it for e-signature"}?`,
      a: `The sign-up form opens with your business details filled in. When the account is created, this ${noun} is waiting in it with the logo, client and line items intact${tool.kind === "invoice" ? ", and you can send the client a link to pay by card or bank transfer" : ", and you can send the client a link to approve and sign it on their phone"}. The core WorkBench plan is free, not a trial.`,
    },
    ...(tool.kind === "invoice"
      ? [
          {
            q: "Can I charge sales tax and give a discount?",
            a: "Yes. Enter your tax rate as a percent, and add a discount as a percent or a dollar amount. The discount comes off the subtotal and tax applies to what is left, which is how the app and most accounting software compute it.",
          },
        ]
      : [
          {
            q: "What does an optional line item do?",
            a: "It marks that item as something the client can leave off, and the PDF labels it that way. In a WorkBench account the client toggles those items on or off on their phone before they sign, and the total updates as they choose.",
          },
        ]),
  ];
}

export default function ToolPage({ tool, trade }: { tool: ToolMeta; trade?: Trade }) {
  const other = TOOLS.find((t) => t.kind !== tool.kind)!;
  const faq = toolFaq(tool, trade);
  const storageKey = `wb-tool-${tool.kind}-${trade?.slug ?? "generic"}`;
  const noun = tool.noun;
  const title = trade ? `Free ${trade.name.toLowerCase()} ${noun} template` : tool.title;
  const intro = trade
    ? `${noun === "invoice" ? "An" : "A"} ${noun} with the line items ${trade.noun} usually bills, ready to edit, with your logo and colors on the PDF. Change anything, download it free, and send it. The prices are starting points, not ours.`
    : tool.kind === "invoice"
      ? "Fill in the job, download a clean PDF with your logo on it, and send it. No account, no email address, no watermark. If you would rather the client paid by card from a link, the same invoice can open a free WorkBench account."
      : "Price the job, mark the parts the client can choose, ask for a deposit, and download a clean PDF with your logo on it. No account, no email address, no watermark. If you would rather the client signed it on their phone, the same estimate can open a free WorkBench account.";

  return (
    <>
      <WBFaqJsonLd items={faq} />
      <section className="mx-auto max-w-6xl px-5 pb-8 pt-4 sm:px-8 sm:pt-6">
        <AnimateIn>
          <span className="wb-label">{trade ? `${trade.eyebrow} · free tool` : "Free tool"}</span>
          <h1 className="mt-4 max-w-3xl text-4xl font-extrabold leading-[1.08] sm:text-5xl">{title}</h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-gray-600">{intro}</p>
          <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[13.5px] font-semibold text-gray-700">
            {["No account", "No email required", "No watermark", "Your logo and colors", "Unlimited"].map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4 text-[#15803D]" strokeWidth={2.75} />
                {t}
              </li>
            ))}
          </ul>
        </AnimateIn>
      </section>

      <section className="border-y border-gray-200 bg-[#F6F8FB]">
        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
          <DocGenerator initial={initialDocFor(tool, trade)} storageKey={storageKey} />
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <AnimateIn>
          <h2 className="text-2xl font-extrabold sm:text-3xl">How it works</h2>
        </AnimateIn>
        <div className="mt-10 grid gap-8 sm:grid-cols-3">
          {[
            { title: "Fill it in", body: `Your business, the client, and the lines of work. ${trade ? `The ${trade.name.toLowerCase()} lines are already there; edit the prices and delete what does not apply.` : "Add your logo and pick a color so it looks like yours."}` },
            { title: "Download the PDF", body: "One click. It is rendered with the same document engine WorkBench uses for real invoices and estimates, so it looks professional on a phone and on paper." },
            {
              title: tool.kind === "invoice" ? "Get paid, if you want" : "Get it signed, if you want",
              body:
                tool.kind === "invoice"
                  ? "Email or text the PDF yourself, or open a free account with this invoice in it and send the client a link to pay by card or bank transfer. Reminders go out on their own."
                  : "Email the PDF yourself, or open a free account with this estimate in it and send the client a link to approve, sign, and pay the deposit on their phone.",
            },
          ].map((s, i) => (
            <AnimateIn key={s.title} delay={i * 90}>
              <div className="flex gap-4">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#0B57D8] text-[13px] font-bold text-white">{i + 1}</span>
                <div>
                  <h3 className="text-[15.5px] font-bold text-gray-900">{s.title}</h3>
                  <p className="mt-1 text-[14px] leading-relaxed text-gray-600">{s.body}</p>
                </div>
              </div>
            </AnimateIn>
          ))}
        </div>
      </section>

      {/* Trade templates */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
          <AnimateIn>
            <h2 className="text-2xl font-extrabold sm:text-3xl">{noun[0].toUpperCase() + noun.slice(1)} templates by trade</h2>
            <p className="mt-2 max-w-2xl text-[14.5px] text-gray-600">The same generator with the line items each trade usually bills already filled in.</p>
          </AnimateIn>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TRADES.map((t) => {
              const Icon = t.icon;
              const active = t.slug === trade?.slug;
              return (
                <Link
                  key={t.slug}
                  href={templatePath(tool, t)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-[14.5px] font-semibold transition-colors ${active ? "border-[#0B57D8] bg-blue-50/50 text-[#0B57D8]" : "border-gray-200 text-gray-800 hover:border-gray-900"}`}
                >
                  <Icon className="h-[18px] w-[18px] flex-none text-[#0B57D8]" strokeWidth={2} />
                  {t.name} {noun} template
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-4xl px-5 py-16 sm:px-8">
        <AnimateIn>
          <h2 className="text-2xl font-extrabold sm:text-3xl">Questions</h2>
          <div className="mt-8">
            <WBFaq items={faq} />
          </div>
        </AnimateIn>
      </section>

      {/* Related */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
          <p className="text-[13.5px] font-bold text-gray-500">Keep exploring</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {[
              { label: `Free ${other.noun} generator`, href: toolPath(other) },
              { label: "Every free tool", href: TOOLS_PATH },
              ...(trade ? [{ label: `WorkBench for ${trade.name.toLowerCase()}`, href: `/trades/${trade.slug}` }] : []),
              { label: tool.kind === "invoice" ? "Free invoicing software" : "Quotes & invoicing in WorkBench", href: tool.kind === "invoice" ? "/free-invoicing-software" : "/features/quotes-and-invoicing" },
              { label: "The free plan", href: FREE_PAGE_PATH },
            ].map((r) => (
              <Link key={r.href} href={r.href} className="rounded-full border border-gray-200 px-4 py-2 text-[13.5px] font-semibold text-gray-700 transition-colors hover:border-gray-900">
                {r.label} →
              </Link>
            ))}
          </div>
        </div>
      </section>

      <WBCta
        title={tool.kind === "invoice" ? "Tired of chasing the check?" : "Tired of estimates that go quiet?"}
        body={
          tool.kind === "invoice"
            ? "WorkBench sends the invoice, takes the card or bank payment, and sends the reminders. The core is free for a small team, not a trial."
            : "WorkBench sends the estimate, the client signs on their phone and pays the deposit, and the follow-ups go out on their own. The core is free for a small team, not a trial."
        }
        secondary={{ label: "See every feature", href: "/features" }}
      />
    </>
  );
}
