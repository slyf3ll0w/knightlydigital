"use client";

import { CheckCircle, Copy, ExternalLink, Eye, Inbox, PenLine, Pencil, Send, Trash2 } from "lucide-react";
import { FONT, firstName, useDemoLoop } from "./kit";
import { BW, DsCard, DsChip, PhoneApp } from "./WBDemoChecklist";

/**
 * Agreements: the client's signing page (app/contract/[token]
 * ContractSignPage: read it, type your full name, tick the box, Sign
 * agreement, "Signed"), the owner's phone on the agreement
 * (app/platform/contracts/[id]: "Awaiting Signature" → "Signed" with the
 * green signed-by line), and the client's signed copy
 * (lib/email.ts contractSignedCopyEmail). Phones show only the signing page.
 * Rests signed under reduced motion.
 */

const DEFAULTS = {
  client: "Derek Olsen",
  title: "Service panel upgrade agreement",
  clauses: [
    "Replace the 100 A panel with a 200 A panel and main breaker.",
    "Permit and city inspection handled by Brightwire Electric.",
    "Power off for up to 6 hours on the install day.",
    "Balance due when the job passes inspection.",
    "Workmanship guaranteed for one year.",
  ],
  total: 3850,
};

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const SIGNED_AT = "October 27, 2026 at 10:12 AM";

