import { NextResponse } from "next/server";
import { getSuperadmin } from "@/lib/superadmin";
import { boardToMarkdown, loadBoard } from "@/lib/packaging-board";

/**
 * The board as markdown — the hand-off to whoever builds the pricing page
 * (the "Copy the plan" button, and scripts/read-packaging-board.mjs).
 * ?format=json returns the raw lanes instead.
 */
export async function GET(req: Request) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lanes = await loadBoard();
  if (new URL(req.url).searchParams.get("format") === "json") {
    return NextResponse.json({ lanes });
  }
  return new NextResponse(boardToMarkdown(lanes), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
