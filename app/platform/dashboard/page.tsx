import { prisma } from "@/lib/db";
import { dealLine } from "@/lib/empty-lines";
import { dayShapeLine, daypartOf, holidayLine } from "@/lib/day-shape";
import Link from "next/link";
import {
  Inbox,
  FileText,
  Briefcase,
  Receipt,
  ChevronRight,
  CheckCircle2,
  CalendarPlus,
  CalendarCheck,
  LifeBuoy,
  Repeat,
  CalendarDays,
  Plus,
  SquareKanban,
  ListChecks,
} from "lucide-react";
import { money, appointmentTypeLabel } from "@/lib/statuses";
import { invoiceBalance } from "@/lib/payments";
import { SECTION_HUES } from "@/lib/section-colors";
import { formatDuration } from "@/lib/time-entries";
import { renderMessageTemplate, DEFAULT_ON_MY_WAY_TEMPLATE } from "@/lib/messaging";
import { arrivalTimeLabel, resolveArrivalWindowMinutes } from "@/lib/arrival-window";
import { startOfDayIn, startOfMonthIn, startOfWeekIn, zonedMidnight, zonedParts } from "@/lib/timezone";
import GetStartedCard from "./GetStartedCard";
import GetStartedRow from "../settings/GetStartedRow";
import PayoutNudge from "./PayoutNudge";
import AtlasFrontDoor from "@/components/AtlasFrontDoor";
import { loadGetStarted } from "@/lib/get-started";
import { featureAllowedFor } from "@/lib/plan-gate";
import DashboardTasks from "./DashboardTasks";
import Monogram from "@/components/Monogram";
import { dashboardTasks } from "@/lib/tasks";
import UpNextActions from "./UpNextActions";
import { PushNudge } from "@/components/PushNotifications";
import { BandBody, Button, Chip, DsPage, OpenSection, PageHeader } from "@/components/ds";
import {
  requirePageActor,
  isManager,
  canSell,
  canSeeMoney,
  canSeePricing,
  viaContactScope,
  contactScope,
  jobScope,
  appointmentScope,
} from "@/lib/permissions";


