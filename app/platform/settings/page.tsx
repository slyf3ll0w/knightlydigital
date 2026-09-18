import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import { googleNativeClientIdFor, googleSignInAvailableFor } from "@/lib/sign-in-options";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const actor = await requirePageActor((a) => isManager(a.role));
  const companyId = actor.companyId;

  const [company, login, ua] = await Promise.all([
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
  ]);
  if (!company) redirect("/app/register");

  const { s } = await searchParams;
  const providers = new Set(login?.account?.identities.map((i) => i.provider) ?? []);

  return (
    <SettingsClient
      company={JSON.parse(JSON.stringify(company))}
      isOwner={actor.role === "OWNER"}
      initialSection={s}
      signInMethods={{
        // Legacy rows without an Account still sign in by their own hash.
        hasPassword: login?.account ? Boolean(login.account.passwordHash) : true,
        google: providers.has("google"),
        apple: providers.has("apple"),
        googleWebEnabled: googleSignInAvailableFor(ua),
        googleNativeClientId: googleNativeClientIdFor(ua),
      }}
    />
  );
}
