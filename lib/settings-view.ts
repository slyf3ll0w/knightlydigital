import { prisma } from "@/lib/db";
import { socialSignInFor } from "@/lib/sign-in-options";
import { lineSummary } from "@/lib/business-line";

/**
 * Everything the Settings pop-up (components/SettingsPopup.tsx) needs to
 * render SettingsClient — what app/platform/settings/page.tsx used to load
 * server-side, now fetched by the pop-up from GET /api/app/settings/view.
 * Managers only (the caller checks).
 */
export async function loadSettingsView(
  actor: { id: string; name: string | null; companyId: string; role: string },
  userAgent: string | null,
) {
  const companyId = actor.companyId;
  const [company, login, line, lastQuote, lastInvoice] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    // How this login can verify itself before the owner deletes the account
    // (components/VerifyIdentity.tsx): password, and/or a connected provider.
    prisma.user.findUnique({
      where: { id: actor.id },
      select: {
        account: { select: { passwordHash: true, identities: { select: { provider: true } } } },
      },
    }),
    // Business line card (Phone & texting): number, forwarding, 10DLC status
    lineSummary(companyId, { id: actor.id, name: actor.name }).catch(() => null),
    // Highest numbers used so far — the Numbering card shows what's next
    prisma.quote.aggregate({ where: { companyId }, _max: { quoteNumber: true } }),
    prisma.invoice.aggregate({ where: { companyId }, _max: { invoiceNumber: true } }),
  ]);
  if (!company) return null;

  const providers = new Set(login?.account?.identities.map((i) => i.provider) ?? []);
  return {
    company: JSON.parse(JSON.stringify(company)),
    isOwner: actor.role === "OWNER",
    line,
    lastNumbers: { quote: lastQuote._max.quoteNumber ?? 0, invoice: lastInvoice._max.invoiceNumber ?? 0 },
    signInMethods: {
      // Legacy rows without an Account still sign in by their own hash.
      hasPassword: login?.account ? Boolean(login.account.passwordHash) : true,
      google: providers.has("google"),
      apple: providers.has("apple"),
      social: socialSignInFor(userAgent),
    },
  };
}

export type SettingsView = NonNullable<Awaited<ReturnType<typeof loadSettingsView>>>;