export default async function DashboardPage() {
  const actor = await requirePageActor();
  const companyId = actor.companyId;

  // Role lens: what this person's dashboard talks about
  const sell = canSell(actor.role);
  const seeMoney = canSeeMoney(actor);
  const seePrices = canSeePricing(actor.role);
  // Timesheets are Pro (lib/plans.ts): without them the "On the clock" card
  // and the hero's Clock In stay off the page — the upsell is /app/timesheets.
  const timesheetsAllowed = await featureAllowedFor(companyId, "timesheets");
  const seePerformance = isManager(actor.role) || actor.role === "USER";
  const leadScope = viaContactScope(actor);
  const jScope = jobScope(actor);

  // "Today", "this week", "this month" and the greeting are the company's
  // calendar, not the server's: Railway runs on UTC, so a Central owner at
  // 8 pm was already seeing tomorrow's visits and "Good afternoon" at 11 am.
  const tz =
    (await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } }))
      ?.timezone ?? "America/Chicago";
  const now = new Date();
  const local = zonedParts(tz, now);
  const startOfDay = startOfDayIn(tz, now);
  const endOfDay = zonedMidnight(tz, local.y, local.m, local.d + 1);
  const startOfMonth = startOfMonthIn(tz, now);
  const startOfWeek = startOfWeekIn(tz, now);
  const endOfWeek = zonedMidnight(tz, local.y, local.m, local.d - local.weekday + 7);

  const [
    newRequests,
    needsApprovalRequests,
    approvedQuotes,
    draftQuotes,
    changesRequestedQuotes,
    requiresInvoicingJobs,
    unscheduledJobs,
    draftInvoices,
    pastDueInvoices,
    todayVisits,
    todayAppointments,
    receivables,
    upcomingJobsWeek,
    monthPayments,
    getStarted,
    onClock,
    readyToBill,
    heroCompany,
    myOpenEntry,
    newLeads,
    taskLists,
    payoutNudge,
  ] = await Promise.all([
    prisma.request.count({ where: { companyId, ...leadScope, status: "NEW" } }),
    prisma.request.count({ where: { companyId, ...leadScope, status: "NEEDS_APPROVAL" } }),
    prisma.quote.count({ where: { companyId, ...leadScope, status: "APPROVED" } }),
    prisma.quote.count({ where: { companyId, ...leadScope, status: "DRAFT" } }),
    prisma.quote.count({ where: { companyId, ...leadScope, status: "CHANGES_REQUESTED" } }),
    prisma.job.count({ where: { companyId, ...jScope, status: "REQUIRES_INVOICING" } }),
    prisma.job.count({ where: { companyId, ...jScope, status: "ACTIVE", scheduledAt: null } }),
    prisma.invoice.count({ where: { companyId, ...leadScope, status: "DRAFT" } }),
    prisma.invoice.count({ where: { companyId, ...leadScope, status: "PAST_DUE" } }),
    prisma.job.findMany({
      where: { companyId, ...jScope, scheduledAt: { gte: startOfDay, lt: endOfDay } },
      include: { contact: true, lineItems: true, assignments: { include: { user: true } } },
      orderBy: { scheduledAt: "asc" },
    }),
    sell
      ? prisma.appointment.findMany({
          where: {
            companyId,
            ...appointmentScope(actor),
            status: "SCHEDULED",
            scheduledAt: { gte: startOfDay, lt: endOfDay },
          },
          include: { contact: true, assignedTo: { select: { name: true } }, _count: { select: { extraAssignees: true } } },
          orderBy: { scheduledAt: "asc" },
        })
      : Promise.resolve([]),
    seePerformance
      ? prisma.invoice.findMany({
          where: { companyId, status: { in: ["AWAITING_PAYMENT", "PAST_DUE"] } },
          include: { payments: true, contact: { select: { id: true, firstName: true, lastName: true } } },
        })
      : Promise.resolve([]),
    seePerformance
      ? prisma.job.findMany({
          // Every job on this week's calendar, the finished ones too: a job
          // that was done, invoiced and paid on Monday turns ARCHIVED, and
          // counting only ACTIVE made the week's total shrink as work got
          // done. An archived job counts when work or billing happened on
          // it; one that was simply called off does not.
          where: {
            companyId,
            scheduledAt: { gte: startOfWeek, lt: endOfWeek },
            OR: [
              { status: { in: ["ACTIVE", "REQUIRES_INVOICING"] } },
              {
                status: "ARCHIVED",
                OR: [
                  { completedAt: { not: null } },
                  { consolidatedInvoiceId: { not: null } },
                  { invoice: { is: { status: { not: "ARCHIVED" } } } },
                ],
              },
            ],
          },
          include: { lineItems: true },
        })
      : Promise.resolve([]),
    seePerformance
      ? prisma.payment.findMany({
          where: { companyId, paidAt: { gte: startOfMonth } },
          select: { amount: true, paidAt: true },
        })
      : Promise.resolve([]),
    isManager(actor.role)
      ? loadGetStarted(companyId)
      : Promise.resolve(null),
    // Who's clocked in right now (owners/admins) — open time entries. The
    // card is Pro (timesheets): an empty list hides it when the gate is up.
    isManager(actor.role) && timesheetsAllowed
      ? prisma.timeEntry.findMany({
          where: { companyId, endedAt: null },
          include: {
            user: { select: { name: true } },
            job: { select: { id: true, title: true, address: true } },
          },
          orderBy: { startedAt: "asc" },
        })
      : Promise.resolve([]),
    // Completed per-visit-series work waiting in the Ready-to-bill queue
    seeMoney
      ? prisma.job.findMany({
          where: {
            companyId,
            completedAt: { not: null },
            invoice: { is: null },
            consolidatedInvoiceId: null,
            subscription: { is: { billPerVisit: true, status: { not: "CANCELLED" } } },
          },
          select: { subscription: { select: { unitPrice: true, quantity: true } } },
        })
      : Promise.resolve([]),
    // The "Up next" hero's action row needs the On-My-Way template context
    prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, timezone: true, onMyWayTemplate: true, arrivalWindowMinutes: true },
    }),
    // My open clock entry, wherever it is — drives the hero's clocked-in state
    prisma.timeEntry.findFirst({
      where: { userId: actor.id, endedAt: null },
      select: { id: true, startedAt: true, jobId: true },
    }),
    // New leads = cards waiting in the Leads board's first column (the same
    // rule as the sidebar badge); before the board exists, unstaged leads.
    sell
      ? prisma.pipelineStage
          .findFirst({ where: { companyId, isConverted: false }, orderBy: { sortOrder: "asc" }, select: { id: true } })
          .then((first) =>
            prisma.contact.count({
              where: {
                companyId,
                ...contactScope(actor),
                ...(first ? { pipelineStageId: first.id } : { status: "LEAD", pipelineStageId: null }),
              },
            })
          )
      : Promise.resolve(0),
    // My open tasks: due today join Today, overdue join Needs you
    dashboardTasks(actor, tz, now),
    // Square connected but no bank account to pay out to (managers): the
    // stored answer only — nothing here calls Square (PayoutNudge.tsx)
    isManager(actor.role)
      ? prisma.squareConnection
          .findUnique({ where: { companyId }, select: { payoutStatus: true } })
          .then((c) => c?.payoutStatus === "NONE")
      : Promise.resolve(false),
  ]);
  const todayTasks = taskLists.today;
  const overdueTasks = taskLists.overdue;
  // The Get started checklist: managers only, gone once hidden or complete
  const showSetupCard = getStarted != null && !getStarted.complete;

  const receivableTotal = receivables.reduce((s, inv) => s + invoiceBalance(inv), 0);
  const receivableClients = new Set(receivables.map((i) => i.contactId).filter(Boolean)).size;
  // Who owes: one circle per client, biggest balance first (money picture)
  const owingMap = new Map<string, { id: string; name: string; amount: number }>();
  for (const inv of receivables) {
    const bal = invoiceBalance(inv);
    if (bal <= 0 || !inv.contact) continue;
    const cur = owingMap.get(inv.contact.id) ?? {
      id: inv.contact.id,
      name: `${inv.contact.firstName} ${inv.contact.lastName}`.trim() || "Client",
      amount: 0,
    };
    cur.amount += bal;
    owingMap.set(cur.id, cur);
  }
  const owingAll = [...owingMap.values()].sort((a, b) => b.amount - a.amount);
  const pastDueOwed = receivables.filter((i) => i.status === "PAST_DUE" && invoiceBalance(i) > 0).length;
  // Last month's takings by day, for the faint pace line behind this month
  const lastMonthPayments = seePerformance
    ? await prisma.payment.findMany({
        where: { companyId, paidAt: { gte: zonedMidnight(tz, local.y, local.m - 1, 1), lt: startOfMonth } },
        select: { amount: true, paidAt: true },
      })
    : [];
  // Clear-day band (desktop): what's next on the books after today
  const nextOnBooks = await prisma.job.findFirst({
        where: { companyId, ...jScope, status: "ACTIVE", scheduledAt: { gte: endOfDay } },
        orderBy: { scheduledAt: "asc" },
        select: { id: true, title: true, scheduledAt: true, scheduledAnytime: true, contact: { select: { firstName: true, lastName: true } } },
      });
  const weekRevenue = upcomingJobsWeek.reduce(
    (s, j) => s + j.lineItems.reduce((t, li) => t + Number(li.total), 0),
    0
  );
  // Daily takings, 1st of the month → today (the money picture)
  const dailyRevenue = Array.from({ length: local.d }, () => 0);
  for (const p of monthPayments) {
    const day = zonedParts(tz, new Date(p.paidAt)).d - 1;
    if (day >= 0 && day < dailyRevenue.length) dailyRevenue[day] += Number(p.amount);
  }
  // The money picture's month: every day of it, today's index, last month's pace
  const daysInMonth = new Date(Date.UTC(local.y, local.m, 0)).getUTCDate();
  const monthShortName = now.toLocaleDateString("en-US", { month: "short", timeZone: tz });
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => ({
    label: `${monthShortName} ${i + 1}`,
    amount: i < dailyRevenue.length ? dailyRevenue[i] : 0,
  }));
  const lastMonthDays = new Date(Date.UTC(local.y, local.m - 1, 0)).getUTCDate();
  const lastMonthDaily = Array.from({ length: lastMonthDays }, () => 0);
  for (const p of lastMonthPayments) {
    const day = zonedParts(tz, new Date(p.paidAt)).d - 1;
    if (day >= 0 && day < lastMonthDaily.length) lastMonthDaily[day] += Number(p.amount);
  }
  // Booked this week, Sunday → Saturday, as seven bars
  const weekBooked = Array.from({ length: 7 }, (_, i) => {
    const d = zonedParts(tz, zonedMidnight(tz, local.y, local.m, local.d - local.weekday + i));
    const key = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    return {
      key,
      dow: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i],
      amount: 0,
      jobs: 0,
      today: i === local.weekday,
      past: i < local.weekday,
      href: `/app/schedule?view=day&date=${key}`,
    };
  });
  for (const j of upcomingJobsWeek) {
    if (!j.scheduledAt) continue;
    const wd = zonedParts(tz, new Date(j.scheduledAt)).weekday;
    weekBooked[wd].amount += j.lineItems.reduce((t, li) => t + Number(li.total), 0);
    weekBooked[wd].jobs += 1;
  }

  // "Needs you" — the same lifecycle counts, but reframed as a prioritized
  // to-do list with an action verb. Only items with something waiting render,
  // so a quiet day reads calm instead of showing a wall of zeros. Urgent
  // (money overdue) sorts first.
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
  const readyToBillTotal = readyToBill.reduce(
    (s, j) => s + (j.subscription ? Number(j.subscription.unitPrice) * Number(j.subscription.quantity) : 0),
    0
  );
  const needs = [
    {
      // Billing the queue is POST /api/app/subscriptions/bill-ready — manager-only
      show: isManager(actor.role),
      count: readyToBill.length,
      icon: Repeat,
      hue: SECTION_HUES.subscriptions,
      title: plural(readyToBill.length, "Visit ready to bill", "Visits ready to bill"),
      action: `Bill ${money(readyToBillTotal)} in one click`,
      href: "/app/subscriptions",
      urgent: false,
    },
    {
      show: sell,
      count: needsApprovalRequests,
      icon: CalendarCheck,
      hue: SECTION_HUES.requests,
      title: plural(needsApprovalRequests, "Booking to approve", "Bookings to approve"),
      action: "Accept or decline",
      href: "/app/requests?status=NEEDS_APPROVAL",
      urgent: true,
    },
    {
      show: seeMoney,
      count: pastDueInvoices,
      icon: Receipt,
      hue: SECTION_HUES.invoices,
      title: plural(pastDueInvoices, "Past-due invoice", "Past-due invoices"),
      action: "Send a reminder",
      href: "/app/invoices?status=PAST_DUE",
      urgent: true,
    },
    {
      show: true,
      count: overdueTasks.length,
      icon: ListChecks,
      hue: SECTION_HUES.jobs,
      title: plural(overdueTasks.length, "Overdue task", "Overdue tasks"),
      action: overdueTasks.length === 1 ? overdueTasks[0].title : "Finish or reschedule",
      href: "/app/tasks",
      urgent: true,
    },
    {
      show: sell,
      count: newLeads,
      icon: SquareKanban,
      hue: SECTION_HUES.leads,
      title: plural(newLeads, "New lead", "New leads"),
      action: "Reach out",
      href: "/app/leads",
      urgent: false,
    },
    {
      show: sell,
      count: newRequests,
      icon: Inbox,
      hue: SECTION_HUES.requests,
      title: plural(newRequests, "New request", "New requests"),
      action: "Review & send a quote",
      href: "/app/requests?status=NEW",
      urgent: false,
    },
    {
      show: sell,
      count: changesRequestedQuotes,
      icon: FileText,
      hue: SECTION_HUES.quotes,
      title: "Changes requested",
      action: "Update the quote",
      href: "/app/quotes?status=CHANGES_REQUESTED",
      urgent: false,
    },
    {
      show: sell,
      count: approvedQuotes,
      icon: FileText,
      hue: SECTION_HUES.quotes,
      title: plural(approvedQuotes, "Approved quote", "Approved quotes"),
      action: "Convert to a job",
      href: "/app/quotes?status=APPROVED",
      urgent: false,
    },
    {
      show: seeMoney,
      count: requiresInvoicingJobs,
      icon: Briefcase,
      hue: SECTION_HUES.jobs,
      title: plural(requiresInvoicingJobs, "Job ready to invoice", "Jobs ready to invoice"),
      action: "Send the invoice",
      href: "/app/jobs?status=REQUIRES_INVOICING",
      urgent: false,
    },
    {
      show: true,
      count: unscheduledJobs,
      icon: CalendarPlus,
      hue: SECTION_HUES.schedule,
      title: plural(unscheduledJobs, "Unscheduled job", "Unscheduled jobs"),
      action: "Put it on the calendar",
      href: "/app/jobs?status=ACTIVE&unscheduled=1",
      urgent: false,
    },
    {
      show: sell,
      count: draftQuotes,
      icon: FileText,
      hue: SECTION_HUES.quotes,
      title: plural(draftQuotes, "Draft quote", "Draft quotes"),
      action: "Finish & send",
      href: "/app/quotes?status=DRAFT",
      urgent: false,
      minor: true,
    },
    {
      show: seeMoney,
      count: draftInvoices,
      icon: Receipt,
      hue: SECTION_HUES.invoices,
      title: plural(draftInvoices, "Draft invoice", "Draft invoices"),
      action: "Finish & send",
      href: "/app/invoices?status=DRAFT",
      urgent: false,
      minor: true,
    },
  ].filter((n) => n.show && n.count > 0);

  // Phones show only what's worth acting on from the couch: the top four,
  // urgency-ordered, drafts left to their list pages. Desktop keeps the
  // full grid.

  // One sorted "today" list: jobs + sales appointments
  // Compact ledger time ("10:00a") — fits the rail column without wrapping
  const fmtTime = (d: Date) =>
    d
      .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })
      .replace(" AM", "a")
      .replace(" PM", "p");
  const todayItems = [
    ...todayVisits.map((job) => ({
      id: `j-${job.id}`,
      href: `/app/jobs/${job.id}`,
      apptType: null as string | null,
      meetingLink: null as string | null,
      time:
        job.scheduledAt && !job.scheduledAnytime ? fmtTime(new Date(job.scheduledAt)) : "Anytime",
      primary: `${job.contact.firstName} ${job.contact.lastName} — ${job.title}`,
      detail: job.assignments.map((a) => a.user.name).join(", ") || null,
      // Phone card splits the line: the JOB leads, the client supports
      title: job.title,
      sub: [
        `${job.contact.firstName} ${job.contact.lastName}`,
        job.assignments.map((a) => a.user.name).join(", ") || null,
      ]
        .filter(Boolean)
        .join(" · "),
      // The hero cares about WHERE — client + street beats assignee names
      heroSub: [
        `${job.contact.firstName} ${job.contact.lastName}`,
        job.address || job.contact.address,
      ]
        .filter(Boolean)
        .join(" · "),
      value: job.lineItems.reduce((s, li) => s + Number(li.total), 0),
      sort: job.scheduledAnytime ? 0 : new Date(job.scheduledAt!).getTime(),
      // Swipe actions on the timeline rows
      phone: job.contact.phone,
      contactId: job.contact.id,
      contactName: `${job.contact.firstName} ${job.contact.lastName}`.trim(),
      address: job.address ?? job.contact.address,
    })),
    ...todayAppointments.map((a) => ({
      id: `a-${a.id}`,
      href: `/app/appointments/${a.id}`,
      apptType: a.type as string | null,
      meetingLink: a.type === "VIDEO_CALL" ? a.meetingLink : null,
      time: a.scheduledAnytime ? "Anytime" : fmtTime(new Date(a.scheduledAt)),
      primary: `${a.contact.firstName} ${a.contact.lastName} — ${a.title}`,
      detail: [
        appointmentTypeLabel[a.type],
        a.assignedTo?.name ? `${a.assignedTo.name}${a._count.extraAssignees ? ` +${a._count.extraAssignees}` : ""}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      title: a.title,
      sub: [`${a.contact.firstName} ${a.contact.lastName}`, appointmentTypeLabel[a.type]]
        .filter(Boolean)
        .join(" · "),
      heroSub: [`${a.contact.firstName} ${a.contact.lastName}`, appointmentTypeLabel[a.type]]
        .filter(Boolean)
        .join(" · "),
      value: 0,
      sort: a.scheduledAnytime ? 0 : new Date(a.scheduledAt).getTime(),
      phone: a.contact.phone,
      contactId: a.contact.id,
      contactName: `${a.contact.firstName} ${a.contact.lastName}`.trim(),
      // Where the meeting IS — the appointment's own address first (a job
      // site, a coffee shop), the client's home only as the fallback
      address: a.type === "IN_PERSON" ? (a.address ?? a.contact.address) : null,
    })),
  ].sort((x, y) => x.sort - y.sort);

  // The phone hero: the job I'm CLOCKED INTO if it's on today's list (mid-job,
  // its start time has passed — it would otherwise fall out of the hero right
  // when the wrap-up actions matter most), else the first stop that hasn't
  // passed yet (anytime jobs count — they're still work owed today).
  // Everything else lists under Today, including finished stops, so the day
  // keeps its shape.
  const nowT = now.getTime();
  const clockedHero = myOpenEntry?.jobId
    ? (todayItems.find((i) => i.id === `j-${myOpenEntry.jobId}`) ?? null)
    : null;
  const upNext =
    clockedHero ?? todayItems.find((i) => i.sort === 0 || i.sort >= nowT) ?? null;
  const laterToday = todayItems.filter((i) => i !== upNext);

  // The Today count names what the day actually holds — "2 appointments",
  // "3 jobs", or both spelled out — never a generic "stop": a sales call or
  // an estimate visit isn't a stop on a route.
  const todayAppts = todayItems.filter((i) => i.apptType).length;
  const todayJobs = todayItems.length - todayAppts;
  const onlyKind = upNext?.apptType ? "appointment" : "job";

  // The today line: the work day as a ruler (7a–6p, stretched to fit any
  // early or late stop), each stop pinned at its time (DayLine.tsx).
  const hourOf = (ms: number) => {
    const p = zonedParts(tz, new Date(ms));
    return p.hour + p.minute / 60;
  };
  const timedSorts = todayItems.filter((i) => i.sort !== 0).map((i) => i.sort);
  const dayStartH = Math.max(0, Math.min(7, ...timedSorts.map((t) => Math.floor(hourOf(t)))));
  const dayEndH = Math.min(24, Math.max(18, ...timedSorts.map((t) => Math.ceil(hourOf(t) + 1))));
  const hourLabel = (h: number) => (h === 0 || h === 24 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);
  const dayTicks = Array.from({ length: dayEndH - dayStartH + 1 }, (_, k) => {
    const h = dayStartH + k;
    return { at: startOfDay.getTime() + h * 3_600_000, label: hourLabel(h), major: k % 3 === 0 };
  });
  const dayPins = todayItems.map((i) => ({
    id: i.id,
    href: i.href,
    name: i.contactName || "Client",
    title: i.title,
    time: i.time,
    at: i.sort === 0 ? null : i.sort,
    appt: !!i.apptType,
    next: i === upNext,
  }));
  const allDone = todayItems.length > 0 && !upNext;

  // Hero action-row context (see UpNextActions): the source records behind the
  // picked item, my clock state on it, and the rendered On-My-Way template.
  const upNextJob = upNext?.id.startsWith("j-")
    ? (todayVisits.find((j) => `j-${j.id}` === upNext.id) ?? null)
    : null;
  const upNextOmwMessage =
    upNextJob?.contact.phone && upNextJob.status === "ACTIVE"
      ? renderMessageTemplate(heroCompany?.onMyWayTemplate || DEFAULT_ON_MY_WAY_TEMPLATE, {
          firstName: upNextJob.contact.firstName,
          lastName: upNextJob.contact.lastName,
          companyName: heroCompany?.name,
          techName: actor.name,
          jobTitle: upNextJob.title,
          address: upNextJob.address ?? upNextJob.contact.address,
          time:
            upNextJob.scheduledAt && !upNextJob.scheduledAnytime
              ? arrivalTimeLabel(
                  heroCompany?.timezone ?? "America/Chicago",
                  upNextJob.scheduledAt,
                  resolveArrivalWindowMinutes(
                    upNextJob.arrivalWindowMinutes,
                    heroCompany?.arrivalWindowMinutes
                  )
                )
              : "",
          // Filled at tap-time by the action row (lib/messaging.ts fillEta)
          eta: "{{eta}}",
        })
      : null;

  const firstName = actor.name?.split(" ")[0] ?? "there";
  const hour = local.hour;
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // ── Design system (components/ds, app/ds.css) ─────────────────────────────
  // Desktop and phone are two trees built from the same pieces below: the
  // phone is the iOS-style simple version (hero → numbers → today → needs),
  // the desktop a two-column board. Explanations live in InfoTips.
  const dateLine = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz });
  const rise = (i: number) => ({ "--ds-i": i }) as React.CSSProperties;

  // Up next (phones): the stop you're on or heading to, in the open style —
  // its time large, then Navigate / Call / On my way / Clock in. The desk
  // reads the whole day in its table instead.
  const upNextEl = upNext && (
    <OpenSection
      title={upNext === clockedHero ? "On the job" : upNext.apptType ? "Up next · appointment" : "Up next"}
      className="hp-next lg:hidden"
    >
      <Link prefetch={false} href={upNext.href} className="hp-next-link">
        <span className="hp-next-top">
          <span className="hp-next-time">{upNext.time === "Anytime" ? "Anytime today" : upNext.time}</span>
          {seePrices && upNext.value > 0 && <span className="hp-next-value ds-num">{money(upNext.value)}</span>}
        </span>
        <span className="hp-next-title">{upNext.title}</span>
        <span className="hp-next-sub">{upNext.heroSub}</span>
      </Link>
      <div className="hp-next-acts">
        <UpNextActions
          kind={upNextJob ? "job" : "appointment"}
          id={upNextJob ? upNextJob.id : upNext.id.slice(2)}
          phone={upNext.phone ?? null}
          address={upNext.address ?? null}
          omwMessage={upNextOmwMessage}
          omwSentAt={upNextJob?.onMyWaySentAt?.toISOString() ?? null}
          clockEntry={
            upNextJob && myOpenEntry?.jobId === upNextJob.id
              ? { id: myOpenEntry.id, startedAt: myOpenEntry.startedAt.toISOString() }
              : null
          }
          canClock={upNextJob?.status === "ACTIVE" && actor.role !== "SALES" && timesheetsAllowed}
          apptType={upNext.apptType}
          meetingLink={upNext.meetingLink}
        />
      </div>
    </OpenSection>
  );

  // The caught-up line varies per visit (lib/empty-lines.ts)
  const caughtUp = dealLine("caught-up");

  const needsInfo =
    "Work waiting on you, most urgent first: past-due invoices, bookings to approve and overdue tasks lead the list. Tap a row to jump straight to it.";

  const footer = (
    <>
    {/* The Get started switch (moved from Settings, 2026-11-21): once the
        checklist is hidden, managers can bring it back from here. */}
    {isManager(actor.role) && !getStarted && (
      <div className="mx-auto mt-10 max-w-xl">
        <GetStartedRow />
      </div>
    )}
    <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-[color:var(--ds-line)] pt-5 text-center">
      <Link prefetch={false} href="/app/support" className="ds-small inline-flex items-center gap-1.5 hover:text-[color:var(--ds-primary)]">
        <LifeBuoy size={12} />
        Found a bug or have an idea? Tell us
      </Link>
    </div>
    </>
  );

  const greetingTitle = (
    <>
      {greeting}, <span className="bb-acc" style={{ color: "var(--ds-primary)" }}>{firstName}</span>
    </>
  );
  const pageInfo =
    "Your day at a glance: what's next, money in and owed, what's waiting on you, and who's on the clock. Everything follows your company's time zone.";

  // ── Desktop figures for the branded header page ──
  const needsTotal = needs.reduce((s, n) => s + n.count, 0);
  const monthCollected = dailyRevenue.reduce((s, v) => s + v, 0);
  const monthMax = Math.max(1, ...monthDays.map((d) => d.amount));
  // Pace: this month so far against the same days of last month
  const lastSameDays = lastMonthDaily.slice(0, local.d).reduce((s, v) => s + v, 0);
  const paceDelta = lastSameDays > 0 ? Math.round(((monthCollected - lastSameDays) / lastSameDays) * 100) : null;
  const todayCountLine = [
    todayJobs > 0 ? `${todayJobs} ${plural(todayJobs, "job", "jobs")}` : null,
    todayAppts > 0 ? `${todayAppts} ${plural(todayAppts, "appointment", "appointments")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  // A stop's state for the Today table: done, on the clock now, or still to come
  const clockedJobIds = new Set(
    [...onClock.map((e) => e.job?.id), myOpenEntry?.jobId].filter((x): x is string => !!x)
  );
  const todayStatus = (item: (typeof todayItems)[number]): { label: string; tone: "good" | "secondary" | "neutral" } => {
    if (item.id.startsWith("j-")) {
      const job = todayVisits.find((j) => `j-${j.id}` === item.id);
      if (job?.completedAt || job?.status === "REQUIRES_INVOICING" || job?.status === "ARCHIVED") return { label: "Done", tone: "good" };
      if (job && clockedJobIds.has(job.id)) return { label: "On site", tone: "secondary" };
      if (item.sort !== 0 && item.sort < nowT) return { label: "Started", tone: "neutral" };
      return { label: "Scheduled", tone: "neutral" };
    }
    return { label: item.sort !== 0 && item.sort < nowT ? "Past" : appointmentTypeLabel[item.apptType as keyof typeof appointmentTypeLabel] ?? "Appointment", tone: "neutral" };
  };

  // The line under the greeting: the day's shape, a holiday heads-up or the
  // month so far, dealt per visit (lib/day-shape.ts) — Home says something new.
  const timedToday = todayItems.filter((i) => i.sort !== 0);
  const homeNotes = [
    dayShapeLine({
      stops: todayItems.length,
      jobs: todayJobs,
      firstTime: timedToday[0]?.time ?? null,
      lastTime: timedToday[timedToday.length - 1]?.time ?? null,
      allDone,
      waiting: needsTotal,
    }),
    holidayLine(local),
    seePerformance && monthCollected > 0
      ? `${money(monthCollected)} collected so far in ${now.toLocaleDateString("en-US", { month: "long", timeZone: tz })}.`
      : null,
  ].filter((n): n is string => !!n);
  const homeNote = homeNotes[Math.floor(Math.random() * homeNotes.length)] ?? null;

  return (
    <DsPage className="ios-grouped"
      band
      daypart={daypartOf(local.hour)}
      header={
          <PageHeader
            note={homeNote}
            heavy
            eyebrow={dateLine}
            title={greetingTitle}
            info={pageInfo}
            actions={
              <span className="flex gap-2">
                <Button href="/app/schedule" variant="outline" icon={CalendarDays}>
                  Schedule
                </Button>
                <Button href="/app/jobs/new" icon={Plus}>
                  New job
                </Button>
              </span>
            }
          />
      }
    >

      {/* ─────────────── One tree for every size (phones too, 2026-11-25) ───────────────
          The band carries the greeting; under it the page is open: what needs
          you beside the month's money, then today. Phones add Up next on top
          (app/ds-phone-home.css styles the phone sizes). */}
      <BandBody>
        {/* Talk to Atlas: the front door, first under the band (the example
            request is dealt here so the first paint already has it) */}
        <AtlasFrontDoor example={Math.floor(Math.random() * 1000)} />
        {(payoutNudge || (showSetupCard && getStarted)) && (
          <div className="flex flex-col gap-4">
            {payoutNudge && <PayoutNudge />}
            {showSetupCard && getStarted && <GetStartedCard data={getStarted} />}
          </div>
        )}
        <PushNudge />

        {upNextEl}

        <div className={seePerformance ? "bb-split" : ""}>
          <OpenSection
            title="Needs you"
            count={needsTotal > 0 ? needsTotal : undefined}
            info={needsInfo}
            data-tour="workflow"
            className="ds-rise"
            style={rise(1)}
          >
            {needs.length === 0 ? (
              <p className="flex items-center gap-2.5 py-5 text-[14.5px] font-medium">
                <CheckCircle2 size={18} className="shrink-0" style={{ color: "var(--ds-good)" }} />
                {caughtUp}
              </p>
            ) : (
              <div className="bb-rows">
                {needs.map((n, i) => (
                  <Link prefetch={false} key={n.href} href={n.href} className="bb-row bb-in" style={rise(i)}>
                    <span className={`bb-num ${n.urgent ? "is-bad" : ""}`}>{n.count}</span>
                    <span className="bb-row-main">
                      <span className="bb-row-title">{n.title}</span>
                    </span>
                    {n.urgent && <Chip tone="bad">Overdue</Chip>}
                    <span className="bb-go">
                      {n.action.length > 32 ? "Open" : n.action}
                      <ChevronRight size={15} strokeWidth={2.4} />
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </OpenSection>

          {seePerformance && (
            <OpenSection
              title="Money"
              info="Collected: card, bank and recorded payments this month, against the same days last month. Still owed: every sent invoice not yet paid in full."
              className="ds-rise"
              style={rise(2)}
            >
              <div className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="bb-label">Collected in {now.toLocaleDateString("en-US", { month: "long", timeZone: tz })}</span>
                  {paceDelta !== null && (
                    <span className="text-[12.5px] font-semibold" style={{ color: paceDelta >= 0 ? "var(--ds-good)" : "var(--ds-muted)" }}>
                      {paceDelta >= 0 ? "+" : ""}
                      {paceDelta}% vs. last month
                    </span>
                  )}
                </div>
                <p className="bb-big mt-1.5">{money(monthCollected)}</p>
                <div className="bb-bars mt-4" aria-hidden>
                  {monthDays.map((d, i) => (
                    <i
                      key={d.label}
                      className={i === local.d - 1 ? "is-today" : i >= local.d || d.amount <= 0 ? "is-empty" : ""}
                      style={{ height: `${d.amount > 0 ? Math.max(6, (d.amount / monthMax) * 100) : 4}%`, ...rise(i) }}
                      title={`${d.label}: ${money(d.amount)}`}
                    />
                  ))}
                </div>
              </div>
              <Link prefetch={false} href="/app/invoices" className="bb-row" style={{ minHeight: 64 }}>
                <span className="bb-row-main">
                  <span className="bb-label block">Still owed</span>
                  <span className="mt-0.5 block text-[22px] font-bold tracking-[-0.03em] text-[color:var(--ds-ink)]">
                    {money(receivableTotal)}
                  </span>
                </span>
                <span className="text-right">
                  {pastDueOwed > 0 ? (
                    <span className="block text-[12.5px] font-semibold" style={{ color: "var(--ds-bad)" }}>
                      {pastDueOwed} past due
                    </span>
                  ) : null}
                  <span className="ds-small block">
                    {Math.max(receivableClients, owingAll.length)} {plural(Math.max(receivableClients, owingAll.length), "client", "clients")}
                  </span>
                </span>
              </Link>
            </OpenSection>
          )}
        </div>

        <OpenSection
          title="Today"
          count={todayItems.length > 0 ? todayCountLine : undefined}
          data-tour="today"
          className="ds-rise"
          style={rise(3)}
          aside={
            <Link prefetch={false} href="/app/schedule" className="bb-go">
              Open schedule
              <ChevronRight size={15} strokeWidth={2.4} />
            </Link>
          }
        >
          {todayItems.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-4 py-5">
              <p className="ds-small">
                {nextOnBooks?.scheduledAt ? (
                  <>
                    Nothing on the books today. Next up:{" "}
                    <Link prefetch={false} href={`/app/jobs/${nextOnBooks.id}`} className="ds-link">
                      {nextOnBooks.scheduledAt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz })}
                      {nextOnBooks.scheduledAnytime ? "" : ` · ${fmtTime(nextOnBooks.scheduledAt)}`} · {nextOnBooks.title}
                    </Link>
                  </>
                ) : (
                  "Nothing on the books today, and nothing scheduled ahead yet."
                )}
              </p>
              <Button href="/app/jobs/new" icon={Plus} size="sm">
                Schedule a job
              </Button>
            </div>
          ) : (
            <>
            <div className="bb-rows hp-today lg:hidden">
              {todayItems.map((item, i) => {
                const st = todayStatus(item);
                return (
                  <Link prefetch={false} key={item.id} href={item.href} className="bb-row bb-in" style={rise(i)}>
                    <span className="hp-today-time ds-num">{item.time}</span>
                    <span className="bb-row-main">
                      <span className="bb-row-title">{item.contactName || item.title}</span>
                      <span className="bb-row-sub">{item.contactName ? item.title : item.detail || "Unassigned"}</span>
                    </span>
                    <Chip tone={st.tone}>{st.label}</Chip>
                  </Link>
                );
              })}
            </div>
            <table className="bb-table hidden lg:table">
              <thead>
                <tr>
                  <th style={{ width: 84 }}>Time</th>
                  <th>Client</th>
                  <th>Work</th>
                  <th>Who</th>
                  {seePrices && <th className="r">Amount</th>}
                  <th className="r" style={{ width: 120 }}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {todayItems.map((item, i) => {
                  const st = todayStatus(item);
                  return (
                    <tr key={item.id} className="bb-in" style={rise(i)}>
                      <td className="bb-strong">
                        <Link prefetch={false} href={item.href} className="block">
                          {item.time}
                        </Link>
                      </td>
                      <td className="bb-strong">
                        <Link prefetch={false} href={item.href} className="block truncate">
                          {item.contactName || "Client"}
                        </Link>
                      </td>
                      <td className="max-w-[280px] truncate text-[color:var(--ds-ink-2)]">{item.title}</td>
                      <td className="max-w-[180px] truncate text-[color:var(--ds-muted)]">
                        {item.apptType ? item.detail : item.detail || "Unassigned"}
                      </td>
                      {seePrices && (
                        <td className="r ds-num">{item.value > 0 ? money(item.value) : <span className="text-[color:var(--ds-faint)]">—</span>}</td>
                      )}
                      <td className="r">
                        <Chip tone={st.tone}>{st.label}</Chip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </>
          )}
          {todayTasks.length > 0 && (
            <div className="mt-4">
              <DashboardTasks tasks={todayTasks} phone={false} />
            </div>
          )}
        </OpenSection>

        {isManager(actor.role) && onClock.length > 0 && (
          <OpenSection
            title="On the clock"
            count={onClock.length}
            info="Everyone clocked in right now, with how long they've been on and where they clocked in."
            aside={
              <>
                <Link prefetch={false} href="/app/team-map" className="bb-go">
                  Team map
                </Link>
                <Link prefetch={false} href="/app/timesheets" className="bb-go">
                  Timesheets
                </Link>
              </>
            }
          >
            <div className="bb-rows">
              {onClock.map((e) => (
                <Link prefetch={false} key={e.id} href={e.job ? `/app/jobs/${e.job.id}` : "/app/timesheets"} className="bb-row">
                  <Monogram name={e.user.name ?? "Teammate"} size={30} />
                  <span className="bb-row-main">
                    <span className="bb-row-title">{e.user.name}</span>
                    <span className="bb-row-sub">{e.job ? e.job.title : "General time"}</span>
                  </span>
                  <span className="text-right">
                    <span className="ds-num block text-[13.5px] font-semibold">{formatDuration(now.getTime() - e.startedAt.getTime())}</span>
                    <span className="ds-small block">
                      since {e.startedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </OpenSection>
        )}

        {footer}
      </BandBody>
    </DsPage>
  );
}
