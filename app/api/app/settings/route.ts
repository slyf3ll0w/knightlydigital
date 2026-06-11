import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { sanitizeBookingForm } from "@/lib/booking-form";

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const companyId = session?.user.companyId;
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  await prisma.company.update({
    where: { id: companyId },
    data: {
      name: body.name || undefined,
      phone: body.phone || null,
      email: body.email || null,
      address: body.address || null,
      city: body.city || null,
      state: body.state || null,
      zip: body.zip || null,
      website: body.website || null,
      industry: body.industry !== undefined ? body.industry || null : undefined,
      logoUrl: body.logoUrl !== undefined ? body.logoUrl || null : undefined,
      brandColor:
        body.brandColor !== undefined
          ? /^#[0-9a-fA-F]{6}$/.test(body.brandColor ?? "")
            ? body.brandColor
            : null
          : undefined,
      surchargeEnabled: body.surchargeEnabled ?? undefined,
      surchargeRate: body.surchargeRate ?? undefined,
      reviewLink: body.reviewLink || null,
      bookingForm: body.bookingForm !== undefined ? sanitizeBookingForm(body.bookingForm) : undefined,
    },
  });

  return NextResponse.json({ success: true });
}
