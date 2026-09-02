import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { companyMetaBySlug } from "@/lib/client-meta";
import { resolveScheduleAppearance } from "../../shell";
import ScheduleFrame from "../../ScheduleFrame";
import ManageBooking from "./ManageBooking";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return companyMetaBySlug(slug, "Your booking");
}

/** /book/[slug]/schedule/manage/[token] — reschedule or cancel from the email link. */
export default async function ManageBookingPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const [shell, appt] = await Promise.all([
    resolveScheduleAppearance(slug),
    prisma.appointment.findUnique({ where: { manageToken: token }, select: { id: true, company: { select: { slug: true } } } }),
  ]);
  if (!shell || !appt || appt.company.slug !== slug) notFound();
  return (
    <ScheduleFrame company={shell.company} appearance={shell.appearance} subtitle="Your booking">
      <ManageBooking token={token} appearance={shell.appearance} />
    </ScheduleFrame>
  );
}
