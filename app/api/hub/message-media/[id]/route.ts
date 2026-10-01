import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { mediaResponse } from "@/lib/message-media";

/** A thread attachment for the client: the hub token must open the thread the message sits on. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!token) return new Response(null, { status: 401 });
  const { id } = await params;
  const row = await prisma.portalMessageMedia.findUnique({
    where: { id },
    select: { message: { select: { contact: { select: { hubToken: true } } } } },
  });
  if (!row || row.message.contact.hubToken !== token) return new Response(null, { status: 404 });
  return mediaResponse(id);
}
