import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { verifyCaptcha } from "@/lib/captcha";
import { sendEmail, newApplicationEmail } from "@/lib/email";
import { checkInviteCode } from "@/lib/invites";
import { normalizeEmail } from "@/lib/user-email";
import { findOrAdoptAccountByEmail } from "@/lib/account";
import { createCompanySignup, InviteClaimedError } from "@/lib/signup";

// Where new-application notifications land (a person reads every one).
const APPLICATION_INBOX = process.env.APPLICATION_INBOX ?? "info@streamflaire.com";

/**
 * Self-serve onboarding intake from /apply — step 1 of the signup flow.
 * One POST does all of it: records the AccessApplication AND opens the
 * account (Account + Company + OWNER membership), so the client can sign in
 * and continue straight to Finix underwriting at /app/activate.
 *
 * The application still gets human review at /superadmin/applications — the
 * company just isn't held for it: it opens in pending-approval mode
 * (Company.accessPendingAt, banner in the app) and gets suspended if the
 * review says no.
 *
 * The unlisted /invite page posts here too, with `inviteCode` set. The public
 * /apply form never sends one. A valid code IS the approval: no pending
 * state, application booked APPROVED, and Finix underwriting waived — the
 * business gets in without card processing and lands on the dashboard.
 *
 * Captcha-gated here, rate-limited (3/hr/IP, "apply" bucket) in middleware.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const {
    name,
    phone,
    companyName,
    industry,
    teamSize,
    city,
    state,
    paymentsToday,
    monthlyVolume,
    yearsInBusiness,
    entityType,
    website,
    message,
    password,
    inviteCode,
    captchaToken,
  } = body;
  const email = normalizeEmail(body.email);

  if (!(await verifyCaptcha(captchaToken))) {
    return NextResponse.json(
      { error: "Captcha verification failed. Please try again." },
      { status: 400 }
    );
  }

  if (!name || !email || !companyName || !password) {
    return NextResponse.json(
      { error: "Name, email, business name, and password are required." },
      { status: 400 }
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (String(password).length < 8 || String(password).length > 72) {
    return NextResponse.json({ error: "Password must be 8–72 characters." }, { status: 400 });
  }
  if (
    String(name).length > 120 ||
    String(email).length > 254 ||
    String(phone ?? "").length > 30 ||
    String(companyName).length > 120 ||
    String(industry ?? "").length > 80 ||
    String(teamSize ?? "").length > 40 ||
    String(city ?? "").length > 80 ||
    String(state ?? "").length > 40 ||
    String(paymentsToday ?? "").length > 80 ||
    String(monthlyVolume ?? "").length > 40 ||
    String(yearsInBusiness ?? "").length > 40 ||
    String(entityType ?? "").length > 40 ||
    String(website ?? "").length > 200 ||
    String(message ?? "").length > 2000 ||
    String(inviteCode ?? "").length > 40
  ) {
    return NextResponse.json({ error: "Input too long." }, { status: 400 });
  }

  // Invite code (only the /invite page sends one) — a typo should surface,
  // not silently open a pending-review, underwriting-gated account the
  // invitee didn't want.
  let invite: { id: string } | null = null;
  if (typeof inviteCode === "string" && inviteCode.trim()) {
    const check = await checkInviteCode(inviteCode);
    if (!check.ok) {
      return NextResponse.json({ error: check.reason }, { status: 403 });
    }
    invite = { id: check.id };
  }

  // Email already tied to an account that already opened a company through
  // this flow? Point them at sign-in instead of stacking applications.
  const openApplication = await prisma.accessApplication.findFirst({
    where: { email, companyId: { not: null } },
    select: { id: true },
  });
  if (openApplication) {
    return NextResponse.json(
      {
        error:
          "You've already applied with this email and your account is open — sign in at the login page. Forgot your password? Reset it from there.",
      },
      { status: 409 }
    );
  }

  // Existing login with this email: the typed password must match, then the
  // new company attaches to it (same behavior as the register page). The
  // generic message on mismatch never confirms the address exists.
  const existing = await findOrAdoptAccountByEmail(email);
  let owner:
    | { account: { id: string; email: string }; ownerName: string }
    | { newLogin: { email: string; hash: string; name: string } };
  if (existing) {
    const valid = await bcrypt.compare(String(password), existing.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Unable to sign you up. Please try again, or sign in if you already have an account." },
        { status: 400 }
      );
    }
    owner = { account: { id: existing.id, email: existing.email }, ownerName: String(name).trim() };
  } else {
    owner = {
      newLogin: { email, hash: await bcrypt.hash(String(password), 12), name: String(name).trim() },
    };
  }

  // A code is the approval: the application books as decided and the company
  // opens without the pending banner AND without the underwriting gate (the
  // invitee lands on the dashboard, not /app/activate). No code = PENDING
  // review, account open with accessPendingAt, held at /app/activate.
  const application = await prisma.accessApplication.create({
    data: {
      name,
      email,
      phone: phone || null,
      companyName,
      industry: industry || null,
      teamSize: teamSize || null,
      city: city || null,
      state: state || null,
      paymentsToday: paymentsToday || null,
      monthlyVolume: monthlyVolume || null,
      yearsInBusiness: yearsInBusiness || null,
      entityType: entityType || null,
      website: website || null,
      message: message || null,
      ...(invite ? { status: "APPROVED" as const, decidedAt: new Date() } : {}),
    },
  });

  try {
    await createCompanySignup({
      companyName,
      industry,
      owner,
      inviteId: invite?.id ?? null,
      accessPending: !invite,
      paymentsWaived: Boolean(invite),
      applicationId: application.id,
    });
  } catch (e) {
    // The company never opened — remove the application so a retry doesn't
    // trip the already-applied check above.
    await prisma.accessApplication
      .delete({ where: { id: application.id } })
      .catch(() => undefined);
    if (e instanceof InviteClaimedError) {
      return NextResponse.json(
        { error: "That invite code has already been used." },
        { status: 403 }
      );
    }
    throw e;
  }

  // Best-effort notify — the application is saved either way.
  const notification = newApplicationEmail({
    name: application.name,
    email: application.email,
    phone: application.phone,
    companyName: application.companyName,
    industry: application.industry,
    teamSize: application.teamSize,
    city: application.city,
    state: application.state,
    paymentsToday: application.paymentsToday,
    monthlyVolume: application.monthlyVolume,
    yearsInBusiness: application.yearsInBusiness,
    entityType: application.entityType,
    website: application.website,
    message: application.message,
  });
  await sendEmail({ to: APPLICATION_INBOX, ...notification });

  return NextResponse.json({ success: true });
}
