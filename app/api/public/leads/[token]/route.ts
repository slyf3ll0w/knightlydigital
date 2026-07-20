import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { defaultLeadAssignee } from "@/lib/permissions";
import { sendEmail, newRequestEmail } from "@/lib/email";
import { companyNotifyAddress } from "@/lib/notify";
import { notifyUsers, requestNotifyUserIds } from "@/lib/push";
import { enterPipeline, autoAdvance } from "@/lib/pipeline";
import { limit } from "@/lib/rate-limit";
import { withRequestNumberRetry } from "@/lib/request-number";

// Webhook leads get their own daily cap (counted by source, so a leaky
// integration can't eat the booking forms' backstop) plus an hourly limiter.
const MAX_LEADS_PER_COMPANY_PER_DAY = 200;
const MAX_LEADS_PER_COMPANY_PER_HOUR = 60;

const s = (v: unknown, max = 200): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/**
 * Generic lead-intake webhook — the company-specific URL lives in
 * Settings → Lead Pipeline. Built for Zapier/Make/ad-platform connectors
 * (Meta Lead Ads, Google Ads lead forms, Angi, …): POST a JSON lead and it
 * lands on the pipeline board, deduped against existing clients, assigned
 * like a website lead, with the team notified.
 *
 * Body (all optional except a name and an email or phone):
 *   { firstName, lastName }  or  { name } / { full_name }
 *   email, phone, address, city, state, zip,
 *   source  — e.g. "Facebook Ads"; becomes the lead source (default "Lead webhook")
 *   message — anything else worth reading; rides along on the request
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const company = await prisma.company.findUnique({
    where: { leadWebhookToken: token },
    select: { id: true, name: true, email: true, suspendedAt: true },
  });
  if (!company) return NextResponse.json({ error: "Not found." }, { status: 404 });
  // Suspended companies stop ingesting leads — same response as a bad token
  // so ad platforms just see a dead webhook.
  if (company.suspendedAt) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const rl = limit(`lead-webhook:${company.id}`, MAX_LEADS_PER_COMPANY_PER_HOUR, 3600000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  // Names: split a single "name"/"full_name" when first/last aren't given
  let firstName = s(body.firstName, 80);
  let lastName = s(body.lastName, 80);
  if (!firstName) {
    const full = s(body.name, 160) || s(body.full_name, 160);
    const parts = full.split(/\s+/).filter(Boolean);
    firstName = parts[0] ?? "";
    lastName = lastName || (parts.slice(1).join(" ") || "—");
  }
  if (!lastName) lastName = "—";
  const email = s(body.email, 200) || null;
  const phone = s(body.phone, 40) || null;

  if (!firstName) {
    return NextResponse.json({ error: "A name is required (firstName/lastName or name)." }, { status: 400 });
  }
  if (!email && !phone) {
    return NextResponse.json({ error: "An email or phone is required." }, { status: 400 });
  }

  const since = new Date(Date.now() - 86400000);
  const recent = await prisma.request.count({
    where: { companyId: company.id, source: "webhook", createdAt: { gte: since } },
  });
  if (recent >= MAX_LEADS_PER_COMPANY_PER_DAY) {
    return NextResponse.json({ error: "Daily lead limit reached." }, { status: 429 });
  }

  const source = s(body.source, 60) || "Lead webhook";
  const message = s(body.message, 5000);
  const address = s(body.address, 300) || null;
  const assignedToId = await defaultLeadAssignee(company.id);

  const result = await withRequestNumberRetry(() =>
    prisma.$transaction(async (tx) => {
      // Same dedupe as the public booking forms: match by phone or email
      let contact = await tx.contact.findFirst({
        where: {
          companyId: company.id,
          OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])],
        },
      });
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
            city: s(body.city, 100) || null,
            state: s(body.state, 40) || null,
            zip: s(body.zip, 20) || null,
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
          details: [message, address ? `Address: ${address}` : null, `Source: ${source}`]
            .filter(Boolean)
            .join("\n"),
          source: "webhook",
        },
      });

      // Onto the board: new leads land on the first stage; existing clients
      // re-enter as repeat business; archived leads resurrect.
      await enterPipeline(tx, company.id, contact.id);
      await autoAdvance(tx, company.id, contact.id, "REQUEST_CREATED");

      return { contact, request };
    })
  );

  await notifyUsers(await requestNotifyUserIds(company.id), {
    title: `New ${source} lead: ${firstName} ${lastName}`.slice(0, 80),
    body: result.request.title,
    url: `/app/leads`,
    tag: `request-${result.request.id}`,
  });

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
      source: "webhook",
    });
    await sendEmail({ companyId: company.id, to: notifyTo, subject, html, replyTo: email || undefined });
  }

  return NextResponse.json({ success: true, leadId: result.contact.id }, { status: 201 });
}
