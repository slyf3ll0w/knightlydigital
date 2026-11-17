import { NextRequest, NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { connectBlock, createAuthCode, issuer, redirectAllowed, resolveClient } from "@/lib/connector/oauth";

/**
 * The Allow / Cancel buttons on /connect post here (a plain form, so the
 * answer is a redirect back to the AI app).
 *
 * Everything the page showed is checked again: the app, the address it
 * will be sent back to, and that the signed-in person is an owner or admin
 * of a company that allows connected apps. The request must come from our
 * own page (Origin) with the person's session cookie; another site cannot
 * press Allow for them.
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== issuer() && origin !== req.nextUrl.origin) return new NextResponse("Forbidden", { status: 403 });
  const actor = await getActor();
  if (!actor) return new NextResponse("Sign in first.", { status: 401 });

  const form = await req.formData().catch(() => null);
  const get = (k: string) => String(form?.get(k) ?? "");
  const client = await resolveClient(get("client_id"));
  const redirectUri = get("redirect_uri");
  // never redirect to an address we have not verified
  if (!client || !redirectAllowed(client, redirectUri)) return new NextResponse("That app or its return address isn't valid.", { status: 400 });
  const challenge = get("code_challenge");
  const back = new URL(redirectUri);
  if (get("state")) back.searchParams.set("state", get("state"));
  back.searchParams.set("iss", issuer());

  const member = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { role: true, isActive: true, companyId: true, company: { select: { suspendedAt: true, connectorsOff: true, salesSeePayments: true } } },
  });
  if (get("decision") !== "allow" || connectBlock(member) || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
    back.searchParams.set("error", "access_denied");
    return NextResponse.redirect(back, 303);
  }
  back.searchParams.set("code", await createAuthCode({ userId: actor.id, client, redirectUri, codeChallenge: challenge }));
  return NextResponse.redirect(back, 303);
}
