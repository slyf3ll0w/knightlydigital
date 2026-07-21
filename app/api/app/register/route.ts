import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { pricebookForIndustry } from "@/lib/pricebooks";
import { verifyCaptcha } from "@/lib/captcha";
import { checkInviteCode } from "@/lib/invites";

// Thrown when the transaction finds the invite already claimed — the check
// above it raced another signup using the same code.
class InviteClaimedError extends Error {}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function uniqueSlug(base: string) {
  let slug = base;
  let i = 1;
  while (await prisma.company.findUnique({ where: { slug } })) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { companyName, yourName, email, password, captchaToken } = body;
  // Optional — seeds the starter price book; signup never hard-fails on it
  const { industry } = body;

  if (!(await verifyCaptcha(captchaToken))) {
    return NextResponse.json(
      { error: "Captcha verification failed. Please try again." },
      { status: 400 }
    );
  }

  if (!companyName || !yourName || !email || !password) {
    return NextResponse.json({ error: "All required fields must be filled." }, { status: 400 });
  }

  if (
    String(companyName).length > 120 ||
    String(yourName).length > 120 ||
    String(email).length > 254 ||
    String(industry ?? "").length > 80
  ) {
    return NextResponse.json({ error: "Input too long." }, { status: 400 });
  }

  if (password.length < 8 || password.length > 72) {
    return NextResponse.json({ error: "Password must be 8–72 characters." }, { status: 400 });
  }

  // WorkBench is invite-only: no live code, no account.
  const invite = await checkInviteCode(body.inviteCode);
  if (!invite.ok) {
    return NextResponse.json({ error: invite.reason }, { status: 403 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "Unable to register. Please try again, or sign in if you already have an account." },
      { status: 400 }
    );
  }

  const hash = await bcrypt.hash(password, 12);

  // uniqueSlug's check-then-create can race if two same-name companies
  // register in the same instant; the DB @unique constraint catches the
  // loser (P2002), so retry with a fresh suffix before giving up.
  let company;
  for (let attempt = 0; ; attempt++) {
    const slug = await uniqueSlug(
      attempt === 0 ? slugify(companyName) : `${slugify(companyName)}-${attempt}`
    );
    try {
      company = await createCompany(companyName, slug, hash, body, invite.id);
      break;
    } catch (e) {
      if (e instanceof InviteClaimedError) {
        return NextResponse.json(
          { error: "That invite code has already been used." },
          { status: 403 }
        );
      }
      const slugClash =
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002" &&
        (e.meta?.target as string[] | undefined)?.includes("slug");
      if (!slugClash || attempt >= 2) throw e;
    }
  }

  return NextResponse.json({ success: true, companyId: company.id });
}

function createCompany(
  companyName: string,
  slug: string,
  hash: string,
  body: {
    yourName: string;
    email: string;
    industry?: string;
  },
  inviteId: string
) {
  const { yourName, email, industry } = body;
  return prisma.$transaction(async (tx) => {
    // Claim the invite atomically — the pre-check outside the transaction can
    // race a concurrent signup on the same code; the updateMany count settles it.
    const claimed = await tx.inviteCode.updateMany({
      where: { id: inviteId, usedAt: null, revokedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) throw new InviteClaimedError();

    const company = await tx.company.create({
      data: {
        name: companyName,
        slug,
        // Default notification inbox: the owner's email, editable in Settings.
        email,
        industry: industry || null,
        users: {
          create: {
            email,
            name: yourName,
            passwordHash: hash,
            role: "OWNER",
          },
        },
        // Industry-matched starter price book; "Other"/unknown industries start empty
        workItems: { create: pricebookForIndustry(industry) },
      },
    });

    await tx.inviteCode.update({
      where: { id: inviteId },
      data: { usedByCompanyId: company.id },
    });

    return company;
  });
}
