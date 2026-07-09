import type { Metadata } from "next";
import Link from "next/link";
import { UserPlus, MessagesSquare } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import ChatClient from "./ChatClient";

export const metadata: Metadata = { title: "Team Chat" };

export default async function ChatPage() {
  const actor = await requirePageActor();

  const team = await prisma.user.findMany({
    where: { companyId: actor.companyId, isActive: true },
    select: { id: true, name: true, role: true, phone: true },
    orderBy: { createdAt: "asc" },
  });

  // Solo company: nothing to chat about — point managers at the Team page
  if (team.length <= 1) {
    return (
      <div className="p-4 lg:p-8 max-w-2xl mx-auto">
        <div className="card-ledger p-8 text-center">
          <MessagesSquare size={32} className="mx-auto text-gray-300" />
          <h1 className="mt-3 font-display text-lg font-semibold text-gray-900">Team Chat</h1>
          <p className="mt-1 text-sm text-gray-500">
            Chat opens up once your company has more than one team member.
          </p>
          {isManager(actor.role) && (
            <Link
              href="/app/settings/team"
              className="chamfer mt-5 inline-flex items-center gap-1.5 rounded bg-green-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-600"
            >
              <UserPlus size={14} />
              Add a team member
            </Link>
          )}
        </div>
      </div>
    );
  }

  const messages = (
    await prisma.teamMessage.findMany({
      where: { companyId: actor.companyId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        body: true,
        createdAt: true,
        userId: true,
        user: { select: { name: true } },
      },
    })
  ).reverse();

  // Opening the page marks everything read (the badge clears on next nav)
  await prisma.user.update({
    where: { id: actor.id },
    data: { chatLastSeenAt: new Date() },
  });

  return (
    <ChatClient
      meId={actor.id}
      team={team}
      initialMessages={messages.map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        userId: m.userId,
        userName: m.user.name,
      }))}
    />
  );
}
