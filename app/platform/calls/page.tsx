import Link from "next/link";
import { Settings2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, isManager, contactScope } from "@/lib/permissions";
import EmptyState from "@/components/EmptyState";
import CallRow, { isMissed } from "@/components/CallRow";
import CallsLive from "@/components/CallsLive";
import CallRowSettling from "@/components/CallRowSettling";
import { callLogStamp } from "@/lib/call-pulse";
import { LinePanel, LineSub, KeypadButton, type LineStats } from "@/components/LineCard";
import { Button, DsPage, PageHeader } from "@/components/ds";
import { markCallsSeen, resolveCallContacts, type ResolvedCallContact } from "@/lib/voice";
import { loadCallEvents, type CallEvent } from "@/lib/call-events";
import { hasPlan } from "@/lib/plans";
import VoicePlanNote from "@/components/VoicePlanNote";

/**
 * Calls on the business line (lib/voice.ts), laid out like a softphone:
 *
 *   desktop — the phone on the left (components/LineCard.tsx LinePanel:
 *             number, where it rings, the keypad, mic check), the recents
 *             on the right — a segmented All / Missed / Voicemail /
 *             Outgoing, then one list of calls, newest first, each row
 *             dating itself; Text / Call back show on the row under the
 *             pointer (ticket cmwz7vhi, 2026-11-27: no stat tiles, no
 *             button on every row).
 *   phones  — iOS Recents: the large title, the line as one quiet line
 *             with a Keypad button beside it (the keypad opens as a bottom
 *             sheet — no second floating circle over the + button), the
 *             segmented control with the unseen counts, one list of rows.
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
  // The unseen counts ride the segments (iOS puts the badge on the tab).
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
        {/* iOS segmented control; the unseen counts ride the segments */}
        <nav className="cx-seg" aria-label="Show">
          {FILTERS.map(([k, label]) => (
            <Link
              key={k}
              prefetch={false}
              href={href(k)}
              aria-current={filter === k ? "page" : undefined}
              className={`cx-seg-item ${filter === k ? "is-on" : ""}`}
            >
              {label}
              {badge(k) > 0 && <span className="cx-seg-n" aria-label={`${badge(k)} new`}>{badge(k)}</span>}
            </Link>
          ))}
        </nav>

        {visible.length === 0 ? (
          <div className="cx-list cx-list-empty">
            {filter === "missed" ? "No missed calls." : filter === "voicemail" ? "No voicemails." : "No outgoing calls yet."}
          </div>
        ) : (
          // One list, newest first, like a phone's Recents: each row dates itself (CallRow recentsStamp), no day groups or counts (ticket #seej3a).
          <div className="cx-list">
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
        <>
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
          {/* Phones: the line under the title (desktop has the panel) */}
          {phone && !filteredContact && (
            <div className="cx-linesub lg:hidden">
              <LineSub lineNumber={phone.lineNumber} forwardTo={phone.forwardTo} />
              <KeypadButton />
            </div>
          )}
        </>
      }
    >
      {hasLine && <CallsLive builtWith={builtWith} />}
      {!onVoicePlan && <VoicePlanNote what="calls" manager={manager} planPage={Boolean(company?.addonEnabled)} />}

      {/* Two columns only when the line panel is there: without it the list (or the "No business line yet" empty) would sit in the 312px panel column, off-center. */}
      <div className={`mt-3 lg:mt-6 ${phone ? "lg:grid lg:grid-cols-[312px_minmax(0,1fr)] lg:items-start lg:gap-6" : ""}`}>
        {phone && <LinePanel {...phone} className="hidden lg:sticky lg:top-6 lg:block" />}
        <div className="min-w-0">{list}</div>
      </div>

    </DsPage>
  );
}
