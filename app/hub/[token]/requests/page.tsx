import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Plus } from "lucide-react";
import { shortDate } from "@/lib/statuses";
import { HubEmpty, HubGroup, HubPageHead, HubRow, HubStatus, type HubTone } from "../HubKit";

/**
 * Client hub: the requests this client has filed, with an honest status —
 * before this, a client could submit a request and never see it again.
 * Status is derived across the request's lifecycle (quote sent / work
 * scheduled) rather than parroting internal enum names.
 */
export default async function HubRequestsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const contact = await prisma.contact.findUnique({
    where: { hubToken: token },
    select: {
      company: { select: { timezone: true } },
      requests: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          quotes: { select: { status: true, publicToken: true } },
          jobs: { select: { status: true, scheduledAt: true } },
        },
      },
    },
  });
  if (!contact) notFound();
  // Dates in the company's zone — the server clock is UTC, and an evening visit read as the next day
  const tz = contact.company.timezone;

  const requests = contact.requests;
  const base = `/hub/${token}`;

  /** Client-facing lifecycle label, derived — not the internal enum. */
  function describe(r: (typeof requests)[number]): {
    label: string;
    tone: HubTone;
    quoteToken?: string;
  } {
    const openQuote = r.quotes.find((q) => q.status === "AWAITING_RESPONSE");
    if (openQuote) {
      return {
        label: "Quote ready for review",
        tone: "info",
        quoteToken: openQuote.publicToken,
      };
    }
    const activeJob = r.jobs.find((j) => j.status === "ACTIVE");
    if (activeJob) {
      return activeJob.scheduledAt
        ? {
            label: `Scheduled · ${shortDate(activeJob.scheduledAt, tz)}`,
            tone: "good",
          }
        : {
            label: "In progress",
            tone: "good",
          };
    }
    if (r.jobs.length > 0 || r.status === "CONVERTED") {
      return { label: "Completed", tone: "neutral" };
    }
    if (r.status === "NEEDS_APPROVAL") {
      return {
        label: "Booking awaiting confirmation",
        tone: "warn",
      };
    }
    if (r.status === "ARCHIVED") {
      return { label: "Closed", tone: "neutral" };
    }
    return {
      label: "Received — we'll be in touch",
      tone: "warn",
    };
  }

  const newButton = (
    <Link href={`${base}/requests/new`} className="hh-btn">
      <Plus size={16} strokeWidth={2.4} />
      New request
    </Link>
  );
  return (
    <div>
      <HubPageHead
        title="Requests"
        note={requests.length === 0 ? "Tell us what you need done" : `${requests.length} sent`}
        action={requests.length > 0 ? newButton : undefined}
      />
      {requests.length === 0 ? (
        <HubEmpty title="You haven't sent any requests yet" body="Tell us what you need done and we'll take it from there." action={newButton} />
      ) : (
        <HubGroup flush>
          {requests.map((r) => {
            const s = describe(r);
            return (
              <HubRow
                key={r.id}
                href={s.quoteToken ? `/quote/${s.quoteToken}` : undefined}
                title={r.title}
                sub={
                  <>
                    <HubStatus tone={s.tone} label={s.label} />
                    <span className="hk-row-sub">Sent {shortDate(r.createdAt)}</span>
                  </>
                }
              />
            );
          })}
        </HubGroup>
      )}
    </div>
  );
}
