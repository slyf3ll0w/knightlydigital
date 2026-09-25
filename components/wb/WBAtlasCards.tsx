import { ArrowRight, CalendarDays, Compass } from "lucide-react";
import { ATLAS_FREE_TOKENS, ATLAS_PLAN_TOKENS, formatPlanPrice, tokenCount } from "@/lib/atlas-pricing";

/**
 * Four hand-built UI fragments that show what asking Atlas looks like: a
 * quote going out with a confirmation step, an answer about who owes money,
 * a day being moved, and the monthly token meter. Real interface pieces
 * drawn in HTML, not illustrations.
 */

const freeTokens = tokenCount(ATLAS_FREE_TOKENS);
const planTokens = tokenCount(ATLAS_PLAN_TOKENS);
const planPrice = formatPlanPrice();
const usedTokens = 3420;
const usedPct = Math.round((usedTokens / ATLAS_FREE_TOKENS) * 100);

function Ask({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[88%] rounded-2xl rounded-br-md bg-[#0B57D8] px-3.5 py-2 text-[13.5px] font-medium leading-snug text-white">
        {children}
      </p>
    </div>
  );
}

function Reply({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 flex items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-blue-50">
        <Compass className="h-3.5 w-3.5 text-[#0B57D8]" strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md bg-[#F3F5F9] px-3.5 py-2.5 text-[13.5px] leading-snug text-gray-800">
        {children}
      </div>
    </div>
  );
}

function Card({
  children,
  title,
  body,
}: {
  children: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-[1.5rem] bg-[#F6F8FB] p-4 sm:p-5">
      <div className="wb-frag min-w-0 flex-1 overflow-hidden p-4">{children}</div>
      <div className="px-1 pb-1 pt-5">
        <h3 className="text-[16px] font-extrabold text-gray-900">{title}</h3>
        <p className="mt-1 text-[14px] leading-relaxed text-gray-600">{body}</p>
      </div>
    </div>
  );
}

const owed = [
  { who: "Marcus Henderson", inv: "#1031", amt: "$2,140.00", age: "12 days" },
  { who: "Ortiz Rentals", inv: "#1019", amt: "$811.00", age: "21 days" },
  { who: "Dana Whitfield", inv: "#1027", amt: "$149.00", age: "5 days" },
];

const moved = ["Henderson, water heater", "Ortiz, drain clearing", "Whitfield, leak inspection"];

export default function WBAtlasCards() {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Card
        title="It confirms before it acts"
        body="Atlas drafts the quote, the reschedule, or the message and shows you what it is about to do. Nothing goes out until you say so."
      >
        <Ask>Send the Hendersons their quote.</Ask>
        <Reply>
          Quote #1042 for $2,140.00, water heater replacement, addressed to Sarah Henderson. Send it now?
          <span className="mt-2.5 flex flex-wrap gap-2">
            <span className="rounded-full bg-[#0A1428] px-3 py-1 text-[12.5px] font-bold text-white">Send it</span>
            <span className="rounded-full bg-white px-3 py-1 text-[12.5px] font-bold text-gray-700 ring-1 ring-inset ring-gray-200">
              Edit first
            </span>
          </span>
        </Reply>
      </Card>

      <Card
        title="Real answers from your own books"
        body="Ask a question the way you would ask an office manager and get the actual numbers back, with the next step ready to go."
      >
        <Ask>Who still owes me money?</Ask>
        <Reply>
          Three open invoices, $3,100.00 in total.
          <span className="mt-2.5 block overflow-hidden rounded-xl border border-gray-200 bg-white">
            {owed.map((r) => (
              <span
                key={r.inv}
                className="flex items-center gap-3 border-b border-gray-100 px-3 py-2 text-[12.5px] last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate font-semibold text-gray-900">{r.who}</span>
                <span className="hidden text-gray-400 sm:inline">{r.inv}</span>
                <span className="font-bold tabular-nums text-gray-900">{r.amt}</span>
                <span className="w-14 text-right text-gray-400">{r.age}</span>
              </span>
            ))}
          </span>
          <span className="mt-2.5 inline-flex items-center gap-1 text-[12.5px] font-bold text-[#0B57D8]">
            Send all three a reminder
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
        </Reply>
      </Card>

      <Card
        title="It moves the day, not just the job"
        body="Reschedule a whole day at once. Atlas keeps the order, keeps the drive time, and tells each client about the new slot."
      >
        <Ask>Reschedule Tuesday&rsquo;s jobs to Friday.</Ask>
        <Reply>
          Moving three jobs from Tue 22 to Fri 25, same order and start times. Clients get a text.
          <span className="mt-2.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <span className="min-w-0 rounded-xl border border-dashed border-gray-300 bg-white p-2">
              <span className="mb-1.5 flex items-center gap-1 text-[11px] font-bold text-gray-400">
                <CalendarDays className="h-3 w-3" strokeWidth={2.2} /> Tue 22
              </span>
              {moved.map((m) => (
                <span key={m} className="mb-1 block truncate rounded-md px-1.5 py-1 text-[11.5px] text-gray-400 line-through last:mb-0">
                  {m}
                </span>
              ))}
            </span>
            <ArrowRight className="h-4 w-4 text-[#F86A0A]" strokeWidth={2.5} />
            <span className="min-w-0 rounded-xl border border-gray-200 bg-white p-2">
              <span className="mb-1.5 flex items-center gap-1 text-[11px] font-bold text-[#0B57D8]">
                <CalendarDays className="h-3 w-3" strokeWidth={2.2} /> Fri 25
              </span>
              {moved.map((m) => (
                <span
                  key={m}
                  className="mb-1 block truncate rounded-md border-l-2 border-[#0B57D8] bg-blue-50 px-1.5 py-1 text-[11.5px] font-semibold text-gray-800 last:mb-0"
                >
                  {m}
                </span>
              ))}
            </span>
          </span>
        </Reply>
      </Card>

      <Card
        title={`${freeTokens} free tokens every month`}
        body={`Every account gets an allowance that refills on the 1st, no card needed. Atlas Full is ${planTokens} a month for ${planPrice}, and Atlas never spends past either.`}
      >
        <div className="flex items-center justify-between">
          <p className="text-[13.5px] font-bold text-gray-900">Atlas tokens</p>
          <p className="text-[12px] font-semibold text-gray-400">September</p>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-[#0B57D8]" style={{ width: `${usedPct}%` }} />
        </div>
        <div className="mt-2 flex items-baseline justify-between text-[12.5px]">
          <p className="font-semibold text-gray-700">{usedTokens.toLocaleString("en-US")} used</p>
          <p className="text-gray-400">of {freeTokens} free</p>
        </div>
        <div className="mt-4 rounded-xl bg-[#F3F5F9] p-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-bold text-gray-900">Atlas Full</p>
            <p className="text-[13px] font-bold text-[#0B57D8]">
              {planPrice}
              <span className="font-semibold text-gray-400">/month</span>
            </p>
          </div>
          <p className="mt-0.5 text-[12.5px] text-gray-500">{planTokens} tokens a month, refilled on your billing day.</p>
        </div>
      </Card>
    </div>
  );
}