export default function WBDemoContract({
  client = DEFAULTS.client,
  title = DEFAULTS.title,
  clauses = DEFAULTS.clauses,
  total = DEFAULTS.total,
}: {
  client?: string;
  title?: string;
  clauses?: string[];
  total?: number;
  /** Kept for callers; an agreement takes no payment (the deposit is collected on the quote). */
  depositPct?: number;
} = {}) {
  const list = (clauses.length ? clauses : DEFAULTS.clauses).slice(0, 6);
  // An agreement is free text the business writes; the price is part of it.
  const body = [
    ...list.map((c, k) => `${k + 1}. ${c}`),
    "",
    `Price: ${money(total)} as quoted.`,
  ].join("\n");

  const typeMs = 60;
  const typed = client.length;
  const tTyped = 900 + typed * typeMs;
  // 1..typed letters · tick the box · press Sign · Signed · the owner's phone flips · the signed copy lands · opens
  const letters = Array.from({ length: typed }, (_, k) => 900 + k * typeMs);
  const { ref, b } = useDemoLoop([...letters, tTyped + 400, tTyped + 1000, tTyped + 1350, tTyped + 2300, tTyped + 4200, tTyped + 5000], tTyped + 9800);
  const name = client.slice(0, Math.min(typed, b));
  const agree = b >= typed + 1;
  const pressing = b === typed + 2;
  const signed = b >= typed + 3;
  const ownerSees = b >= typed + 4;
  const landed = b >= typed + 5;
  const opened = b >= typed + 6;
  const first = firstName(client);

  return (
    <div ref={ref} className="flex items-start justify-center gap-6 text-left" style={FONT} aria-hidden data-wb-demo="contract">
      {/* the client's signing page, then their inbox with the signed copy */}
      <div className="relative h-[560px] w-full max-w-[620px] overflow-hidden rounded-xl bg-gray-50 max-sm:h-[720px] shadow-[0_0_0_1px_rgba(10,20,40,0.1),0_30px_60px_-30px_rgba(10,20,40,0.5)]">
        {!landed ? (
          <div className="sm:[zoom:0.86]">
            <SignPage title={title} body={body} client={client} name={name} agree={agree} pressing={pressing} signed={signed} />
          </div>
        ) : (
          <div key="mail" className="wb-step-in h-full bg-white">
            <div className="flex h-[44px] items-center gap-2 border-b border-[#E4E7ED] bg-[#F8F9FB] px-4 text-[11.5px] font-semibold text-gray-700">
              <Inbox className="h-3.5 w-3.5" /> Inbox
              <span className="ml-auto text-[10.5px] font-normal text-gray-400">{first.toLowerCase()}@mail.com</span>
            </div>
            {!opened ? (
              <div className="wb-row-in flex items-start gap-2.5 border-b border-[#EEF0F3] bg-[#F5F8FF] px-4 py-3">
                <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-[#0B57D8]" />
                <span className="min-w-0 flex-1">
                  <span className="flex justify-between gap-2">
                    <span className="truncate text-[11.5px] font-semibold text-gray-900">Brightwire Electric</span>
                    <span className="flex-none text-[10px] text-gray-400">Now</span>
                  </span>
                  <span className="block truncate text-[11px] font-semibold text-gray-800">Your signed copy of {title}</span>
                </span>
              </div>
            ) : (
              <div key="open" className="wb-step-in">
                <div className="border-b border-[#EEF0F3] px-5 py-3">
                  <p className="text-[14px] font-semibold text-gray-900">Your signed copy of {title}</p>
                  <p className="mt-0.5 text-[10.5px] text-gray-500">Brightwire Electric · to {first.toLowerCase()}@mail.com</p>
                </div>
                <SignedCopyEmail first={first} title={title} client={client} body={body} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* the owner's phone on the agreement */}
      <div className="flex-none max-lg:hidden">
        <PhoneApp back="Agreements" width={280} height={560}>
          <div className="mb-4 flex items-center gap-3">{ownerSees ? <DsChip tone="good">Signed</DsChip> : <DsChip tone="warn">Awaiting Signature</DsChip>}</div>
          <div className="mb-6 space-y-4">
            <div className="min-w-0">
              <p className="text-[28px] font-[650] leading-[1.12] tracking-[-0.022em]">{title}</p>
              <p className="text-sm" style={{ color: BW.primary }}>
                {client}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-[12px] px-4 py-2 text-sm font-semibold text-white" style={{ background: BW.primary }}>
                <Copy size={13} /> Copy signing link
              </span>
              {!ownerSees && (
                <span className="flex items-center gap-1.5 rounded-[12px] border bg-white px-3 py-2 text-sm font-semibold text-gray-700" style={{ borderColor: BW.lineStrong }}>
                  <Send size={13} /> Email signing link again
                </span>
              )}
              <span className="rounded-[12px] border bg-white p-2 text-gray-500" style={{ borderColor: BW.lineStrong }}>
                <ExternalLink size={15} />
              </span>
              {!ownerSees && (
                <span className="rounded-[12px] border bg-white p-2 text-gray-500" style={{ borderColor: BW.lineStrong }}>
                  <Pencil size={15} />
                </span>
              )}
              {!ownerSees && (
                <span className="rounded-[12px] border bg-white px-3 py-2 text-sm font-semibold text-gray-700" style={{ borderColor: BW.lineStrong }}>
                  Void
                </span>
              )}
              <span className="rounded-[12px] border p-2 text-gray-400" style={{ borderColor: BW.lineStrong }}>
                <Trash2 size={15} />
              </span>
            </div>
          </div>
          <DsCard className="mb-6 flex flex-wrap gap-x-8 gap-y-2 px-5 py-4 text-sm">
            <div>
              <span className="block text-xs font-medium text-gray-500">Sent</span>
              <span className="text-gray-800">Oct 26, 2026</span>
            </div>
            <div>
              <span className="block text-xs font-medium text-gray-500">Viewed</span>
              <span className="inline-flex items-center gap-1 font-medium text-green-700">
                <Eye size={13} />
                Oct 26, 2026
              </span>
            </div>
          </DsCard>
          {ownerSees && (
            <div className="wb-row-in mb-5 rounded-lg px-4 py-3 text-sm" style={{ background: BW.goodSoft, color: BW.good }}>
              Signed by <span className="font-semibold">{client}</span> on {SIGNED_AT} · IP 73.42.118.20
            </div>
          )}
          <DsCard className="px-6 py-5">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{body}</p>
          </DsCard>
        </PhoneApp>
      </div>
    </div>
  );
}

/** app/contract/[token]/ContractSignPage.tsx (Brightwire has no logo on file, so the name heads the page). */
function SignPage({ title, body, client, name, agree, pressing, signed }: { title: string; body: string; client: string; name: string; agree: boolean; pressing: boolean; signed: boolean }) {
  const accent = BW.secondary; // brandColorSecondary ?? brandColor
  return (
    <div className="min-h-full bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <p className="text-xl font-bold text-gray-900">Brightwire Electric</p>
          <p className="mt-1 text-sm text-gray-500">Service agreement for {client}</p>
        </div>
        <div className="overflow-hidden rounded-[8px] border bg-white shadow-sm" style={{ borderColor: "color-mix(in srgb, #0A1428 16%, #e5e7eb)" }}>
          <div className="border-b border-gray-100 px-6 py-5">
            <p className="text-lg font-bold text-gray-900">{title}</p>
          </div>
          <div className="px-6 py-5">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{body}</p>
          </div>
          <div className="border-t border-gray-100 bg-gray-50 px-6 py-5">
            {signed ? (
              <div key="signed" className="wb-step-in flex items-start gap-3">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full" style={{ backgroundColor: `${accent}22` }}>
                  <CheckCircle size={20} style={{ color: accent }} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Signed</p>
                  <p className="mt-0.5 text-xs text-gray-500">Thank you — both parties will keep a copy of this agreement.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="block text-sm font-medium text-gray-700">
                  <span className="mb-1 flex items-center gap-1.5">
                    <PenLine size={14} className="text-gray-400" />
                    Type your full name to sign
                  </span>
                  <span
                    className={`block w-full rounded border bg-white px-3 py-2.5 ${name ? "text-gray-900" : "text-gray-400"} ${name && name.length < client.length ? "border-gray-400" : "border-gray-300"}`}
                    style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 16, lineHeight: "24px" }}
                  >
                    {name || client}
                    {name && name.length < client.length && <span className="ml-px inline-block h-[18px] w-px translate-y-[3px] bg-gray-700" />}
                  </span>
                </div>
                <div className="flex items-start gap-2 text-xs text-gray-600">
                  <span className={`mt-0.5 flex h-3.5 w-3.5 flex-none items-center justify-center rounded-[3px] border ${agree ? "border-[#0B57D8] bg-[#0B57D8]" : "border-gray-300 bg-white"}`}>
                    {agree && (
                      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
                        <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  I have read this agreement and intend my typed name to act as my electronic signature.
                </div>
                <span
                  className={`relative flex w-full items-center justify-center gap-2 rounded py-3 text-sm font-semibold transition-[opacity,transform] duration-150 ${pressing ? "scale-[0.98]" : ""}`}
                  style={{ backgroundColor: accent, color: "#111827", opacity: agree && name.length >= 2 ? 1 : 0.5 }}
                >
                  Sign agreement
                  {pressing && <span className="wb-demo-tap left-1/2 top-1/2" />}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** lib/email.ts contractSignedCopyEmail in the clientShell letter. */
function SignedCopyEmail({ first, title, client, body }: { first: string; title: string; client: string; body: string }) {
  const sys = { fontFamily: "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif" };
  const p = "mb-[14px] text-[15px] leading-[1.6] text-[#1F2937]";
  return (
    <div className="bg-white px-5 py-7" style={sys}>
      <div className="max-w-[560px]">
        <p className={p}>Hi {first},</p>
        <p className={p}>
          Here&apos;s your copy of <strong>{title}</strong>, signed by {client} on {SIGNED_AT}. You can also{" "}
          <span className="underline" style={{ color: BW.secondary }}>
            view it online
          </span>
          .
        </p>
        <div className="mb-5 border-y border-[#E5E7EB] pb-2 pt-4">
          {body.split("\n").map((line, k) => (
            <p key={k} className="mb-2 text-[13px] leading-[1.5] text-[#374151]">
              {line || " "}
            </p>
          ))}
        </div>
        <p className="mt-1.5 text-[15px] leading-[1.6] text-[#1F2937]">
          Thanks,
          <br />
          Brightwire Electric
        </p>
      </div>
    </div>
  );
}
