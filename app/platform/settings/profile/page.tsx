import type { Metadata } from "next";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { canSell, requirePageActor, roleLabel } from "@/lib/permissions";
import { hasAddon } from "@/lib/addon";
import { voiceConfigured } from "@/lib/telnyx";
import { socialSignInFor } from "@/lib/sign-in-options";
import ProfileClient from "./ProfileClient";

export const metadata: Metadata = { title: "My Profile" };

export default async function ProfilePage() {
  const actor = await requirePageActor();

  const [user, pending, ua] = await Promise.all([
    prisma.user.findUnique({
      where: { id: actor.id },
      select: {
        name: true,
        email: true,
        phone: true,
        role: true,
        avatarMime: true,
        emailSignature: true,
        softphoneEnabled: true,
        company: { select: { name: true, phone: true, website: true, lineVoiceAppAt: true, addonActiveAt: true } },
        // The login behind this membership: whether it has a password, and
        // which third-party sign-ins are connected (Connected sign-ins card).
        account: {
          select: {
            passwordHash: true,
            identities: {
              orderBy: { createdAt: "asc" },
              select: { provider: true, email: true, createdAt: true, lastUsedAt: true },
            },
          },
        },
      },
    }),
    // An email change already sent and still waiting on the new address. An
    // expired one isn't pending — the user should be able to ask again.
    prisma.emailChangeToken.findFirst({
      where: { userId: actor.id, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { newEmail: true },
    }),
    headers().then((h) => h.get("user-agent")),
  ]);

  // The "Calls in the app" switch only means something once the line is on the voice app (lib/softphone.ts).
  const softphoneRelevant = Boolean(voiceConfigured() && user?.company?.lineVoiceAppAt && hasAddon(user.company) && canSell(actor.role));

  // What client emails fall back to while no custom signature is saved
  const defaultSignature = [
    user?.name,
    user?.company?.name,
    user?.company?.phone,
    user?.company?.website,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <ProfileClient
      userId={actor.id}
      hasAvatar={!!user?.avatarMime}
      name={user?.name ?? ""}
      email={user?.email ?? ""}
      phone={user?.phone ?? ""}
      roleLabel={roleLabel[user?.role ?? ""] ?? user?.role ?? ""}
      emailSignature={user?.emailSignature ?? ""}
      defaultSignature={defaultSignature}
      pendingEmail={pending?.newEmail ?? null}
      // Legacy rows without an Account still sign in by their own hash —
      // treat them as "has a password" so the change-password card shows.
      hasPassword={user?.account ? Boolean(user.account.passwordHash) : true}
      identities={(user?.account?.identities ?? []).map((i) => ({
        provider: i.provider,
        email: i.email,
        createdAt: i.createdAt.toISOString(),
        lastUsedAt: i.lastUsedAt?.toISOString() ?? null,
      }))}
      social={socialSignInFor(ua)}
      softphoneEnabled={softphoneRelevant ? (user?.softphoneEnabled ?? true) : null}
    />
  );
}
