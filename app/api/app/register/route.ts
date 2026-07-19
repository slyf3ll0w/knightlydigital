import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { pricebookForIndustry } from "@/lib/pricebooks";
import { verifyCaptcha } from "@/lib/captcha";

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
  const { companyName, yourName, email, password, phone, captchaToken } = body;
  // Onboarding answers — all optional so the wizard can never hard-fail on them
  const { industry, teamSize, currentSoftware, topPriority, referralSource } = body;

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
    String(phone ?? "").length > 30 ||
    String(industry ?? "").length > 80 ||
    String(teamSize ?? "").length > 40 ||
    String(currentSoftware ?? "").length > 80 ||
    String(topPriority ?? "").length > 80 ||
    String(referralSource ?? "").length > 80
  ) {
    return NextResponse.json({ error: "Input too long." }, { status: 400 });
  }

  if (password.length < 8 || password.length > 72) {
    return NextResponse.json({ error: "Password must be 8–72 characters." }, { status: 400 });
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
      company = await createCompany(companyName, slug, hash, body);
      break;
    } catch (e) {
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
    phone?: string;
    industry?: string;
    teamSize?: string;
    currentSoftware?: string;
    topPriority?: string;
    referralSource?: string;
  }
) {
  const { yourName, email, phone, industry, teamSize, currentSoftware, topPriority, referralSource } =
    body;
  return prisma.company.create({
    data: {
      name: companyName,
      slug,
      phone: phone || null,
      // Default notification inbox: the owner's email, editable in Settings.
      email,
      industry: industry || null,
      teamSize: teamSize || null,
      currentSoftware: currentSoftware || null,
      topPriority: topPriority || null,
      referralSource: referralSource || null,
      users: {
        create: {
          email,
          name: yourName,
          passwordHash: hash,
          role: "OWNER",
          phone: phone || null,
        },
      },
      // Industry-matched starter price book; "Other"/unknown industries start empty
      workItems: { create: pricebookForIndustry(industry) },
    },
  });
}
