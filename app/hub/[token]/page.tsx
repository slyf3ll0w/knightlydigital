import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { invoiceBalance } from "@/lib/payments";
import { canChargeOnline, CHARGE_GATE_SELECT } from "@/lib/payments-gate";
import { isPastDue } from "@/lib/due-dates";
import { arrivalTimeLabel, resolveArrivalWindowMinutes } from "@/lib/arrival-window";
import { hubFormWords } from "@/lib/hub-form";
import { galleryStateFor } from "@/lib/gallery-preview";
import { hubPhotoSrc } from "@/lib/photos-shared";
import { loadClientTheme } from "@/lib/client-theme-load";
import { portalSectionOrder } from "@/lib/client-theme-spec";
import HubHome, { type HubHomeData } from "./HubHome";

export default async function HubHomePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const contact = await prisma.contact.findUnique({
    where: { hubToken: token },
    include: {
      quotes: {
        where: { status: "AWAITING_RESPONSE" },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, quoteNumber: true, total: true, publicToken: true },
      },
      invoices: {
        where: { status: { in: ["AWAITING_PAYMENT", "PAST_DUE"] } },
        include: { payments: true },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      },
      jobs: {
        where: { status: "ACTIVE", scheduledAt: { gte: startOfDay } },
        orderBy: { scheduledAt: "asc" },
        take: 5,
        select: {
          id: true,
          title: true,
          scheduledAt: true,
          scheduledAnytime: true,
          arrivalWindowMinutes: true,
        },
      },
      company: {
        select: {
          id: true,
          name: true,
          slug: true,
          timezone: true,
          arrivalWindowMinutes: true,
          hubBookingTypeId: true,
          ...CHARGE_GATE_SELECT,
        },
      },
      contracts: {
        where: { status: { in: ["SENT", "SIGNED"] } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, title: true, status: true, signedAt: true },
      },
    },
  });
  if (!contact) notFound();
  // The business's chosen client hub form lends its words to the card
  const hubForm = await hubFormWords(contact.company);
  // Completed work (Gallery plan): the latest finished visits with a report
  const recentWork = (await galleryStateFor(contact.company.id)).open
    ? await prisma.job.findMany({
        where: { contactId: contact.id, status: { in: ["REQUIRES_INVOICING", "ARCHIVED"] } },
        orderBy: [{ completedAt: "desc" }, { closedAt: "desc" }, { updatedAt: "desc" }],
        take: 3,
        select: {
          id: true,
          title: true,
          completedAt: true,
          closedAt: true,
          photos: { where: { clientVisible: true }, orderBy: [{ takenAt: "asc" }, { createdAt: "asc" }], take: 1, select: { id: true, thumbKey: true } },
        },
      })
    : [];
  // Unread company replies: the count rides the nav; the newest one's words lead the card
  const unreadCount = await prisma.portalMessage.count({
    where: { contactId: contact.id, direction: "OUTBOUND", readByClientAt: null },
  });
  const latestUnread = unreadCount
    ? await prisma.portalMessage.findFirst({
        where: { contactId: contact.id, direction: "OUTBOUND", readByClientAt: null },
        orderBy: { createdAt: "desc" },
        select: { body: true },
      })
    : null;

  const base = `/hub/${token}`;
  const tz = contact.company.timezone;

  // Balance: what's still owed across open invoices (a fully covered one drops out)
  const owing = contact.invoices
    .map((inv) => ({ inv, left: Math.max(0, invoiceBalance(inv)) }))
    .filter((x) => x.left > 0);
  const balanceAmount = owing.reduce((s, x) => s + x.left, 0);
  // Due dates are calendar days stored at noon — read them on the UTC day (lib/due-dates)
  const dueDay = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
  const overdue = owing.filter((x) => x.inv.status === "PAST_DUE" || isPastDue(x.inv.dueDate, now));
  const soonestDue = owing.find((x) => x.inv.dueDate)?.inv.dueDate ?? null;
  const balance: HubHomeData["balance"] =
    balanceAmount > 0
      ? {
          amount: balanceAmount,
          count: owing.length,
          href: owing.length === 1 ? `/pay/${owing[0].inv.publicToken}` : `${base}/invoices`,
          what: owing.length === 1 ? `Invoice ${owing[0].inv.invoiceNumber}` : `${owing.length} invoices`,
          due:
            overdue.length > 0
              ? owing.length === 1 && overdue[0].inv.dueDate
                ? `Past due since ${dueDay(overdue[0].inv.dueDate)}`
                : overdue.length === 1
                  ? "1 is past due"
                  : `${overdue.length} are past due`
              : soonestDue
                ? `Due ${dueDay(soonestDue)}`
                : null,
          overdue: overdue.length > 0,
          payable: canChargeOnline(contact.company),
        }
      : null;

  // Clients are promised an arrival window, never the dispatch-exact time —
  // and everything renders in the company's timezone, not the server's.
  const visitTime = (d: Date, anytime: boolean, jobWindow: number | null) =>
    anytime
      ? "Anytime"
      : `arriving ${arrivalTimeLabel(tz, d, resolveArrivalWindowMinutes(jobWindow, contact.company.arrivalWindowMinutes))}`;
  const month = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: tz });
  const day = (d: Date) => d.toLocaleDateString("en-US", { day: "numeric", timeZone: tz });

  const q0 = contact.quotes[0];
  const data: HubHomeData = {
    token,
    base,
    companyName: contact.company.name,
    balance,
    quote: q0
      ? {
          count: contact.quotes.length,
          title: q0.title || `Quote ${q0.quoteNumber}`,
          total: contact.quotes.length === 1 ? Number(q0.total) : null,
          href: contact.quotes.length === 1 ? `/quote/${q0.publicToken}` : `${base}/quotes`,
        }
      : null,
    pendingContracts: contact.contracts.filter((c) => c.status === "SENT").map((c) => ({ id: c.id, title: c.title })),
    unread: unreadCount ? { count: unreadCount, preview: latestUnread?.body?.trim() || null } : null,
    visits: contact.jobs
      .filter((j) => j.scheduledAt)
      .map((j) => {
        const d = new Date(j.scheduledAt!);
        return {
          id: j.id,
          title: j.title,
          month: month(d),
          day: day(d),
          when: `${d.toLocaleDateString("en-US", { weekday: "long", timeZone: tz })} · ${visitTime(d, j.scheduledAnytime, j.arrivalWindowMinutes)}`,
        };
      }),
    recentWork: recentWork.map((j) => {
      const when = j.completedAt ?? j.closedAt;
      const cover = j.photos[0];
      return {
        id: j.id,
        title: j.title,
        when: when ? `Completed ${when.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: tz })}` : "Completed",
        thumb: cover ? hubPhotoSrc(token, cover.id, cover.thumbKey ? "thumb" : "full") : null,
        month: when ? month(when) : null,
        day: when ? day(when) : null,
      };
    }),
    signedContracts: contact.contracts
      .filter((c) => c.status === "SIGNED")
      .map((c) => ({
        id: c.id,
        title: c.title,
        when: c.signedAt ? new Date(c.signedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz }) : "",
      })),
    form: {
      heading: hubForm?.heading ?? "Get work done",
      description: hubForm?.description ?? "Send us a request and fill us in on the details.",
      buttonLabel: hubForm?.buttonLabel ?? "New request",
    },
  };

  // The page-designer theme (Pro) may reorder / hide sections; Balance due and the to-do cards stay first
  const theme = await loadClientTheme(contact.companyId);
  return <HubHome d={data} sections={theme.isDefault ? undefined : portalSectionOrder(theme)} />;
}
