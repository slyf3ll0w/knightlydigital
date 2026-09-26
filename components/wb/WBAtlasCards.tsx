import { ArrowUp, Bell, CalendarDays, Check, Coins, ExternalLink, FileText, X } from "lucide-react";
import { AtlasMark } from "@/components/AtlasIcon";
import { ATLAS_FREE_TOKENS, tokenCount } from "@/lib/atlas-pricing";

/**
 * Three replicas of the real Atlas drawer (components/AssistantDrawer.tsx)
 * on the home page: the same paper ground, the same accent bubble for what
 * you typed, Atlas answering in plain text, and the same ledger card he
 * uses to ask for your OK, with the meter and composer underneath. Built
 * from the drawer's own markup and .card-ledger so it matches the software,
 * not a mock of it.
 */

const BLUE = "#0B57D8";
const GREEN = "#15803d";
const freeTokens = tokenCount(ATLAS_FREE_TOKENS);
const leftTokens = Math.round(ATLAS_FREE_TOKENS * 0.66);

function You({ children }: { children: React.ReactNode }) {
  return (
    <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-[#0B57D8] px-3.5 py-2 text-white">
      <p className="text-sm font-medium">{children}</p>
    </div>
  );
}

function Atlas({ children, tokens }: { children: React.ReactNode; tokens: string }) {
  return (
    <div className="mr-4 px-0.5 py-1">
      <p className="text-sm leading-relaxed text-gray-800">{children}</p>
      <p className="mt-1 flex items-center gap-1 text-[10px] text-gray-400">
        <Coins size={10} />
        {tokens} tokens
      </p>
    </div>
  );
}

type Row = { label: string; value: string; numeral?: boolean };

function Card({
  icon: Icon,
  kicker,
  title,
  rows,
  batch,
  commit,
  done,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  kicker: string;
  title: string;
  rows?: Row[];
  batch?: string[];
  commit?: string;
  done?: { note: string };
}) {
  const ink = done ? GREEN : BLUE;
  return (
    <div className="card-ledger mr-4 overflow-hidden text-left">
      <div
        className="flex items-start gap-3 px-3.5 pb-2.5 pt-3"
        style={{ background: `color-mix(in srgb, ${ink} 9%, transparent)` }}
      >
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold leading-none" style={{ color: ink }}>
            {done ? <Check size={12} strokeWidth={3} /> : <Icon size={12} />}
            {kicker}
          </p>
          <p className="font-display mt-1.5 text-[14px] font-bold leading-snug text-gray-900">{title}</p>
        </div>
        {done && (
          <span
            className="font-display mt-0.5 shrink-0 rounded-[4px] border-2 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ borderColor: ink, color: ink }}
          >
            Done
          </span>
        )}
      </div>
      <div className="px-3.5">
        {batch ? (
          <ol className="divide-y divide-gray-100">
            {batch.map((l, j) => (
              <li key={l} className="flex items-baseline gap-2 py-1.5 text-xs">
                <span className="font-display w-4 shrink-0 text-right text-[11px] text-gray-400">{j + 1}</span>
                <span className="min-w-0 truncate text-gray-700">{l}</span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="divide-y divide-gray-100">
            {rows?.map((r) => (
              <div key={r.label} className="flex items-baseline justify-between gap-3 py-1.5 text-xs">
                <span className="shrink-0 text-gray-500">{r.label}</span>
                <span className={`min-w-0 truncate text-right font-medium text-gray-800 ${r.numeral ? "font-display text-[13px]" : ""}`}>
                  {r.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      {done ? (
        <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-gray-100 px-3.5 py-2 text-xs text-gray-500">
          <span className="min-w-0 truncate">{done.note}</span>
          <span className="flex shrink-0 items-center gap-1 font-medium text-gray-700">
            Open <ExternalLink size={11} />
          </span>
        </div>
      ) : (
        <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-gray-100 px-3.5 py-2.5">
          <span className="rounded-full px-2.5 py-1.5 text-xs font-medium text-gray-500">Skip</span>
          <span
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-white"
            style={{ background: BLUE }}
          >
            <Check size={12} strokeWidth={2.5} />
            {commit}
          </span>
        </div>
      )}
    </div>
  );
}

function Drawer({ children, caption }: { children: React.ReactNode; caption: string }) {
  return (
    <div className="flex flex-col">
      <div className="flex min-h-[520px] flex-col overflow-hidden rounded-[1.25rem] border border-gray-200 bg-[#F7F9FC] shadow-[0_1px_2px_rgba(10,20,40,0.04),0_16px_40px_-20px_rgba(10,20,40,0.25)]">
        {/* the drawer has no header bar, only a floating close control */}
        <div className="flex items-center justify-between px-3 pt-3">
          <AtlasMark size={30} accent={BLUE} />
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm">
            <X size={16} strokeWidth={2.2} />
          </span>
        </div>
        <div className="flex-1 space-y-3 px-4 pb-4 pt-4">{children}</div>
        <div className="border-t border-gray-200 bg-white px-3 pb-3 pt-2.5">
          <div className="flex flex-wrap items-center justify-between gap-x-2 text-[10px] font-semibold">
            <span className="flex items-center gap-1 text-gray-500">
              <Coins size={11} />
              {leftTokens.toLocaleString("en-US")} of {freeTokens} free tokens left
            </span>
            <span className="text-gray-400">refills Oct 1</span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-gray-200">
            <div className="h-full rounded-full" style={{ width: "34%", background: BLUE }} />
          </div>
          <div className="mt-2.5 flex items-end gap-2">
            <div className="min-h-[42px] flex-1 rounded-2xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-400">
              Ask Atlas anything…
            </div>
            <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-white" style={{ background: BLUE }}>
              <ArrowUp size={18} strokeWidth={2.5} />
            </span>
          </div>
        </div>
      </div>
      <p className="mt-4 px-1 text-[14.5px] leading-relaxed text-gray-600">{caption}</p>
    </div>
  );
}

export default function WBAtlasCards() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Drawer caption="Sending anything to a client gets a card first. Atlas lays out exactly what goes out, and nothing moves until you tap Send.">
        <You>Send the Hendersons their quote.</You>
        <Atlas tokens="312">Quote #1042 is ready for Sarah Henderson. Here is what goes out:</Atlas>
        <Card
          icon={FileText}
          kicker="Needs your OK"
          title="Send quote #1042"
          rows={[
            { label: "Client", value: "Sarah Henderson" },
            { label: "Job", value: "Water heater replacement" },
            { label: "Total", value: "$2,140.00", numeral: true },
            { label: "To", value: "sarah.h@gmail.com" },
          ]}
          commit="Send"
        />
      </Drawer>

      <Drawer caption="Questions come back with the real numbers from your books, and the obvious next step is already drafted as a batch you can approve at once.">
        <You>Who still owes me money?</You>
        <Atlas tokens="540">
          Three invoices are open, $3,100.00 in total. Marcus Henderson is the oldest at 21 days. Want me to send reminders?
        </Atlas>
        <Card
          icon={Bell}
          kicker="3 changes · needs your OK"
          title="Send 3 payment reminders"
          batch={[
            "Marcus Henderson · #1031 · $2,140.00 · 21 days",
            "Ortiz Rentals · #1019 · $811.00 · 12 days",
            "Dana Whitfield · #1027 · $149.00 · 5 days",
          ]}
          commit="Send all 3"
        />
      </Drawer>

      <Drawer caption="A whole day can move in one ask. Once you approve, the card stamps itself done and the clients hear about the new time.">
        <You>Reschedule Tuesday&rsquo;s jobs to Friday.</You>
        <Atlas tokens="1,120">
          Moved all three to Friday the 25th in the same order, drive time intact. Each client got a text with the new time.
        </Atlas>
        <Card
          icon={CalendarDays}
          kicker="Applied"
          title="Move 3 jobs to Fri, Sep 25"
          batch={["Henderson · water heater · 9:00 am", "Ortiz · drain clearing · 1:00 pm", "Whitfield · leak inspection · 3:30 pm"]}
          done={{ note: "3 jobs moved" }}
        />
      </Drawer>
    </div>
  );
}
