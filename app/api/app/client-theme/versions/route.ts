import { NextResponse } from "next/server";
import { getThemeState, themeStateJson } from "@/lib/client-theme-store";
import { themeActor } from "@/lib/client-theme-route";

/** GET — the company's client-page look history, newest first (History drawer). Owners/admins on Pro. */
export async function GET() {
  const who = await themeActor();
  if ("error" in who) return who.error;
  const state = themeStateJson(await getThemeState(who.actor.companyId));
  return NextResponse.json({ publishedId: state.published?.id ?? null, versions: state.versions });
}
