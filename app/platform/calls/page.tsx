import Link from "next/link";
import { PhoneCall, Settings2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, isManager, contactScope } from "@/lib/permissions";
import PageTitle from "@/components/PageTitle";
import EmptyState from "@/components/EmptyState";
import CallRow, { isMissed, type CallRowData } from "@/components/CallRow";
import CallsLive from "@/components/CallsLive";
import { LinePanel, LineSub, KeypadFab, type LineStats } from "@/components/LineCard";
import { FilterRow, FilterChip, SegmentedRow, Segment } from "@/components/FilterChips";
import { markCallsSeen, resolveCallContacts, type ResolvedCallContact } from "@/lib/voice";
import { loadCallEvents, type CallEvent } from "@/lib/call-events";
import { fmtDayShort } from "@/lib/format";

/**
 * Calls on the business line (lib/voice.ts), laid out like a softphone:
 *
 *   desktop — the phone on the left (components/LineCard.tsx LinePanel:
 *             number, where it rings, the keypad, mic check, a stat foot),
 *             the recents on the right — filter chips, then every call
 *             grouped by day as ledger rows.
 *   phones  — iOS Recents: the large title, a one-row line strip, a
 *             segmented All / Missed / Voicemail / Outgoing (with the
 *             unseen counts on the segments), grouped rows, and the green
 *             keypad button above the tab bar (KeypadFab → bottom sheet).
 *
 * Each row opens its call screen (/app/calls/[id]); a voicemail plays in
 * the row. The list keeps itself current (components/CallsLive.tsx): a
 * call placed or answered shows up without a reload. Opening the page
 * marks finished calls as seen (the bold rows with the red dot are the
 * missed calls and voicemails nobody has looked at yet). Rows from a
 * number that has since been saved as a lead or client pick up the name on
 * the way through (resolveCallContacts), and what got done on each call —
 * quote sent, appointment booked — comes from lib/call-events.ts.
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
  // Managers see every call. SALES/USER see calls with their own leads, calls
  // nobody has been matched to yet (an unknown number is a lead to claim), and
  // calls they placed or answered themselves — mirroring contactScope.
  const scope: Record<string, unknown> = isManager(actor.role)
    ? {}
    : {
        OR: [
          { contact: contactScope(actor) },
          { contactId: null },
          { userId: actor.id },
          { answeredByUserId: actor.id },
        ],
      };

  const [company, rows] = await Promise.all([
    prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { lineNumber: true, lineForwardTo: true, lineVoiceAppAt: true, timezone: true, messagingRegistration: { select: { status: true } } },
    }),
    prisma.call.findMany({
      where: { companyId: actor.companyId, ...scope, ...(contactId ? { contactId } : {}) },
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
  await markCallsSeen(actor.companyId, scope).catch(() => {});

  const hasLine = Boolean(company?.lineNumber && !company.lineNumber.startsWith("pending:"));
  const routed = hasLine && Boolean(company?.lineVoiceAppAt);
  const smsReady = hasLine && company?.messagingRegistration?.status === "ACTIVE";
  const filteredContact = contactId ? calls.find((c) => c.contact?.id === contactId)?.contact : null;
  const manager = isManager(actor.role);

  const visible = calls.filter((c) =>
    filter === "missed" ? isMissed(c) : filter === "voicemail" ? c.status === "VOICEMAIL" : filter === "out" ? c.direction === "OUTBOUND" : true
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
  // The unseen counts ride the phone's segments (iOS puts the badge on the tab); desktop has the stat foot.
  const badge = (k: Filter) => (k === "missed" ? stats.missedUnseen : k === "voicemail" ? stats.voicemailsUnseen : 0);
  const phone = routed && company?.lineNumber ? { lineNumber: company.lineNumber, forwardTo: company.lineForwardTo, manager } : null;

  const list =
    calls.length === 0 ? (
      <div className="mt-6">
        <EmptyState
          art="contacts"
          hue="var(--ds-primary)"
          showPlusIcon={false}
          title={hasLine ? "No calls yet" : "No business line yet"}
          body={
            hasLine
              ? routed
                ? "Calls to your business line show up here as they happen — answered, missed, or with the voicemail ready to play."
                : "Your line is still on plain forwarding. Save your ring-through number again in Settings → Phone & texting to turn on call announcements and voicemail."
              : manager
                ? "Get a business line in Settings → Phone & texting: a number of your own that rings your browser and your cell, announces who's calling, and takes voicemail."
                : "Ask an owner to set up a business line in Settings → Phone & texting."
          }
        />
        {manager && (
          <p className="mt-4 text-center">
            <Link href="/app/settings?s=phone" className="ds-link text-sm">
              Open Settings → Phone &amp; texting
            </Link>
          </p>
        )}
      </div>
    ) : (
      <>
        {/* Phones: the filter stays put while the list scrolls under it (a frosted bar, like the chat header). */}
        <div className="glass-bar sticky top-0 z-20 -mx-4 border-b px-4 py-2 lg:hidden">
          <SegmentedRow>
            {FILTERS.map(([k, label]) => (
              <Segment key={k} active={filter === k} href={href(k)}>
                {label}
                {badge(k) > 0 && (
                  <span
                    className={`ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold leading-none ${
                      filter === k ? "bg-white/25" : k === "missed" ? "bg-[color:var(--ds-bad)] text-[color:var(--ds-surface)]" : "bg-[color:var(--ds-primary)] text-[color:var(--ds-on-primary)]"
                    }`}
                  >
                    {badge(k)}
                  </span>
                )}
              </Segment>
            ))}
          </SegmentedRow>
        </div>
        <div className="hidden lg:block">
          <FilterRow>
            {FILTERS.map(([k, label]) => (
              <FilterChip key={k} hue="var(--ds-primary)" active={filter === k} href={href(k)}>
                {label}
                {badge(k) > 0 && <span className="numeral-ledger text-xs opacity-70">{badge(k)}</span>}
              </FilterChip>
            ))}
          </FilterRow>
        </div>

        {groups.length === 0 ? (
          <div className="ds-card mt-4 px-4 py-10 text-center text-sm text-[color:var(--ds-muted)] lg:mt-0">
            {filter === "missed" ? "No missed calls." : filter === "voicemail" ? "No voicemails." : "No outgoing calls yet."}
          </div>
        ) : (
          <div className="mt-4 space-y-6 lg:mt-0">
            {groups.map((g) => (
              <section key={g.label}>
                {/* Phones: the grouped-list section label (no rule); desktop keeps the ledger rule. */}
                <h2 className="mb-1.5 flex items-center gap-3 px-1 text-[13px] font-semibold text-gray-500 lg:mb-2 lg:px-0 lg:text-xs">
                  {g.label}
                  <span className="hidden h-px flex-1 bg-gray-200 lg:block" aria-hidden />
                  <span className="numeral-ledger ml-auto font-normal text-gray-400 lg:ml-0">{g.rows.length}</span>
                </h2>
                <div className="ds-card divide-y divide-[color:var(--ds-line)] overflow-hidden">
                  {g.rows.map((c) => (
                    <CallRow key={c.id} call={c} tz={tz} canCall={routed} canText={smsReady} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </>
    );

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      {hasLine && <CallsLive />}
      <div className="flex items-start justify-between gap-3">
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
            ) : phone ? (
              // Phones: the line lives under the title (desktop has the panel).
              <span className="lg:hidden">
                <LineSub lineNumber={phone.lineNumber} forwardTo={phone.forwardTo} />
              </span>
            ) : undefined
          }
        >
          Calls
        </PageTitle>
        {phone?.manager && (
          <Link
            href="/app/settings?s=phone"
            aria-label="Line settings"
            title="Line settings"
            className="btn-tool-line mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-white text-gray-700 lg:hidden"
          >
            <Settings2 size={16} />
          </Link>
        )}
      </div>

      <div className="mt-3 lg:mt-6 lg:grid lg:grid-cols-[312px_minmax(0,1fr)] lg:items-start lg:gap-6">
        {phone && <LinePanel {...phone} stats={stats} className="hidden lg:sticky lg:top-6 lg:block" />}
        <div className="min-w-0">{list}</div>
      </div>

      {phone && <KeypadFab />}
    </div>
  );
}
