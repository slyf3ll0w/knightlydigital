import type { NextRequest } from "next/server";

/**
 * Which way a client-facing document goes out — email, a text from the
 * business line, or both (David 2026-10-03: "an option to text it, only if
 * the business line is active; this should be the case for all things that
 * are sent"). The send routes read the choice from the request body; a
 * request with no body (a list row's quick action, Atlas, an older client)
 * gets the route's own default, which is today's behaviour.
 */
export type SendChannels = { email: boolean; text: boolean };

export async function readSendChannels(req: NextRequest, defaults: SendChannels): Promise<SendChannels> {
  const body = (await req.json().catch(() => null)) as Partial<Record<keyof SendChannels, unknown>> | null;
  return {
    email: typeof body?.email === "boolean" ? body.email : defaults.email,
    text: typeof body?.text === "boolean" ? body.text : defaults.text,
  };
}
