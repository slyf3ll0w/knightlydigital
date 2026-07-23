import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor, roleLabel } from "@/lib/permissions";
import ProfileClient from "./ProfileClient";

export const metadata: Metadata = { title: "My Profile" };

export default async function ProfilePage() {
  const actor = await requirePageActor();

  const user = await prisma.user.findUnique({
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
  });

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
    />
  );
}
