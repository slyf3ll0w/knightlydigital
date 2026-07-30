import { NextResponse } from "next/server";

/**
 * Platform suspension (Company.suspendedAt, set from /superadmin).
 *
 * The policy, in one place so every client-facing route enforces the same
 * thing: a paused account stops taking on NEW commitments — payments, quote
 * approvals, signatures, new work requests — but documents the client was
 * already sent stay readable. Suspension is a platform action (nonpayment,
 * abuse, support hold); the client on the other end did nothing wrong, so
 * they're pointed back at the business rather than shown a platform error
 * they can't act on.
 *
 * Where it's enforced:
 *  - booking forms / slots  → lib/web-forms.ts resolveWebForm() returns null
 *                             (the form 404s, so the page and POST both die)
 *  - lead webhook           → 404, same as a bad token (ad platforms just see
 *                             a dead endpoint)
 *  - portal login           → silent no-op, same as an unknown email
 *  - pay / approve / sign /
 *    hub actions            → 503 from suspendedResponse() below
 */

export const SUSPENDED_NOTICE =
  "This business isn't accepting online activity right now. Please contact them directly.";

/**
 * 503 for a client-facing action on a paused account. Pass copy that fits the
 * action ("payments are unavailable…", "can't be approved online…") — the
 * client should always be told what to do next, which is contact the business.
 */
export function suspendedResponse(notice: string = SUSPENDED_NOTICE) {
  return NextResponse.json({ error: notice }, { status: 503 });
}
