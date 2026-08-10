import { prisma } from "@/lib/db";
import Link from "next/link";
import { Plus, ChevronRight, CalendarClock } from "lucide-react";
import PageTitle from "@/components/PageTitle";
import { SECTION_HUES } from "@/lib/section-colors";
import { shortDate } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import EmptyState from "@/components/EmptyState";
import Monogram from "@/components/Monogram";
import { requirePageActor, canSell, appointmentScope } from "@/lib/permissions";

/**
 * Appointments finally get an index — they were only reachable through the
 * schedule or a contact page. Upcoming first (soonest at the top), then the
 * recent past for reference.
 */
export default async function AppointmentsPage() {
  const actor = await requirePageActor((a) => canSell(a.role));
  const companyId = actor.companyId;
  const now = new Date();

  const [upcoming, past] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        companyId,
        ...appointmentScope(actor),
        status: "SCHEDULED",
        scheduledAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
      },
      orderBy: { scheduledAt: "asc" },
      take: 100,
      include: {
        contact: { select: { firstName: true, lastName: true } },
        assignedTo: { select: { name: true } },
      },
    }),
    prisma.appointment.findMany({
      where: {
        companyId,
        ...appointmentScope(actor),
        OR: [
          { status: { in: ["COMPLETED", "CANCELLED", "NO_SHOW"] } },
          { status: "SCHEDULED", scheduledAt: { lt: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } },
        ],
      },
      orderBy: { scheduledAt: "desc" },
      take: 50,
      include: {
        contact: { select: { firstName: true, lastName: true } },
        assignedTo: { select: { name: true } },
      },
    }),
  ]);

  const typeLabel: Record<string, string> = {
    PHONE_CALL: "Phone call",
    VIDEO_CALL: "Video call",
    IN_PERSON: "In person",
  };

  const section = (title: string, list: typeof upcoming) =>
    list.length > 0 && (
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</h3>
        <div className="card-ledger overflow-hidden divide-y divide-gray-100">
          {list.map((a) => (
            <Link
              key={a.id}
              href={`/app/appointments/${a.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <Monogram name={`${a.contact.firstName} ${a.contact.lastName}`} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {a.title}
                    {a.appointmentNumber ? (
                      <span className="ml-1.5 text-xs font-normal text-gray-400">
                        #{a.appointmentNumber}
                      </span>
                    ) : null}
                  </p>
                  {a.tentative && <span className="stamp text-amber-700">To approve</span>}
                </div>
                <p className="truncate text-xs text-gray-500 mt-0.5">
                  {a.contact.firstName} {a.contact.lastName} · {typeLabel[a.type] ?? a.type} ·{" "}
                  {shortDate(a.scheduledAt)}
                  {!a.scheduledAnytime &&
                    ` ${a.scheduledAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
                  {a.assignedTo?.name ? ` · ${a.assignedTo.name}` : ""}
                </p>
              </div>
              <StatusChip kind="appointment" status={a.status} className="shrink-0 hidden sm:inline-flex" />
              <ChevronRight size={14} className="text-gray-300 shrink-0" />
            </Link>
          ))}
        </div>
      </div>
    );

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-y-3 mb-4 lg:mb-6">
        <PageTitle section="schedule" icon={CalendarClock}>
          Appointments
        </PageTitle>
        <Link
          href="/app/appointments/new"
          className="hidden lg:flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors"
        >
          <Plus size={15} />
          New Appointment
        </Link>
      </div>

      {upcoming.length === 0 && past.length === 0 ? (
        <EmptyState
          art="schedule"
          hue={SECTION_HUES.schedule}
          title="No appointments yet"
          body="Book estimates and sales calls — they show here and on the schedule."
          actionHref="/app/appointments/new"
          actionLabel="Book an Appointment"
        />
      ) : (
        <>
          {section("Upcoming", upcoming)}
          {section("Past", past)}
        </>
      )}
    </div>
  );
}
