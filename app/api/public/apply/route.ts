import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { verifyCaptcha } from "@/lib/captcha";
import { sendEmail, newApplicationEmail } from "@/lib/email";
import { checkInviteCode } from "@/lib/invites";
import { normalizeEmail } from "@/lib/user-email";
import { findOrAdoptAccountByEmail } from "@/lib/account";
import { createCompanySignup, InviteClaimedError, PlaceholderClaimedError } from "@/lib/signup";
import { isValidTimezone } from "@/lib/timezone";

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
 * Google path: a visitor who signed in with Google first arrives here holding
 * a company-less session (lib/social-login.ts). No email or password is
 * asked — the login exists — and the company opens on that Account. A
 * session that already has a company is refused (second companies are added
 * from inside the app, /app/register).
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
    smsConsent,
  } = body;

  if (!(await verifyCaptcha(captchaToken))) {
    return NextResponse.json(
      { error: "Captcha verification failed. Please try again." },
      { status: 400 }
    );
  }

  // Signed-in (Google) mode: the session's Account owns the new company and
  // supplies the email; the typed password field doesn't exist.
  const session = await getServerSession(authOptions);
  let sessionAccount: { id: string; email: string } | null = null;
  if (session?.user?.accountId) {
    if (session.user.companyId) {
      return NextResponse.json(
        { error: "You're already signed in with a company. To add another, open WorkBench and choose New company from your profile picture." },
        { status: 409 }
      );
    }
    const held = await prisma.account.findUnique({
      where: { id: session.user.accountId },
      select: { id: true, email: true, passwordChangedAt: true },
    });
    // A password reset evicts every older session (lib/permissions.ts) —
    // including here, or an evicted cookie could still open a company.
    const evicted =
      held?.passwordChangedAt && (session.user.authAt ?? 0) < held.passwordChangedAt.getTime();
    if (!held || evicted) {
      return NextResponse.json(
        { error: "Your sign-in is no longer valid. Sign out and try again." },
        { status: 401 }
      );
    }
    sessionAccount = { id: held.id, email: held.email };
  }

  const email = sessionAccount ? sessionAccount.email : normalizeEmail(body.email);

  if (!name || !email || !companyName || (!sessionAccount && !password)) {
    return NextResponse.json(
      {
        error: sessionAccount
          ? "Name and business name are required."
          : "Name, email, business name, and password are required.",
      },
      { status: 400 }
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (!sessionAccount && (String(password).length < 8 || String(password).length > 72)) {
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
  // invitee didn't want. The universal tester code checks out with a null
  // id (nothing to claim) and opens the company the same way.
  let invite: { id: string | null } | null = null;
  if (typeof inviteCode === "string" && inviteCode.trim()) {
    const check = await checkInviteCode(inviteCode);
    if (!check.ok) {
      return NextResponse.json({ error: check.reason }, { status: 403 });
    }
    invite = { id: check.id };
  }

  // Existing login with this email: the typed password must match, then the
  // new company attaches to it (same behavior as the register page). The
  // generic message on mismatch never confirms the address exists — nor
  // that it exists as a password-less (Google-only) login, nor that it has
  // already opened a company through this flow (that check sits BEHIND the
  // password on purpose; a captcha-solved probe must learn nothing from it).
  const GENERIC =
    "Unable to sign you up. If you already have an account — including one opened with Google — log in instead, or use Forgot password.";
  const existing = sessionAccount ? null : await findOrAdoptAccountByEmail(email);
  let owner:
    | { account: { id: string; email: string }; ownerName: string }
    | { newLogin: { email: string; hash: string; name: string } };
  if (sessionAccount) {
    owner = { account: sessionAccount, ownerName: String(name).trim() };
  } else if (existing) {
    const valid = existing.passwordHash
      ? await bcrypt.compare(String(password), existing.passwordHash)
      : false;
    if (!valid) {
      return NextResponse.json({ error: GENERIC }, { status: 400 });
    }
    owner = { account: { id: existing.id, email: existing.email }, ownerName: String(name).trim() };
  } else {
    // No login, yet an application that already opened a company under this
    // email (the account was deleted, or never adopted): don't stack a
    // second one — and don't say why.
    const openApplication = await prisma.accessApplication.findFirst({
      where: { email, companyId: { not: null } },
      select: { id: true },
    });
    if (openApplication) {
      return NextResponse.json({ error: GENERIC }, { status: 400 });
    }
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
      // Explicit, unchecked-by-default opt-in to WorkBench's own sales & support texts.
      smsConsentAt: smsConsent === true && phone ? new Date() : null,
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

  let created: { companyId: string; userId: string };
  try {
    created = await createCompanySignup({
      companyName,
      industry,
      // The applicant's browser zone (validated; a bad value keeps the default)
      timezone: isValidTimezone(body.timezone) ? body.timezone : null,
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
    if (e instanceof PlaceholderClaimedError) {
      return NextResponse.json(
        { error: "Your business was already opened — refresh to see it." },
        { status: 409 }
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
  // The company exists by now — a mail-provider blip must not turn that into
  // a 500 the form reads as "try again" (the retry would then hit the
  // already-applied check above).
  try {
    await sendEmail({ to: APPLICATION_INBOX, ...notification });
  } catch (e) {
    console.error("[apply] application notice failed", e);
  }

  // userId = the new OWNER membership; the signed-in (Google) form re-points
  // its session at it (useSession().update({ switchToUserId })).
  return NextResponse.json({ success: true, userId: created.userId });
}
