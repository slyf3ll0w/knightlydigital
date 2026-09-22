import Link from "next/link";
import { PhoneCall } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, isManager } from "@/lib/permissions";
import PageTitle from "@/components/PageTitle";
import EmptyState from "@/components/EmptyState";
import CallRow, { type CallRowData } from "@/components/CallRow";
import CallsLive from "@/components/CallsLive";
import LineCard, { type LineStats } from "@/components/LineCard";
import { FilterRow, FilterChip, SegmentedRow, Segment } from "@/components/FilterChips";
import { markCallsSeen, resolveCallContacts, type ResolvedCallContact } from "@/lib/voice";
import { loadCallEvents, type CallEvent } from "@/lib/call-events";
import { fmtDayShort } from "@/lib/format";

/**
 * Calls on the business line (lib/voice.ts): the line sheet up top (number,
 * where it rings right now, the keypad, a stat strip), then every call
 * grouped by day — answered, missed, or a voicemail to play right here.
 * Each row opens its call screen (/app/calls/[id]). The list keeps itself
 * current (components/CallsLive.tsx): a call placed or answered shows up
 * without a reload. Opening the page marks finished calls as seen (the
 * red-edged rows are the missed calls and voicemails nobody has looked at
 * yet). Rows from a number that has since been saved as a lead or client
 * pick up the name on the way through (resolveCallContacts), and what got
 * done on each call — quote sent, appointment booked — comes from
 * lib/call-events.ts.
 */

type Filter = "all" | "missed" | "voicemail" | "out";
const FILTERS: Array<[Filter, string]> = [
  ["all", "All"],
  ["missed", "Missed"],
  ["voicemail", "Voicemail"],
  ["out", "Outgoing"],
];

/** "Today" / "Yesterday" / "Fri, Sep 19" in the company's zone. */
function dayKey(d: Date, tz: string): string {
  return d.toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
}
function dayLabel(d: Date, tz: string, now: Date): string {
  const k = dayKey(d, tz);
  if (k === dayKey(now, tz)) return "Today";
  if (k === dayKey(new Date(now.getTime() - 86_400_000), tz)) return "Yesterday";
  return `${d.toLocaleDateString("en-US", { weekday: "short", timeZone: tz })}, ${fmtDayShort(d, tz)}`;
}

