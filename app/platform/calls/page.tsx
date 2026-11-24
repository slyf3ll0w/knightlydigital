import Link from "next/link";
import { PhoneCall, Settings2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, isManager, contactScope } from "@/lib/permissions";
import PageTitle from "@/components/PageTitle";
import EmptyState from "@/components/EmptyState";
import CallRow, { isMissed } from "@/components/CallRow";
import CallsLive from "@/components/CallsLive";
import CallRowSettling from "@/components/CallRowSettling";
import { callLogStamp } from "@/lib/call-pulse";
import { LinePanel, LineSub, KeypadFab, type LineStats } from "@/components/LineCard";
import { SegmentedRow, Segment } from "@/components/FilterChips";
import { Button, DsPage, PageHeader } from "@/components/ds";
import { markCallsSeen, resolveCallContacts, type ResolvedCallContact } from "@/lib/voice";
import { loadCallEvents, type CallEvent } from "@/lib/call-events";
import { hasPlan } from "@/lib/plans";
import VoicePlanNote from "@/components/VoicePlanNote";

/**
 * Calls on the business line (lib/voice.ts), laid out like a softphone:
 *
 *   desktop — the phone on the left (components/LineCard.tsx LinePanel:
 *             number, where it rings, the keypad, mic check, a stat foot),
 *             the recents on the right — filter chips, then one list of
 *             calls, newest first, each row dating itself.
 *   phones  — iOS Recents: the large title, a one-row line strip, a
 *             segmented All / Missed / Voicemail / Outgoing (with the
 *             unseen counts on the segments), one list of rows, and the green
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

/** YYYY-MM-DD in the company's zone (the stat strip's "today"). */
function dayKey(d: Date, tz: string): string {
  return d.toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
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

  // Read BEFORE the rows: a change that lands in between then shows up as a newer pulse, never a missed one.
  const builtWith = await callLogStamp(actor.companyId);
  const [company, rows] = await Promise.all([
    prisma.company.findUnique({
      where: { id: actor.companyId },
      select: {
        lineNumber: true,
        lineForwardTo: true,
        lineVoiceAppAt: true,
        timezone: true,
        planGrants: true,
        paidPlans: true,
        addonActiveAt: true,
        addonEnabled: true,
        messagingRegistration: { select: { status: true } },
      },
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
        endedBy: true,
        answeredAt: true,
        contact: { select: { id: true, firstName: true, lastName: true, status: true } },
        participants: { select: { status: true, label: true } },
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
  const onVoicePlan = company ? hasPlan(company, "DISPATCH") : false;

  const visible = calls.filter((c) =>
    filter === "missed" ? isMissed(c) : filter === "voicemail" ? c.status === "VOICEMAIL" : filter === "out" ? c.direction === "OUTBOUND" : true
  );
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
        {/* Desktop: underline tabs on a hairline; the unseen counts ride them */}
        <div className="rx-tabsrow hidden lg:block">
          <div className="clx-filters">
            <nav className="clx-tabs" aria-label="Show">
              {FILTERS.map(([k, label]) => (
                <Link
                  key={k}
                  prefetch={false}
                  href={href(k)}
                  aria-current={filter === k ? "page" : undefined}
                  className={`clx-tab ${filter === k ? "is-on" : ""}`}
                >
                  {label}
                  {badge(k) > 0 && <span className={`clx-tab-n ${k === "missed" ? "rx-bad" : ""}`}>{badge(k)} new</span>}
                </Link>
              ))}
            </nav>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="ds-card rx-open-card mt-4 px-4 py-10 text-center text-sm text-[color:var(--ds-muted)] lg:mt-0">
            {filter === "missed" ? "No missed calls." : filter === "voicemail" ? "No voicemails." : "No outgoing calls yet."}
          </div>
        ) : (
          // One list, newest first, like a phone's Recents: each row dates itself (CallRow recentsStamp), no day groups or counts (ticket #seej3a).
          <div className="ds-card rx-open-card mt-4 divide-y divide-[color:var(--ds-line)] overflow-hidden lg:mt-0">
            {visible.map((c) => {
              const row = <CallRow key={c.id} call={{ ...c, events: events.get(c.id) }} tz={tz} canCall={routed} canText={smsReady} />;
              if (c.status !== "RINGING" && c.status !== "IN_PROGRESS") return row;
              // Still live on the server: if it just ended in this tab, show it finished while the hang-up webhook catches up.
              const talked = c.answeredAt ? Math.max(0, Math.round((now.getTime() - c.answeredAt.getTime()) / 1000)) : 0;
              return (
                <CallRowSettling
                  key={c.id}
                  callId={c.id}
                  live={row}
                  ended={
                    <CallRow
                      call={{ ...c, status: "COMPLETED", durationSec: talked, endedAt: now, events: events.get(c.id) }}
                      tz={tz}
                      canCall={routed}
                      canText={smsReady}
                    />
                  }
                />
              );
            })}
          </div>
        )}
      </>
    );

  // Desktop context line (the open page's header)
  const talkMin = Math.round(stats.talkWeekSec / 60);
  const contextLine = filteredContact ? (
    <>
      Calls with{" "}
      <Link href={`/app/contacts/${filteredContact.id}`} className="rx-ctx-link">
        {filteredContact.firstName} {filteredContact.lastName}
      </Link>{" "}
      ·{" "}
      <Link href="/app/calls" className="rx-ctx-link">
        all calls
      </Link>
    </>
  ) : (
    [
      `${stats.today} today`,
      stats.missedUnseen > 0 ? `${stats.missedUnseen} missed` : null,
      stats.voicemailsUnseen > 0 ? `${stats.voicemailsUnseen} ${stats.voicemailsUnseen === 1 ? "voicemail" : "voicemails"}` : null,
      talkMin > 0 ? `${talkMin} min talked this week` : null,
    ]
      .filter(Boolean)
      .join(" · ")
  );
  return (
    <DsPage
      open
      className="rx-calls"
      header={
        <div className="hidden lg:block">
          <PageHeader
            eyebrow={contextLine}
            title="Calls"
            actions={
              phone?.manager ? (
                <Button href="/app/settings?s=phone" variant="outline" icon={Settings2}>
                  Line settings
                </Button>
              ) : undefined
            }
          />
        </div>
      }
    >
      {hasLine && <CallsLive builtWith={builtWith} />}
      <div className="flex items-start justify-between gap-3 lg:hidden">
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

      {!onVoicePlan && <VoicePlanNote what="calls" manager={manager} planPage={Boolean(company?.addonEnabled)} />}

      {/* Two columns only when the line panel is there: without it the list (or the "No business line yet" empty) would sit in the 312px panel column, off-center. */}
      <div className={`mt-3 lg:mt-6 ${phone ? "lg:grid lg:grid-cols-[312px_minmax(0,1fr)] lg:items-start lg:gap-6" : ""}`}>
        {phone && <LinePanel {...phone} stats={stats} className="hidden lg:sticky lg:top-6 lg:block" />}
        <div className="min-w-0">{list}</div>
      </div>

      {phone && <KeypadFab />}
    </DsPage>
  );
}
