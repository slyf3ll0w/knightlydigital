import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { starterWorkItems } from "@/lib/pricebook";
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
    String(phone ?? "").length > 30
  ) {
    return NextResponse.json({ error: "Input too long." }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  const slug = await uniqueSlug(slugify(companyName));
  const hash = await bcrypt.hash(password, 12);

  const company = await prisma.company.create({
    data: {
      name: companyName,
      slug,
      phone: phone || null,
      users: {
        create: {
          email,
          name: yourName,
          passwordHash: hash,
          role: "OWNER",
          phone: phone || null,
        },
      },
      workItems: { create: starterWorkItems },
    },
  });

  return NextResponse.json({ success: true, companyId: company.id });
}
