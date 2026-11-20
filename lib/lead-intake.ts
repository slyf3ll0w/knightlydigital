/**
 * A lead that arrives from outside by machine: the lead webhook
 * (/api/public/leads/[token]) and Facebook lead forms (lib/meta-leads.ts).
 * One path, so both land the same way: matched to an existing client by
 * phone or email, a Request made, onto the Leads board, automations fired,
 * the team pushed and emailed.
 *
 * Website forms keep their own path (app/api/public/book, lib/booking-submit.ts):
 * they carry consent, custom questions and quotes this one does not.
 */
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { phoneDigits } from "@/lib/phone";
import { namePlaceholder } from "@/lib/placeholder-contact";
import { defaultLeadAssignee } from "@/lib/permissions";
import { sendEmail, newRequestEmail } from "@/lib/email";
import { companyNotifyAddress } from "@/lib/notify";
import { notifyUsers, requestNotifyUserIds } from "@/lib/push";
import { enterPipeline, autoAdvance, firePipelineMoves } from "@/lib/pipeline";
import { fireAutomations } from "@/lib/automations-server";
import { withDocNumberRetry } from "@/lib/doc-numbers";

export type InboundLead = {
  firstName: string;
  /** "—" when the sender gave one name only */
  lastName: string;
  email: string | null;
  phone: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  /** already canonical (lib/lead-source.ts canonicalLeadSource) */
  source: string;
  /** anything else worth reading; rides along on the request */
  message?: string;
  /** Request.source: which door it came through */
  door: "webhook" | "facebook_form";
};

/** Split one "full name" into first and last; a single word gets "—" as its last name. */
export function splitFullName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") || "—" };
}

/** Files the lead and tells the team. The caller has already checked there is a first name and an email or phone. */
export async function createInboundLead(
  company: { id: string; name: string; email: string | null },
  lead: InboundLead
): Promise<{ contactId: string; requestId: string; newLead: boolean }> {
  const { firstName, lastName, email, phone, source } = lead;
  const address = lead.address || null;
  const assignedToId = await defaultLeadAssignee(company.id);

  const result = await withDocNumberRetry(() =>
    prisma.$transaction(async (tx) => {
      // Same dedupe as the public booking forms: match by phone or email
      let contact = await tx.contact.findFirst({
        where: {
          companyId: company.id,
          OR: [...(phoneDigits(phone) ? [{ phoneDigits: phoneDigits(phone) }] : []), ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : [])],
        },
        // A real record wins over a texted-number placeholder with the same phone
        orderBy: { placeholder: "asc" },
      });
      // A number that only ever texted in: this form is who they are
      const named = Boolean(contact?.placeholder);
      if (contact?.placeholder) contact = await namePlaceholder(tx, contact, { firstName, lastName, email, address, leadSource: source });
      const newLead = !contact || named;
      if (!contact) {
        contact = await tx.contact.create({
          data: {
            companyId: company.id,
            hubToken: randomBytes(24).toString("hex"),
            firstName,
            lastName,
            email,
            phone,
            address,
            city: lead.city || null,
            state: lead.state || null,
            zip: lead.zip || null,
            leadSource: source,
            assignedToId,
          },
        });
      }

      const last = await tx.request.findFirst({
        where: { companyId: company.id },
        orderBy: { requestNumber: "desc" },
      });
      const request = await tx.request.create({
        data: {
          companyId: company.id,
          contactId: contact.id,
          requestNumber: (last?.requestNumber ?? 0) + 1,
          title: `${source} lead`,
          details: [lead.message, address ? `Address: ${address}` : null, `Source: ${source}`].filter(Boolean).join("\n"),
          source: lead.door,
        },
      });

      // Onto the board: new leads land on the first stage; existing clients
      // re-enter as repeat business; archived leads resurrect.
      const moves = [await enterPipeline(tx, company.id, contact.id), await autoAdvance(tx, company.id, contact.id, "REQUEST_CREATED")];

      return { contact, request, moves, newLead };
    })
  );

  if (result.newLead) fireAutomations(company.id, "lead.created", result.contact.id);
  fireAutomations(company.id, "request.created", result.request.id);
  firePipelineMoves(company.id, result.moves);

  await notifyUsers(
    await requestNotifyUserIds(company.id),
    {
      title: `New ${source} lead: ${firstName} ${lastName}`.slice(0, 80),
      body: result.request.title,
      // `?lead=` names the card so the bell can retire this notice once the
      // lead leaves the first column (app/api/app/notifications/route.ts).
      url: `/app/leads?lead=${result.contact.id}`,
      tag: `request-${result.request.id}`,
    },
    { event: "requests" }
  );

  const notifyTo = await companyNotifyAddress(company.id, company.email);
  if (notifyTo) {
    const { subject, html } = newRequestEmail({
      companyName: company.name,
      requestId: result.request.id,
      requestNumber: result.request.requestNumber,
      title: result.request.title,
      details: result.request.details,
      contactName: `${firstName} ${lastName}`,
      contactPhone: phone,
      contactEmail: email,
      source: lead.door,
    });
    await sendEmail({ companyId: company.id, to: notifyTo, subject, html, replyTo: email || undefined });
  }

  return { contactId: result.contact.id, requestId: result.request.id, newLead: result.newLead };
}