export default async function CallsPage({ searchParams }: { searchParams: Promise<{ contact?: string; f?: string }> }) {
  const actor = await requirePageActor((a) => canSell(a.role));
  const { contact: contactId, f } = await searchParams;
  const filter: Filter = f === "missed" || f === "voicemail" || f === "out" ? f : "all";

  const [company, rows] = await Promise.all([
    prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { lineNumber: true, lineForwardTo: true, lineVoiceAppAt: true, timezone: true },
    }),
    prisma.call.findMany({
      where: { companyId: actor.companyId, ...(contactId ? { contactId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        id: true,
        direction: true,
        status: true,
        customerNumber: true,
        customerDigits: true,
        durationSec: true,
        voicemailSec: true,
        voicemailRecordingId: true,
        seenAt: true,
        createdAt: true,
        endedAt: true,
        contact: { select: { id: true, firstName: true, lastName: true, status: true } },
        user: { select: { name: true } },
        via: true,
        answeredBy: { select: { name: true } },
      },
    }),
  ]);
  const now = new Date();
  const tz = company?.timezone ?? "America/Chicago";

  // Numbers that have been saved as someone since the call: show the name, and remember the link.
  const resolved = await resolveCallContacts(
    actor.companyId,
    rows.filter((c) => !c.contact).map((c) => c.customerDigits)
  ).catch(() => new Map<string, ResolvedCallContact>());
  const calls = rows.map((c) => {
    if (c.contact || !c.customerDigits) return c;
    const hit = resolved.get(c.customerDigits);
    return hit ? { ...c, contact: hit } : c;
  });
  const events = await loadCallEvents(
    actor.companyId,
    calls.map((c) => ({ id: c.id, contactId: c.contact?.id ?? null, createdAt: c.createdAt, endedAt: c.endedAt })),
    now
  ).catch(() => new Map<string, CallEvent[]>());

  // Stats are computed from the rows BEFORE they're marked seen, so "not yet seen" is honest for this visit.
  const weekAgo = now.getTime() - 7 * 86_400_000;
  const stats: LineStats = {
    today: calls.filter((c) => dayKey(c.createdAt, tz) === dayKey(now, tz)).length,
    missedUnseen: calls.filter((c) => c.status === "MISSED" && !c.seenAt).length,
    voicemailsUnseen: calls.filter((c) => c.status === "VOICEMAIL" && !c.seenAt).length,
    talkWeekSec: calls.filter((c) => c.createdAt.getTime() >= weekAgo).reduce((sum, c) => sum + (c.durationSec ?? 0), 0),
  };
  await markCallsSeen(actor.companyId).catch(() => {});

  const hasLine = Boolean(company?.lineNumber && !company.lineNumber.startsWith("pending:"));
  const routed = hasLine && Boolean(company?.lineVoiceAppAt);
  const filteredContact = contactId ? calls.find((c) => c.contact?.id === contactId)?.contact : null;

  const visible = calls.filter((c) =>
    filter === "missed"
      ? c.status === "MISSED" || (c.direction === "INBOUND" && c.status === "NO_ANSWER")
      : filter === "voicemail"
        ? c.status === "VOICEMAIL"
        : filter === "out"
          ? c.direction === "OUTBOUND"
          : true
  );
  // Group by day, newest first (rows are already newest-first).
  const groups: Array<{ label: string; rows: CallRowData[] }> = [];
  for (const c of visible) {
    const label = dayLabel(c.createdAt, tz, now);
    const row: CallRowData = { ...c, events: events.get(c.id) };
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.rows.push(row);
    else groups.push({ label, rows: [row] });
  }
  const href = (k: Filter) => `/app/calls${k === "all" ? "" : `?f=${k}`}${contactId ? `${k === "all" ? "?" : "&"}contact=${contactId}` : ""}`;

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      {hasLine && <CallsLive />}
      <PageTitle
        section="chat"
        icon={PhoneCall}
        sub={
          filteredContact ? (
            <>
              Calls with{" "}
              <Link href={`/app/contacts/${filteredContact.id}`} className="font-medium text-gray-800 hover:underline">
                {filteredContact.firstName} {filteredContact.lastName}
              </Link>{" "}
              ·{" "}
              <Link href="/app/calls" className="underline">
                all calls
              </Link>
            </>
          ) : hasLine ? (
            "Every call on your business line — answered, missed, or with the voicemail ready to play."
          ) : undefined
        }
      >
        Calls
      </PageTitle>

      {routed && company?.lineNumber && <LineCard lineNumber={company.lineNumber} forwardTo={company.lineForwardTo} manager={isManager(actor.role)} stats={stats} />}

      {calls.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            art="contacts"
            hue="var(--sh-chat)"
            showPlusIcon={false}
            title={hasLine ? "No calls yet" : "No business line yet"}
            body={
              hasLine
                ? routed
                  ? "Calls to your business line show up here as they happen — answered, missed, or with the voicemail ready to play."
                  : "Your line is still on plain forwarding. Save your ring-through number again in Settings → Features to turn on call announcements and voicemail."
                : isManager(actor.role)
                  ? "Get a business line in Settings → Features: a number of your own that rings your browser and your cell, announces who's calling, and takes voicemail."
                  : "Ask an owner to set up a business line in Settings → Features."
            }
          />
          {isManager(actor.role) && (
            <p className="mt-4 text-center">
              <Link href="/app/settings?s=features" className="text-sm font-medium underline text-gray-700">
                Open Settings → Features
              </Link>
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="mt-6 lg:hidden">
            <SegmentedRow>
              {FILTERS.map(([k, label]) => (
                <Segment key={k} active={filter === k} href={href(k)}>
                  {label}
                </Segment>
              ))}
            </SegmentedRow>
          </div>
          <div className="mt-6 hidden lg:block">
            <FilterRow>
              {FILTERS.map(([k, label]) => (
                <FilterChip key={k} hue="var(--sh-chat)" active={filter === k} href={href(k)}>
                  {label}
                </FilterChip>
              ))}
            </FilterRow>
          </div>

          {groups.length === 0 ? (
            <p className="mt-8 text-center text-sm text-gray-500">
              {filter === "missed" ? "No missed calls." : filter === "voicemail" ? "No voicemails." : "No outgoing calls yet."}
            </p>
          ) : (
            <div className="mt-2 space-y-6">
              {groups.map((g) => (
                <section key={g.label}>
                  <h2 className="mb-2 flex items-center gap-3 text-xs font-semibold text-gray-500">
                    {g.label}
                    <span className="h-px flex-1 bg-gray-200" aria-hidden />
                    <span className="numeral-ledger font-normal text-gray-400">{g.rows.length}</span>
                  </h2>
                  <div className="space-y-2">
                    {g.rows.map((c) => (
                      <CallRow key={c.id} call={c} tz={tz} canCall={routed} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
