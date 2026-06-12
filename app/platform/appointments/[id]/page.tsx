import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarDays, ExternalLink, Mail, MapPin, Phone, User, Video } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, isManager, appointmentScope } from "@/lib/permissions";
import { appointmentTypeLabel } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import AppointmentActions from "./AppointmentActions";

const typeIcons = { PHONE_CALL: Phone, VIDEO_CALL: Video, IN_PERSON: MapPin } as const;

export default async function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));

  const { id } = await params;
  const appt = await prisma.appointment.findFirst({
    where: { id, companyId: actor.companyId, ...appointmentScope(actor) },
    include: {
      contact: true,
      request: { select: { id: true, title: true } },
      assignedTo: { select: { name: true } },
    },
  });
  if (!appt) notFound();

  const TypeIcon = typeIcons[appt.type];
  const when = appt.scheduledAnytime
    ? `${new Date(appt.scheduledAt).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })} — Anytime`
    : `${new Date(appt.scheduledAt).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}${
        appt.scheduledEnd
          ? ` – ${new Date(appt.scheduledEnd).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
          : ""
      }`;

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/app/schedule" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <StatusChip kind="appointment" status={appt.status} />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">{appt.title}</h1>
          <p className="flex items-center gap-1.5 text-sm text-gray-500 mt-1">
            <TypeIcon size={14} className="text-blue-500" />
            {appointmentTypeLabel[appt.type]}
            <span className="text-gray-300">·</span>
            <Link href={`/app/contacts/${appt.contact.id}`} className="text-green-700 hover:underline">
              {appt.contact.firstName} {appt.contact.lastName}
            </Link>
          </p>
        </div>
        <AppointmentActions
          appointmentId={appt.id}
          status={appt.status}
          contactId={appt.contactId}
          requestId={appt.requestId}
          canDelete={isManager(actor.role)}
          scheduledAt={appt.scheduledAt.toISOString()}
          scheduledEnd={appt.scheduledEnd?.toISOString() ?? null}
          scheduledAnytime={appt.scheduledAnytime}
        />
      </div>

      <div className="card-ledger p-5 mb-5 space-y-3">
        <div className="flex items-start gap-3">
          <CalendarDays size={15} className="text-gray-400 mt-0.5 shrink-0" />
          <p className="text-sm text-gray-800">{when}</p>
        </div>
        {appt.type === "IN_PERSON" && appt.address && (
          <div className="flex items-start gap-3">
            <MapPin size={15} className="text-gray-400 mt-0.5 shrink-0" />
            <p className="text-sm text-gray-800">{appt.address}</p>
          </div>
        )}
        {appt.type === "VIDEO_CALL" && appt.meetingLink && (
          <div className="flex items-start gap-3">
            <Video size={15} className="text-gray-400 mt-0.5 shrink-0" />
            <a
              href={appt.meetingLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-green-700 hover:underline flex items-center gap-1"
            >
              Join meeting <ExternalLink size={12} />
            </a>
          </div>
        )}
        {appt.type === "PHONE_CALL" && appt.contact.phone && (
          <div className="flex items-start gap-3">
            <Phone size={15} className="text-gray-400 mt-0.5 shrink-0" />
            <a href={`tel:${appt.contact.phone}`} className="text-sm text-green-700 hover:underline">
              {appt.contact.phone}
            </a>
          </div>
        )}
        {appt.contact.email && (
          <div className="flex items-start gap-3">
            <Mail size={15} className="text-gray-400 mt-0.5 shrink-0" />
            <p className="text-sm text-gray-800">{appt.contact.email}</p>
          </div>
        )}
        {appt.assignedTo && (
          <div className="flex items-start gap-3">
            <User size={15} className="text-gray-400 mt-0.5 shrink-0" />
            <p className="text-sm text-gray-800">{appt.assignedTo.name}</p>
          </div>
        )}
        {appt.request && (
          <div className="pt-2 border-t border-gray-100 text-sm">
            <span className="text-xs uppercase font-semibold text-gray-400 block mb-0.5">From request</span>
            <Link href={`/app/requests/${appt.request.id}`} className="text-green-700 hover:underline">
              {appt.request.title}
            </Link>
          </div>
        )}
      </div>

      {appt.notes && (
        <div className="card-ledger p-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notes</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{appt.notes}</p>
        </div>
      )}
    </div>
  );
}
