import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCaptcha } from "@/lib/captcha";
import { runCompiled, formatValue, visibleInputIds, type Value } from "@/lib/estimator";
import { loadPriceBook, resolvePublicEstimator } from "@/lib/estimator-server";
import { createEstimateLead } from "@/lib/estimator-lead";
import { limit, clientIp } from "@/lib/rate-limit";

// Same backstop as the booking form: one runaway bot can't flood a company
const MAX_REQUESTS_PER_COMPANY_PER_DAY = 200;

/**
 * POST /api/public/estimate/[companySlug]/[toolSlug]
 *   { inputs, firstName, lastName, email?, phone?, address?, message?,
 *     smsConsent?, captchaToken, website, elapsedMs, page?, usedPhoto? }
 * The website form's submit. Re-runs the tool's math from the inputs (the
 * client's numbers are never trusted), then files the lead: contact +
 * request (+ draft or sent quote per the form's onSubmit). Anti-abuse
 * mirrors /api/public/book: per-IP ceiling, captcha, honeypot, too-fast
 * check, per-company daily cap. Preview forms never submit (no ?preview).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; tool: string }> }) {
  const { slug, tool } = await params;
  const pub = await resolvePublicEstimator(slug, tool);
  if (!pub) return NextResponse.json({ error: "This form isn't taking submissions right now." }, { status: 404 });
  const { company, spec, config } = pub;

  const ip = clientIp(req.headers);
  if (!(await limit(`public-book-ip:${ip}`, 20, 3600_000)).ok) {
    return NextResponse.json({ error: "Too many requests — please try again later." }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!(await verifyCaptcha(typeof body.captchaToken === "string" ? body.captchaToken : undefined))) {
    return NextResponse.json({ error: "Captcha verification failed. Please try again." }, { status: 400 });
  }

  // Bot signals: pretend success so the bot doesn't learn it was caught
  const filledHoneypot = typeof body.website === "string" && body.website.trim() !== "";
  const tooFast = typeof body.elapsedMs === "number" && body.elapsedMs >= 0 && body.elapsedMs < 3000;
  if (filledHoneypot || tooFast) return NextResponse.json({ success: true }, { status: 201 });

  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const firstName = str(body.firstName, 100);
  const lastName = str(body.lastName, 100);
  const email = config.fields.email.show ? str(body.email, 200) : "";
  const phone = config.fields.phone.show ? str(body.phone, 40) : "";
  const address = config.fields.address.show ? str(body.address, 300) : "";
  const message = config.fields.message.show ? str(body.message, 5000) : "";

  if (!firstName || !lastName) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (config.fields.email.required && !email) return NextResponse.json({ error: "Email is required." }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "That email address doesn't look right." }, { status: 400 });
  if (config.fields.phone.required && !phone) return NextResponse.json({ error: "Phone is required." }, { status: 400 });
  if (!email && !phone) return NextResponse.json({ error: "Enter an email or phone number so we can reach you." }, { status: 400 });
  if (config.fields.address.required && !address) return NextResponse.json({ error: "Address is required." }, { status: 400 });
  if (config.fields.message.required && !message) return NextResponse.json({ error: `"${config.fields.message.label}" is required.` }, { status: 400 });
  if (config.onSubmit === "send" && !email) return NextResponse.json({ error: "Enter an email address so we can send your quote." }, { status: 400 });

  const inputs = (body.inputs && typeof body.inputs === "object" && !Array.isArray(body.inputs) ? body.inputs : {}) as Record<string, unknown>;
  const result = runCompiled(pub.compiled, inputs, await loadPriceBook(company.id));
  if (!result.ok) return NextResponse.json({ error: result.errors[0], errors: result.errors }, { status: 400 });

  const since = new Date(Date.now() - 86400000);
  const recent = await prisma.request.count({ where: { companyId: company.id, source: { not: "webhook" }, createdAt: { gte: since } } });
  if (recent >= MAX_REQUESTS_PER_COMPANY_PER_DAY) {
    return NextResponse.json({ error: "This business can't accept more requests right now. Please call instead." }, { status: 429 });
  }

  // The answers, as words, for the request's details (hidden questions stay out)
  const visible = visibleInputIds(spec, inputs);
  const answers = spec.inputs
    .map((inp) => {
      const raw = inputs[inp.id];
      if (!visible.has(inp.id)) return null;
      if (raw === undefined || raw === null || raw === "" || (Array.isArray(raw) && raw.length === 0)) return null;
      let shown: string;
      if (inp.type === "toggle") shown = raw === true || raw === "true" || raw === "1" || raw === "on" ? "yes" : "no";
      else if (inp.type === "select") shown = inp.options.find((o) => o.value === String(raw))?.label ?? String(raw);
      else if (inp.type === "multi") {
        const picks = Array.isArray(raw) ? raw : String(raw).split(",");
        shown = picks.map((p) => inp.options.find((o) => o.value === String(p).trim())?.label ?? String(p).trim()).filter(Boolean).join(", ");
      }
      else if (inp.type === "map") shown = `${Math.round(Number(String(raw).replace(/[,\s]/g, ""))).toLocaleString("en-US")} ${inp.measure === "length" ? "ft" : "sq ft"} (drawn on the map)`;
      else if (inp.type === "number") shown = `${formatValue(Number(String(raw).replace(/[,$\s]/g, "")) as Value)}${inp.unit ? ` ${inp.unit}` : ""}`;
      else shown = String(raw).slice(0, 500);
      return `${inp.label}: ${shown}`;
    })
    .filter((a): a is string => Boolean(a));

  // Where the lead came from: the page hosting the embed (sent by the snippet) or the referrer
  const pageRaw = str(body.page, 300);
  const page = /^https?:\/\//i.test(pageRaw) ? pageRaw : "";
  const lead = await createEstimateLead({
    pub,
    result,
    answers,
    customer: { firstName, lastName, email, phone, address, message, smsConsent: phone ? body.smsConsent === true : undefined },
    page: page || undefined,
    usedPhoto: config.photoAssist && body.usedPhoto === true,
  });
  return NextResponse.json({ success: true, estimate: lead.estimate, quoteNumber: lead.quoteNumber }, { status: 201 });
}
