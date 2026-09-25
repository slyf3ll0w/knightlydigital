import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import { socialSignInFor } from "@/lib/sign-in-options";
import { lineSummary } from "@/lib/business-line";
import { LEGACY_SECTION_KEYS, settingsHref } from "@/lib/settings-nav";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const actor = await requirePageActor((a) => isManager(a.role));
  const companyId = actor.companyId;

  // Old section keys (?s=features / customization / business) still arrive
  // from notifications, emails and bookmarks — send them to the new panel.
  const { s } = await searchParams;
  if (s && LEGACY_SECTION_KEYS[s]) redirect(settingsHref(LEGACY_SECTION_KEYS[s]));

  const [company, login, ua, line, lastQuote, lastInvoice] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    // How this login can verify itself before the owner deletes the account
    // (components/VerifyIdentity.tsx): password, and/or a connected provider.
    prisma.user.findUnique({
      where: { id: actor.id },
      select: {
        account: { select: { passwordHash: true, identities: { select: { provider: true } } } },
      },
    }),
    headers().then((h) => h.get("user-agent")),
    // Business line card (Phone & texting): number, forwarding, 10DLC status
    lineSummary(companyId, { id: actor.id, name: actor.name }).catch(() => null),
    // Highest numbers used so far — the Numbering card shows what's next
    prisma.quote.aggregate({ where: { companyId }, _max: { quoteNumber: true } }),
    prisma.invoice.aggregate({ where: { companyId }, _max: { invoiceNumber: true } }),
  ]);
  if (!company) redirect("/app/register");

  const providers = new Set(login?.account?.identities.map((i) => i.provider) ?? []);

  return (
    <SettingsClient
      company={JSON.parse(JSON.stringify(company))}
      isOwner={actor.role === "OWNER"}
      initialSection={s}
      line={line}
      lastNumbers={{ quote: lastQuote._max.quoteNumber ?? 0, invoice: lastInvoice._max.invoiceNumber ?? 0 }}
      signInMethods={{
        // Legacy rows without an Account still sign in by their own hash.
        hasPassword: login?.account ? Boolean(login.account.passwordHash) : true,
        google: providers.has("google"),
        apple: providers.has("apple"),
        social: socialSignInFor(ua),
      }}
    />
  );
}
