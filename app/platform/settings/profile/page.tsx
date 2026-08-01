import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor, roleLabel } from "@/lib/permissions";
import ProfileClient from "./ProfileClient";

export const metadata: Metadata = { title: "My Profile" };

export default async function ProfilePage() {
  const actor = await requirePageActor();

  const [user, pending] = await Promise.all([
    prisma.user.findUnique({
      where: { id: actor.id },
      select: {
        name: true,
        email: true,
        phone: true,
        role: true,
        avatarMime: true,
        emailSignature: true,
        company: { select: { name: true, phone: true, website: true } },
      },
    }),
    // An email change already sent and still waiting on the new address. An
    // expired one isn't pending — the user should be able to ask again.
    prisma.emailChangeToken.findFirst({
      where: { userId: actor.id, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { newEmail: true },
    }),
  ]);

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
    />
  );
}
