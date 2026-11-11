import { prisma } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { createCompanySignup } from "@/lib/signup";
import { isValidTimezone } from "@/lib/timezone";
import { notifyUser } from "@/lib/push";
import { sendEmail, companyReadyEmail, companyRequestDeclinedEmail, newCompanyRequestEmail } from "@/lib/email";
import { logConsoleAction } from "@/lib/console-audit";
import type { SuperadminUser } from "@/lib/superadmin";

/**
 * Extra companies on an existing login go through WorkBench support
 * (David 2026-11-11). Nobody opens a second company by themselves: the avatar
 * menu's "Request a company" files a CompanyRequest, support approves it
 * from the console (Sign-ups → Company requests), and approval opens the
 * company on the requester's Account with them as OWNER — the same
 * createCompanySignup every other door uses. Support can also open one
 * directly for any login from the same page (openCompanyForLogin).
 *
 * A company opened this way is held at the payment-setup step like any
 * self-serve sign-up (requirePayments): its own business, its own Square.
 * No cap on how many a login may hold — support decides each one.
 */

const INBOX = process.env.APPLICATION_INBOX ?? "info@streamflaire.com";

export const REQUEST_LIMITS = { companyName: 120, industry: 80, note: 1000 } as const;

export class CompanyRequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** File a request from the signed-in membership `userId`. */
export async function fileCompanyRequest(
  userId: string,
  input: { companyName?: unknown; industry?: unknown; note?: unknown; timezone?: unknown }
) {
  const companyName = clean(input.companyName, REQUEST_LIMITS.companyName);
  if (!companyName) throw new CompanyRequestError("Type the new company's name.");
  const industry = clean(input.industry, REQUEST_LIMITS.industry) || null;
  const note = clean(input.note, REQUEST_LIMITS.note) || null;
  const timezone = typeof input.timezone === "string" && isValidTimezone(input.timezone) ? input.timezone : null;

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, accountId: true },
  });
  if (!me?.accountId) throw new CompanyRequestError("Your session is no longer valid. Sign out, then try again.", 401);

  const open = await prisma.companyRequest.findMany({
    where: { accountId: me.accountId, status: "PENDING" },
    select: { companyName: true },
  });
  if (open.some((r) => r.companyName.toLowerCase() === companyName.toLowerCase())) {
    throw new CompanyRequestError(`You already asked for ${companyName}. Support will be in touch.`, 409);
  }
  // Flood guard, not a cap on companies.
  if (open.length >= 5) throw new CompanyRequestError("You have several requests waiting already. Support will get to them soon.", 429);

  const request = await prisma.companyRequest.create({
    data: {
      accountId: me.accountId,
      requestedByUserId: me.id,
      requesterName: me.name,
      companyName,
      industry,
      note,
      timezone,
    },
    select: { id: true, companyName: true, status: true, createdAt: true },
  });

  const memberships = await prisma.user.findMany({
    where: { accountId: me.accountId, isActive: true, companyId: { not: null } },
    select: { company: { select: { name: true } } },
  });
  await sendEmail({
    to: INBOX,
    ...newCompanyRequestEmail({
      requesterName: me.name,
      requesterEmail: me.email,
      currentCompanies: memberships.map((m) => m.company?.name).filter((n): n is string => Boolean(n)),
      companyName,
      industry,
      note,
    }),
  }).catch((err) => reportError("[company-request] inbox email failed:", err));

  return request;
}

/** The requester takes it back before support answers. */
export async function cancelCompanyRequest(userId: string, requestId: string) {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { accountId: true } });
  if (!me?.accountId) throw new CompanyRequestError("Not found.", 404);
  const done = await prisma.companyRequest.updateMany({
    where: { id: requestId, accountId: me.accountId, status: "PENDING" },
    data: { status: "CANCELLED", decidedAt: new Date() },
  });
  if (done.count === 0) throw new CompanyRequestError("That request was already answered.", 409);
}

/** The login's waiting requests, for the avatar menu. */
export async function pendingRequestsForUser(userId: string) {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { accountId: true } });
  if (!me?.accountId) return [];
  return prisma.companyRequest.findMany({
    where: { accountId: me.accountId, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: { id: true, companyName: true, createdAt: true },
  });
}

async function openOnAccount(opts: {
  account: { id: string; email: string };
  ownerName: string;
  companyName: string;
  industry: string | null;
  timezone: string | null;
}) {
  return createCompanySignup({
    companyName: opts.companyName,
    industry: opts.industry,
    timezone: opts.timezone,
    owner: { account: opts.account, ownerName: opts.ownerName },
    // Its own business: connects its own Square at the setup step.
    requirePayments: true,
  });
}

/** Tell them it's open: push (tap switches into it) + email. Never throws. */
async function announceReady(newUserId: string, email: string, name: string | null, companyName: string) {
  const url = "/app/dashboard";
  await notifyUser(newUserId, { title: `${companyName} is ready`, body: "Tap to open it.", url }).catch((err) =>
    reportError("[company-request] push failed:", err)
  );
  // The email button goes through /app/open so it switches membership first.
  const emailed = await sendEmail({
    to: email,
    ...companyReadyEmail({ name, companyName, url: `/app/open?u=${newUserId}&to=${encodeURIComponent(url)}` }),
  }).catch((err) => {
    reportError("[company-request] ready email failed:", err);
    return false;
  });
  return emailed !== false;
}

