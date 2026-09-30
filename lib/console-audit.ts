import { prisma } from "@/lib/db";
import type { SuperadminUser } from "@/lib/superadmin";

/**
 * The platform console's audit trail (ConsoleAudit): every account action a
 * superadmin takes, with who and when. There are two superadmins now, so
 * "who suspended this / who granted that" has to be answerable from the
 * console itself, not from Railway logs. Fire-and-forget on purpose — an
 * action never fails because its bookkeeping did (the console.warn lines the
 * routes already print remain the belt to this suspender).
 */
export function logConsoleAction(
  admin: SuperadminUser,
  action: string,
  opts: { company?: { id: string; name: string } | null; detail?: string | null } = {}
): void {
  prisma.consoleAudit
    .create({
      data: {
        superadminId: admin.id,
        superadminName: admin.name || admin.email,
        companyId: opts.company?.id ?? null,
        companyName: opts.company?.name ?? null,
        action,
        detail: opts.detail?.trim().slice(0, 1000) || null,
      },
      select: { id: true },
    })
    .catch((err: unknown) => {
      console.error("[console-audit] write failed", err);
    });
}

export type ConsoleAuditRow = {
  id: string;
  superadminName: string;
  companyId: string | null;
  companyName: string | null;
  action: string;
  detail: string | null;
  createdAt: Date;
};

/** Newest first; company-scoped when an id is given, platform-wide otherwise. */
export function consoleAuditFor(companyId: string | null, take = 40): Promise<ConsoleAuditRow[]> {
  return prisma.consoleAudit.findMany({
    where: companyId ? { companyId } : undefined,
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      superadminName: true,
      companyId: true,
      companyName: true,
      action: true,
      detail: true,
      createdAt: true,
    },
  });
}

/** Plain-words labels for the trail. Unknown actions fall back to the raw key. */
const LABELS: Record<string, string> = {
  suspend: "Suspended the account",
  reinstate: "Reinstated the account",
  delete: "Deleted the account",
  "mark-test": "Marked as a test account",
  "mark-live": "Marked as a live account",
  "waive-payments": "Waived payment verification",
  "require-payments": "Required payment verification",
  "assistant-on": "Whitelisted Atlas (full)",
  "assistant-off": "Turned Atlas off",
  "assistant-default": "Reset Atlas to the default policy",
  "atlas-plan-grant": "Granted the Atlas paid plan",
  "atlas-plan-revoke": "Revoked the Atlas paid plan",
  "atlas-plan-reset": "Refilled the Atlas plan period",
  "atlas-free-reset": "Refilled the Atlas free tier",
  "addon-show": "Showed the Voice add-on",
  "addon-hide": "Hid the Voice add-on",
  "addon-grant": "Granted the Voice entitlement",
  "addon-revoke": "Revoked the Voice entitlement",
  "plan-grant": "Granted a plan",
  "plan-revoke": "Revoked a plan",
  "line-attach": "Attached a business-line number",
  "line-keep": "Cancelled the line release",
  "line-voice-sync": "Moved the line onto the voice app",
  "line-file": "Filed the texting registration",
  "line-appeal": "Appealed the texting campaign",
  "line-keywords": "Set brand-named STOP/HELP replies",
  "line-release": "Released the business-line number",
  "application-approve": "Approved the application",
  "application-reject": "Rejected the application",
  "invite-create": "Created an invite code",
  "invite-revoke": "Revoked an invite code",
  "feedback-approve": "Posted feedback to the board",
  "feedback-resolve": "Resolved a feedback ticket",
  "feedback-decline": "Declined a feedback ticket",
  "feedback-reply": "Replied to a feedback ticket",
  "feedback-reopen": "Reopened a feedback ticket",
  "feedback-delete": "Deleted a feedback ticket",
  "library-remove": "Removed a Library listing",
  "library-restore": "Restored a Library listing",
  "finix-import": "Imported a Finix Net Profit report",
};

export function consoleActionLabel(action: string): string {
  return LABELS[action] ?? action;
}
