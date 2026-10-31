import { NextRequest, NextResponse } from "next/server";
import { verifyCaptcha } from "@/lib/captcha";
import { limit, clientIp } from "@/lib/rate-limit";
import { createStoreOrder, StoreError } from "@/lib/store";
import { resolvePublicCompany } from "@/lib/public-company";
import { hubSubmitter } from "@/lib/hub-form";
import { reportError } from "@/lib/report-error";

/**
 * POST /api/public/store/[slug] — a buyer's order from the shop page:
 *   { itemId, quantity, firstName, lastName, email, phone?, note?, captchaToken, website (honeypot), elapsedMs }
 * → 201 { payUrl, invoiceId, total }. The same spam guards as the booking
 * form: per-IP ceiling, Turnstile, honeypot and an inhumanly fast submit
 * (those two answer success without making anything, so the bot can't tell).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const ip = clientIp(req.headers);
  if (!(await limit(`public-store-ip:${ip}`, 20, 3600_000)).ok) {
    return NextResponse.json({ error: "Too many requests — please try again later." }, { status: 429 });
  }
  // A client ordering from their own hub: the hub token of THIS company's
  // contact is the auth (same rule as the booking form) — no captcha, and
  // the order lands on their record with no matching.
  const company = await resolvePublicCompany(slug);
  if (!company) return NextResponse.json({ error: "Shop not found." }, { status: 404 });
  const hubContact = await hubSubmitter(body.hubToken, company.id);
  if (!hubContact && !(await verifyCaptcha(body.captchaToken))) {
    return NextResponse.json({ error: "Captcha verification failed. Please try again." }, { status: 400 });
  }
  const filledHoneypot = typeof body.website === "string" && body.website.trim() !== "";
  const tooFast = typeof body.elapsedMs === "number" && body.elapsedMs >= 0 && body.elapsedMs < 2500;
  if (!hubContact && (filledHoneypot || tooFast)) return NextResponse.json({ success: true }, { status: 201 });

  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  try {
    const order = await createStoreOrder({
      companySlug: slug,
      itemId: str(body.itemId, 64),
      quantity: Number(body.quantity),
      buyer: hubContact
        ? { firstName: hubContact.firstName, lastName: hubContact.lastName, email: hubContact.email ?? str(body.email, 200), phone: hubContact.phone ?? str(body.phone, 40) }
        : { firstName: str(body.firstName, 80), lastName: str(body.lastName, 80), email: str(body.email, 200), phone: str(body.phone, 40) },
      note: str(body.note, 300) || null,
      contactId: hubContact?.id ?? null,
    });
    return NextResponse.json({ success: true, payUrl: `/pay/${order.publicToken}`, invoiceId: order.invoiceId, total: order.total }, { status: 201 });
  } catch (err) {
    if (err instanceof StoreError) return NextResponse.json({ error: err.message }, { status: err.status });
    reportError("[store] order failed", { slug, error: err });
    return NextResponse.json({ error: "Something went wrong placing the order. Please try again." }, { status: 500 });
  }
}
