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

export function sendChannelsFrom(body: unknown, defaults: SendChannels): SendChannels {
  const o = (body ?? null) as Partial<Record<keyof SendChannels, unknown>> | null;
  return {
    email: typeof o?.email === "boolean" ? o.email : defaults.email,
    text: typeof o?.text === "boolean" ? o.text : defaults.text,
  };
}

export async function readSendChannels(req: NextRequest, defaults: SendChannels): Promise<SendChannels> {
  return sendChannelsFrom(await req.json().catch(() => null), defaults);
}

/**
 * The quote / invoice send routes' body: the channels plus
 * `expectScheduled` — set by the "Send now" link under a scheduled draft so
 * the send can refuse (409) when the sweep already claimed the row seconds
 * earlier, instead of mailing the client twice.
 */
export async function readSendRequest(
  req: NextRequest,
  defaults: SendChannels
): Promise<{ channels: SendChannels; expectScheduled: boolean }> {
  const body = (await req.json().catch(() => null)) as { expectScheduled?: unknown } | null;
  return { channels: sendChannelsFrom(body, defaults), expectScheduled: body?.expectScheduled === true };
}
