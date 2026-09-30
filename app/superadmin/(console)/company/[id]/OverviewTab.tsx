import { CheckCircle2, Circle } from "lucide-react";
import { prisma } from "@/lib/db";
import { Card, SectionTitle, Stat } from "@/components/ds";
import { fullDate, mb, shortDate, usd } from "@/lib/console-format";
import { relativeSeen } from "@/lib/presence";
import type { CompanyCore } from "./shared";

/**
 * Overview: the numbers that say how much of WorkBench this business has
 * taken up, the activation checklist (the one signal for "are they getting
 * value"), what happened lately, and what they told us when they applied.
 */
export default async function OverviewTab({ company }: { company: CompanyCore }) {
  const id = company.id;
  const earliestArgs = { where: { companyId: id }, orderBy: { createdAt: "asc" as const }, select: { createdAt: true } };

  const [contacts, jobs, quotes, invoices, payments, collected, storage, bookingTypes, aiUse, firstContact, firstQuote, firstInvoice, firstPayment, activity] =
    await Promise.all([
      prisma.contact.count({ where: { companyId: id } }),
      prisma.job.count({ where: { companyId: id } }),
      prisma.quote.count({ where: { companyId: id } }),
      prisma.invoice.count({ where: { companyId: id } }),
      prisma.payment.count({ where: { companyId: id } }),
      prisma.payment.aggregate({ where: { companyId: id }, _sum: { amount: true } }),
      prisma.companyUsageDaily.findFirst({ where: { companyId: id, storageBytes: { not: null } }, orderBy: { day: "desc" }, select: { storageBytes: true } }),
      prisma.bookingType.count({ where: { companyId: id } }),
      prisma.companyUsageDaily.aggregate({ where: { companyId: id }, _sum: { aiCalls: true } }),
      prisma.contact.findFirst(earliestArgs),
      prisma.quote.findFirst(earliestArgs),
      prisma.invoice.findFirst(earliestArgs),
      prisma.payment.findFirst({ where: { companyId: id }, orderBy: { paidAt: "asc" }, select: { paidAt: true } }),
      prisma.activityLog.findMany({ where: { companyId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
    ]);

  const activeUsers = company.users.filter((u) => u.isActive);
  const onPhone = company.users.some((u) => u.lastSeenVia === "ios" || u.lastSeenVia === "android" || u.pushSubscriptions.some((s) => s.platform !== "web"));
  const teamInvited = activeUsers.length > 1;
  const lineOn = Boolean(company.lineNumber && !company.lineNumber.startsWith("pending:"));

  const steps: { label: string; done: boolean; at?: Date | null; hint: string }[] = [
    { label: "Finished setup", done: Boolean(company.setupWizardAt), at: company.setupWizardAt, hint: "The setup wizard after sign-up" },
    { label: "Added a client", done: Boolean(firstContact), at: firstContact?.createdAt, hint: "First contact created" },
    { label: "Sent a quote", done: Boolean(firstQuote), at: firstQuote?.createdAt, hint: "First quote created" },
    { label: "Sent an invoice", done: Boolean(firstInvoice), at: firstInvoice?.createdAt, hint: "First invoice created" },
    { label: "Took a payment", done: Boolean(firstPayment), at: firstPayment?.paidAt, hint: "First payment recorded, any method" },
    { label: "Invited the team", done: teamInvited, hint: "More than one active user" },
    { label: "Booking page live", done: bookingTypes > 0 || Boolean(company.hubBookingTypeId), hint: "At least one booking type" },
    { label: "Business line", done: lineOn, at: company.lineProvisionedAt, hint: "A WorkBench number for calls and texts" },
    { label: "Used Atlas", done: (aiUse._sum.aiCalls ?? 0) > 0, hint: "Any Atlas turn" },
    { label: "Installed the app", done: onPhone, hint: "Seen on iPhone or Android, or push enabled there" },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  const answers: [string, string | null][] = [
    ["Heard about us", company.referralSource],
    ["Team size", company.teamSize],
    ["Using today", company.currentSoftware],
    ["Top priority", company.topPriority],
  ];
  const hasAnswers = answers.some(([, v]) => v);

  const rise = (i: number) => ({ "--ds-i": i }) as React.CSSProperties;

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat className="ds-rise" style={rise(1)} label="Team" value={activeUsers.length} foot={`${company.users.length - activeUsers.length || "no"} deactivated`} href={`/superadmin/company/${id}?tab=team`} />
        <Stat className="ds-rise" style={rise(2)} label="Clients" value={contacts} foot="contacts" />
        <Stat className="ds-rise" style={rise(3)} label="Jobs" value={jobs} foot={`${quotes} quotes`} />
        <Stat className="ds-rise" style={rise(4)} label="Invoices" value={invoices} foot={`${payments} payments`} />
        <Stat className="ds-rise" style={rise(5)} label="Collected" value={usd(Math.round(Number(collected._sum.amount ?? 0) * 100))} foot="all time, all methods" href={`/superadmin/company/${id}?tab=money`} />
        <Stat className="ds-rise" style={rise(6)} label="Storage" value={mb(Number(storage?.storageBytes ?? 0))} foot="photos, logos, avatars" href={`/superadmin/company/${id}?tab=usage`} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div>
          <SectionTitle info="The steps a business takes as WorkBench becomes the way they work. Each one is read from their real records, so it is never out of date. A live account that stalls here is the one to call.">
            Activation <span className="ds-small ml-1 font-normal">{doneCount} of {steps.length}</span>
          </SectionTitle>
          <Card className="ds-divide ds-rise overflow-hidden" style={rise(7)}>
            {steps.map((s) => (
              <div key={s.label} className="ds-row">
                {s.done ? (
                  <CheckCircle2 size={18} className="shrink-0" style={{ color: "var(--ds-good)" }} aria-label="Done" />
                ) : (
                  <Circle size={18} className="shrink-0 text-[color:var(--ds-faint)]" aria-label="Not yet" />
                )}
                <span className="min-w-0 flex-1">
                  <span className={`block text-[14.5px] ${s.done ? "font-medium text-[color:var(--ds-ink)]" : "text-[color:var(--ds-ink-2)]"}`}>{s.label}</span>
                  <span className="ds-small block">{s.hint}</span>
                </span>
                {s.done && s.at && <span className="ds-small whitespace-nowrap">{shortDate(s.at)}</span>}
              </div>
            ))}
          </Card>

          {hasAnswers && (
            <>
              <SectionTitle className="mt-8" info="What they told us on the application or in setup.">
                From their application
              </SectionTitle>
              <Card className="p-5">
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[14px]">
                  {answers
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="ds-small whitespace-nowrap">{k}</dt>
                        <dd className="text-[color:var(--ds-ink)]">{v}</dd>
                      </div>
                    ))}
                </dl>
              </Card>
            </>
          )}
        </div>

        <div>
          <SectionTitle info="The last twenty things the activity log recorded for this account: status changes, payments, refunds, sends. Not every click — the events the app already keeps for the tenant's own history.">
            Recent activity
          </SectionTitle>
          <Card className="ds-divide ds-rise overflow-hidden" style={rise(8)}>
            {activity.length === 0 && <p className="ds-small px-6 py-9 text-center">Nothing logged yet.</p>}
            {activity.map((a) => (
              <div key={a.id} className="ds-row">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-[color:var(--ds-ink)]">
                    <span className="font-medium">{a.userName ?? "System"}</span> · {a.action.replace(/_/g, " ")} · {a.entityType}
                  </span>
                  {a.detail && <span className="ds-small block truncate">{a.detail}</span>}
                </span>
                <span className="ds-small whitespace-nowrap" title={fullDate(a.createdAt)}>
                  {relativeSeen(a.createdAt)}
                </span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}
