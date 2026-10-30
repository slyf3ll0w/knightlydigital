import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { sendEmail, jobReportEmail } from "@/lib/email";
import { sendSms, canText, companyCanSendSms, jobReportText } from "@/lib/sms";
import { checkFeature, featureAllowedFor } from "@/lib/plan-gate";
import { galleryPreviewFor } from "@/lib/gallery-preview";
import { PHOTO_VIEW_SELECT, toPhotoView } from "@/lib/photos";
import { REPORT_NOTE_MAX, reportPath, reportPhotos, reportSummaryLine, type PhotoPair, type PhotoView } from "@/lib/photos-shared";
import type { SendChannels } from "@/lib/send-channels";

/**
 * Work completed report (Gallery plan, phase B) — the client-facing record
 * of a finished job: who came, when, the before/after pairs and the other
 * photos the client may see, the checklist as it was closed out, the sign-off,
 * and a note from the crew. One loader feeds the hub page
 * (/hub/[token]/work/[jobId]), the PDF (lib/pdf.tsx buildJobReportDocument)
 * and the email / text that carry the link.
 *
 * Gate: Gallery (checkFeature "gallery") behind the preview switch.
 */

export const REPORT_SELECT = {
  id: true,
  jobNumber: true,
  title: true,
  description: true,
  status: true,
  address: true,
  scheduledAt: true,
  completedAt: true,
  closedAt: true,
  completionSignatureName: true,
  completionSignedAt: true,
  reportNote: true,
  reportSentAt: true,
  companyId: true,
  contactId: true,
  company: {
    select: {
      name: true, legalName: true, showLegalNameOnDocs: true, phone: true, email: true,
      address: true, city: true, state: true, zip: true,
      logoData: true, logoMime: true, logoUrl: true,
      brandColor: true, brandColorSecondary: true, documentColor: true, timezone: true,
    },
  },
  contact: {
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, address: true, city: true, state: true, zip: true, hubToken: true, smsOptOut: true, smsDisabled: true },
  },
  assignments: { select: { user: { select: { name: true } } } },
  checklistItems: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }], select: { id: true, label: true, doneAt: true, skipReason: true } },
  photos: { orderBy: [{ takenAt: "asc" as const }, { createdAt: "asc" as const }], select: PHOTO_VIEW_SELECT },
} satisfies Prisma.JobSelect;

type ReportRow = Prisma.JobGetPayload<{ select: typeof REPORT_SELECT }>;

export type JobReport = {
  job: Omit<ReportRow, "photos" | "assignments" | "checklistItems">;
  crew: string[];
  /** Done items first in the order they were on the card; skipped ones carry their reason. */
  checklist: { id: string; label: string; done: boolean; skipReason: string | null }[];
  photos: PhotoView[];
  pairs: PhotoPair[];
  singles: PhotoView[];
  /** The client's link (hub). */
  path: string;
};

export function shapeReport(row: ReportRow): JobReport {
  const { photos: rows, assignments, checklistItems, ...job } = row;
  const photos = rows.map(toPhotoView);
  const { pairs, singles } = reportPhotos(photos);
  return {
    job,
    crew: assignments.map((a) => a.user.name).filter(Boolean),
    checklist: checklistItems.map((c) => ({ id: c.id, label: c.label, done: Boolean(c.doneAt), skipReason: c.skipReason })),
    photos,
    pairs,
    singles,
    path: reportPath(row.contact.hubToken, row.id),
  };
}

/** The report for one job, or null when there is no such job in scope. */
export async function loadJobReport(where: Prisma.JobWhereInput): Promise<JobReport | null> {
  const row = await prisma.job.findFirst({ where, select: REPORT_SELECT });
  return row ? shapeReport(row) : null;
}

/** A report is for finished work — an open job has nothing to report yet. */
export function reportAvailable(job: { status: string }): boolean {
  return job.status !== "ACTIVE";
}

/**
 * The client may open their report when the company can use Gallery (preview
 * on, plan allows) and the job is done. Both hub routes and the hub photo
 * route ask this before serving anything.
 */
export async function clientMayOpenReport(companyId: string, job: { status: string }): Promise<boolean> {
  if (!reportAvailable(job)) return false;
  if (!(await galleryPreviewFor(companyId))) return false;
  return featureAllowedFor(companyId, "gallery");
}

