import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { pricebookForIndustry } from "@/lib/pricebooks";

/**
 * Company creation shared by the two ways in:
 *  - /api/app/register — invite-code signup (and "New company" attach)
 *  - /api/public/apply — self-serve onboarding (application + account in one
 *    step; the company opens in pending-approval mode and is held at the
 *    /app/activate underwriting gate) — also serves the unlisted /invite
 *    page, where an invite code skips both
 *
 * Both paths seed the same defaults (branding, starter price book) and land
 * sign-in in the new company. Keeping this in one place stops the two signup
 * flows from drifting apart.
 */

/** Thrown when the invite was claimed by a concurrent signup using the same code. */
export class InviteClaimedError extends Error {}

export type SignupOwner =
  | { account: { id: string; email: string }; ownerName: string }
  | { newLogin: { email: string; hash: string; name: string } };

export function slugify(name: string) {
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

export async function createCompanySignup(opts: {
  companyName: string;
  industry?: string | null;
  owner: SignupOwner;
  /** Claim this invite atomically inside the transaction. */
  inviteId?: string | null;
  /** Stamp Company.accessPendingAt — self-serve signups awaiting review. */
  accessPending?: boolean;
  /**
   * Waive Finix underwriting (Company.paymentsWaived) — every invite-code
   * signup. Without this the new company is held at /app/activate until KYC
   * is done, which is exactly what an invite code is meant to skip.
   */
  paymentsWaived?: boolean;
  /** Link this AccessApplication to the new company (and the invite, if any). */
  applicationId?: string | null;
  /**
   * IANA zone captured from the signing-up browser (already validated by the
   * caller). Null keeps the schema default — every reminder, booking slot and
   * arrival window runs on this, so guessing wrong is a silent, hour-off bug.
   */
  timezone?: string | null;
}): Promise<{ companyId: string; userId: string }> {
  // uniqueSlug's check-then-create can race if two same-name companies
  // register in the same instant; the DB @unique constraint catches the
  // loser (P2002), so retry with a fresh suffix before giving up.
  for (let attempt = 0; ; attempt++) {
    const slug = await uniqueSlug(
      attempt === 0 ? slugify(opts.companyName) : `${slugify(opts.companyName)}-${attempt}`
    );
    try {
      return await createInTransaction(opts, slug);
    } catch (e) {
      const slugClash =
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002" &&
        (e.meta?.target as string[] | undefined)?.includes("slug");
      if (!slugClash || attempt >= 2) throw e;
    }
  }
}

function createInTransaction(
  opts: Parameters<typeof createCompanySignup>[0],
  slug: string
) {
  const { companyName, industry, owner, inviteId, accessPending, applicationId, paymentsWaived, timezone } =
    opts;
  return prisma.$transaction(async (tx) => {
    // Claim the invite atomically — a pre-check outside the transaction can
    // race a concurrent signup on the same code; the updateMany count settles it.
    if (inviteId) {
      const claimed = await tx.inviteCode.updateMany({
        where: { id: inviteId, usedAt: null, revokedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) throw new InviteClaimedError();
    }

    // Fresh signups get their Account (login) here; attaches reuse theirs.
    const accountId =
      "account" in owner
        ? owner.account.id
        : (
            await tx.account.create({
              data: { email: owner.newLogin.email, passwordHash: owner.newLogin.hash },
            })
          ).id;
    const ownerEmail = "account" in owner ? owner.account.email : owner.newLogin.email;
    const ownerName = "account" in owner ? owner.ownerName : owner.newLogin.name;

    // A Google sign-up carries a company-less placeholder membership until
    // it opens its business (lib/social-login.ts). That row BECOMES the
    // OWNER row rather than getting a sibling: the live session already
    // points at its id, and no orphan is left behind.
    const placeholder =
      "account" in owner
        ? await tx.user.findFirst({
            where: { accountId, companyId: null, isActive: true, role: { not: "SUPERADMIN" } },
            orderBy: { createdAt: "asc" },
            select: { id: true },
          })
        : null;

    const ownerRow = {
      email: ownerEmail,
      name: ownerName,
      accountId,
      role: "OWNER" as const,
      // A brand-new company IS its owner: they take the bookings until
      // there's a team to share them with (off by default for members
      // added later — owners opt those in from the Team page).
      bookable: true,
    };

    const company = await tx.company.create({
      data: {
        name: companyName,
        slug,
        // Default notification inbox: the owner's email, editable in Settings.
        email: ownerEmail,
        industry: industry || null,
        ...(timezone ? { timezone } : {}),
        accessPendingAt: accessPending ? new Date() : null,
        paymentsWaived: Boolean(paymentsWaived),
        // WorkBench default branding, seeded as real values so every surface
        // (app accent, client pages, emails) starts on-brand until the
        // company customizes: blue primary, orange secondary, white docs.
        brandColor: "#0B57D8",
        brandColorSecondary: "#F86808",
        documentColor: "#FFFFFF",
        sidebarTheme: "white",
        ...(placeholder ? {} : { users: { create: ownerRow } }),
        // Industry-matched starter price book; "Other"/unknown industries start empty
        workItems: { create: pricebookForIndustry(industry ?? undefined) },
      },
      include: { users: { select: { id: true } } },
    });

    let ownerUserId = company.users[0]?.id as string;
    if (placeholder) {
      await tx.user.update({
        where: { id: placeholder.id },
        data: { ...ownerRow, companyId: company.id },
      });
      ownerUserId = placeholder.id;
    }

    // Sign-in (and the switch after an in-app create) lands in the new company.
    await tx.account.update({
      where: { id: accountId },
      data: { lastActiveUserId: ownerUserId },
    });

    if (inviteId) {
      await tx.inviteCode.update({
        where: { id: inviteId },
        data: { usedByCompanyId: company.id },
      });
      // Tie the code to the application it admitted — but never steal the link
      // from a code that was minted for a different (legacy) application.
      if (applicationId) {
        await tx.inviteCode.updateMany({
          where: { id: inviteId, applicationId: null },
          data: { applicationId },
        });
      }
    }

    if (applicationId) {
      await tx.accessApplication.update({
        where: { id: applicationId },
        data: { companyId: company.id },
      });
    }

    return { companyId: company.id, userId: ownerUserId };
  });
}