export async function approveCompanyRequest(admin: SuperadminUser, requestId: string) {
  // Claim first, so two clicks (or two superadmins) can't open it twice.
  const claimed = await prisma.companyRequest.updateMany({
    where: { id: requestId, status: "PENDING" },
    data: { status: "APPROVED", decidedAt: new Date(), decidedBy: admin.name || admin.email },
  });
  if (claimed.count === 0) throw new CompanyRequestError("This request was already answered.", 409);

  const request = await prisma.companyRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { account: { select: { id: true, email: true } } },
  });

  let created: { companyId: string; userId: string };
  try {
    created = await openOnAccount({
      account: request.account,
      ownerName: request.requesterName,
      companyName: request.companyName,
      industry: request.industry,
      timezone: request.timezone,
    });
  } catch (err) {
    // Put it back so it can be tried again.
    await prisma.companyRequest.update({
      where: { id: requestId },
      data: { status: "PENDING", decidedAt: null, decidedBy: null },
    });
    throw err;
  }
  await prisma.companyRequest.update({ where: { id: requestId }, data: { companyId: created.companyId } });

  logConsoleAction(admin, "company-request-approve", {
    company: { id: created.companyId, name: request.companyName },
    detail: `${request.companyName} — for ${request.account.email}`,
  });
  const emailed = await announceReady(created.userId, request.account.email, request.requesterName, request.companyName);
  return { companyId: created.companyId, emailed };
}

export async function declineCompanyRequest(admin: SuperadminUser, requestId: string, reasonRaw: unknown) {
  const reason = clean(reasonRaw, 1000) || null;
  const claimed = await prisma.companyRequest.updateMany({
    where: { id: requestId, status: "PENDING" },
    data: { status: "DECLINED", decidedAt: new Date(), decidedBy: admin.name || admin.email },
  });
  if (claimed.count === 0) throw new CompanyRequestError("This request was already answered.", 409);
  const request = await prisma.companyRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { account: { select: { email: true } } },
  });
  logConsoleAction(admin, "company-request-decline", { detail: `${request.companyName} — for ${request.account.email}` });
  const emailed = await sendEmail({
    to: request.account.email,
    ...companyRequestDeclinedEmail({ name: request.requesterName, companyName: request.companyName, reason }),
  }).catch(() => false);
  return { emailed: emailed !== false };
}

/**
 * Support opens a company straight onto an existing login — no request
 * needed (David's own companies, or someone set up on a call).
 */
export async function openCompanyForLogin(
  admin: SuperadminUser,
  input: { email?: unknown; companyName?: unknown; industry?: unknown }
) {
  const email = clean(input.email, 254).toLowerCase();
  const companyName = clean(input.companyName, REQUEST_LIMITS.companyName);
  const industry = clean(input.industry, REQUEST_LIMITS.industry) || null;
  if (!email || !companyName) throw new CompanyRequestError("Login email and company name are both needed.");

  const account = await prisma.account.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      users: {
        where: { isActive: true, companyId: { not: null }, role: { not: "SUPERADMIN" } },
        orderBy: { createdAt: "asc" },
        select: { name: true, company: { select: { timezone: true } } },
        take: 1,
      },
    },
  });
  if (!account) {
    throw new CompanyRequestError("No WorkBench login uses that email. Someone new signs up at workbenchfsm.com instead.", 404);
  }
  const first = account.users[0];
  const created = await openOnAccount({
    account: { id: account.id, email: account.email },
    ownerName: first?.name ?? (email.split("@")[0] || "Owner"),
    companyName,
    industry,
    // Same zone as the company they already run, when they have one.
    timezone: first?.company?.timezone ?? null,
  });
  await prisma.companyRequest.create({
    data: {
      accountId: account.id,
      requesterName: first?.name ?? email,
      companyName,
      industry,
      note: "Opened by support",
      status: "APPROVED",
      decidedAt: new Date(),
      decidedBy: admin.name || admin.email,
      companyId: created.companyId,
    },
  });
  logConsoleAction(admin, "company-open-for-login", {
    company: { id: created.companyId, name: companyName },
    detail: `${companyName} — for ${email}`,
  });
  const emailed = await announceReady(created.userId, account.email, first?.name ?? null, companyName);
  return { companyId: created.companyId, emailed };
}

/**
 * True when this login already runs a company. The signed-out sign-up forms
 * (apply, /invite, /app/register) use it AFTER the password checks out: an
 * existing owner asks support for the next company instead of typing their
 * password into a sign-up form to attach one.
 */
export async function accountHasCompany(accountId: string): Promise<boolean> {
  const row = await prisma.user.findFirst({
    where: { accountId, isActive: true, companyId: { not: null }, role: { not: "SUPERADMIN" } },
    select: { id: true },
  });
  return Boolean(row);
}

export const HAS_COMPANY_MESSAGE =
  "This email already has a WorkBench company. Log in, then use Request a company in the menu under your picture and support will open the new one for you.";
