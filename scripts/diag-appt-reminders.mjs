// Why did (or didn't) a client get an appointment reminder? Read-only: lists
// the last ~36 h of appointments with the reminder stamps and every gate the
// sweep checks (lib/reminders.ts runAppointmentReminders → lib/sms.ts).
//   node scripts/run-with-prod-db.mjs scripts/diag-appt-reminders.mjs [hours]
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const hours = Number(process.argv[2]) || 36;
const since = new Date(Date.now() - hours * 3600000);
const appts = await prisma.appointment.findMany({
  where: { scheduledAt: { gte: since } },
  orderBy: { scheduledAt: "asc" },
  take: 40,
  select: {
    id: true, title: true, type: true, status: true, tentative: true, scheduledAnytime: true, remindClient: true,
    createdAt: true, scheduledAt: true, reminderDaySentAt: true, reminderHourSentAt: true, techHeadsUpSentAt: true, assignedToId: true,
    contact: { select: { firstName: true, phone: true, email: true, smsOptOut: true, smsDisabled: true } },
    company: {
      select: {
        name: true, timezone: true, smsAcknowledgedAt: true, lineNumber: true, suspendedAt: true,
        messagingRegistration: { select: { status: true, kind: true } },
      },
    },
  },
});
const iso = (d) => (d ? d.toISOString() : "-");
for (const a of appts) {
  const lead = Math.round((a.scheduledAt - a.createdAt) / 60000);
  console.log(`\n== ${a.company.name} · "${a.title}" ${a.type} ${a.status} tentative=${a.tentative} anytime=${a.scheduledAnytime} remindClient=${a.remindClient}`);
  console.log(`   created=${iso(a.createdAt)} scheduled=${iso(a.scheduledAt)} lead=${lead} min`);
  console.log(`   daySent=${iso(a.reminderDaySentAt)} hourSent=${iso(a.reminderHourSentAt)} headsUpPush=${iso(a.techHeadsUpSentAt)} assigned=${a.assignedToId ? "yes" : "no"}`);
  console.log(`   contact=${a.contact.firstName} phone=${a.contact.phone ? "set" : "NONE"} email=${a.contact.email ? "set" : "NONE"} smsOptOut=${a.contact.smsOptOut} smsDisabled=${a.contact.smsDisabled}`);
  const reg = a.company.messagingRegistration;
  console.log(`   company smsAcknowledged=${a.company.smsAcknowledgedAt ? "yes" : "NO"} line=${a.company.lineNumber ?? "NONE"} registration=${reg ? `${reg.status}/${reg.kind}` : "NONE"} tz=${a.company.timezone} suspended=${a.company.suspendedAt ? "YES" : "no"}`);
}
if (appts.length === 0) console.log(`No appointments scheduled in the last ${hours} h.`);
await prisma.$disconnect();