const err = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Save the note printed on the report (an empty string clears it). */
export async function saveReportNote(
  companyId: string,
  jobWhere: Prisma.JobWhereInput,
  note: string
): Promise<{ ok: true; note: string | null } | { ok: false; response: NextResponse }> {
  if (!(await galleryPreviewFor(companyId))) return { ok: false, response: err("The work report isn't available yet.", 403) };
  const gate = await checkFeature(companyId, "gallery");
  if (!gate.ok) return { ok: false, response: gate.response };
  const job = await prisma.job.findFirst({ where: jobWhere, select: { id: true } });
  if (!job) return { ok: false, response: err("Job not found.", 404) };
  const trimmed = note.trim().slice(0, REPORT_NOTE_MAX) || null;
  await prisma.job.update({ where: { id: job.id }, data: { reportNote: trimmed } });
  return { ok: true, note: trimmed };
}

export type ReportSendResult =
  | { ok: true; emailed: boolean; texted: boolean; to: string | null; phone: string | null; url: string }
  | { ok: false; status: number; error: string };

function baseUrl(): string {
  return (process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com").replace(/\/+$/, "");
}

/**
 * Send the client their report — by email, by text from the business line,
 * or both (the caller picks; an automation passes both and gets whatever
 * reaches them). Stamps reportSentAt and leaves a job note so the crew can
 * see it went. `note` (optional) replaces the saved note first.
 */
export async function sendJobReport(opts: {
  jobId: string;
  companyId: string;
  /** Extra row filter (the route's jobScope); automations pass none. */
  scope?: Prisma.JobWhereInput;
  channels: SendChannels;
  note?: string | null;
  /** Who to credit in the job note (an automation passes its owner). */
  byUserId: string | null;
}): Promise<ReportSendResult> {
  const { companyId } = opts;
  if (!(await galleryPreviewFor(companyId))) return { ok: false, status: 403, error: "The work report isn't available yet." };
  const gate = await checkFeature(companyId, "gallery");
  if (!gate.ok) return { ok: false, status: 402, error: "The work report is part of the Gallery plan." };

  const row = await prisma.job.findFirst({ where: { id: opts.jobId, companyId, ...(opts.scope ?? {}) }, select: REPORT_SELECT });
  if (!row) return { ok: false, status: 404, error: "Job not found." };
  if (!reportAvailable(row)) return { ok: false, status: 400, error: "Mark the job complete first — the report covers finished work." };

  if (opts.note !== undefined && opts.note !== null) {
    const trimmed = opts.note.trim().slice(0, REPORT_NOTE_MAX) || null;
    if (trimmed !== row.reportNote) {
      await prisma.job.update({ where: { id: row.id }, data: { reportNote: trimmed } });
      row.reportNote = trimmed;
    }
  }

  const report = shapeReport(row);
  const contact = row.contact;
  const emailable = opts.channels.email && Boolean(contact.email);
  const textable = opts.channels.text && Boolean(contact.phone) && canText(contact) && (await companyCanSendSms(companyId));
  if (!emailable && !textable) {
    return { ok: false, status: 400, error: "This client has no email or textable phone on file — add one to send the report." };
  }

  const url = `${baseUrl()}${report.path}`;
  const summary = reportSummaryLine({ pairs: report.pairs.length, singles: report.singles.length, checklist: report.checklist.filter((c) => c.done).length });
  const company = row.company;

  let emailed = false;
  if (emailable && contact.email) {
    const { subject, html } = jobReportEmail({
      brand: company,
      companyName: company.name,
      contactFirstName: contact.firstName,
      jobTitle: row.title,
      reportUrl: url,
      summary,
      note: row.reportNote,
    });
    emailed = await sendEmail({ companyId, to: contact.email, subject, html, replyTo: company.email || undefined, fromName: company.name });
  }
  let texted = false;
  if (textable && contact.phone) {
    texted = await sendSms({
      companyId,
      contactId: contact.id,
      to: contact.phone,
      text: jobReportText({ companyName: company.name, firstName: contact.firstName, jobTitle: row.title, reportUrl: url }),
    });
  }
  if (!emailed && !texted) {
    return {
      ok: false,
      status: 424,
      error: contact.email
        ? "Email isn't set up on this server yet — the report is still in the client's portal."
        : "The text didn't go out — check Text Notifications in Settings → Phone & texting.",
    };
  }

  const how = [emailed ? `emailed to ${contact.email}` : null, texted ? `texted to ${contact.phone}` : null].filter(Boolean).join(" and ");
  await prisma.job.update({ where: { id: row.id }, data: { reportSentAt: new Date() } });
  if (opts.byUserId) {
    await prisma.jobNote
      .create({ data: { jobId: row.id, userId: opts.byUserId, body: `Work report ${how}.` } })
      .catch((e) => reportError("[job-report] note failed", e));
  }
  return { ok: true, emailed, texted, to: emailed ? contact.email : null, phone: texted ? contact.phone : null, url };
}
