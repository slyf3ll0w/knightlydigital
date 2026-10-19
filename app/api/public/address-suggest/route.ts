import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { geocodingEnabled, suggestAddresses } from "@/lib/geocoding";
import { clientIp, limit } from "@/lib/rate-limit";

/**
 * GET /api/public/address-suggest?q=…&slug=<company> — street-address
 * suggestions as a visitor types into a public booking, request or estimate
 * form (components/AddressAutocomplete.tsx with this endpoint; David
 * 2026-10-19). The company's slug gives the proximity bias and the meter the
 * same way the staff endpoints do. Two limits so nobody turns it into a free
 * geocoder: per visitor and per company; the platform/tenant Mapbox budget
 * still applies inside suggestAddresses.
 */
export async function GET(req: NextRequest) {
  if (!geocodingEnabled()) return NextResponse.json({ suggestions: [] });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 4) return NextResponse.json({ suggestions: [] });
  const slug = (req.nextUrl.searchParams.get("slug") ?? "").trim().slice(0, 80);
  const ip = clientIp(req.headers);
  if (!(await limit(`public-address-suggest:${ip}`, 60, 60_000)).ok) {
    return NextResponse.json({ suggestions: [] }, { status: 429 });
  }
  const company = slug ? await prisma.company.findUnique({ where: { slug }, select: { id: true } }) : null;
  if (company && !(await limit(`public-address-suggest-co:${company.id}`, 600, 60_000)).ok) {
    return NextResponse.json({ suggestions: [] }, { status: 429 });
  }
  return NextResponse.json({ suggestions: await suggestAddresses(q, company?.id ?? null) });
}
