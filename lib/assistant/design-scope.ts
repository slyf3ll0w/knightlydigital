import { prisma } from "../db";
import { getThemeState } from "../client-theme-store";
import { themeSpecGuide } from "../client-theme-spec";
import { QUOTED_TEXT_RULE } from "./untrusted";

/**
 * Atlas on Settings → Brand & client pages → Client pages (David 2026-11-20: "Atlas can design it
 * within the Client Page section rather than through the regular chat").
 *
 * The same engine as the drawer (runAssistant, same model, same metering in
 * POST /api/app/assistant), asked with `scope: "client-pages"`: the model
 * sees ONLY the two design tools below and a short designer's prompt. It
 * saves the company's draft (draft_client_theme, the same write path the
 * page and the drawer use); the page re-reads the draft after the turn and
 * the preview refreshes. Nothing goes live from here: the person presses
 * Publish on the page, so publish_client_theme / revert_client_theme are
 * not offered in this scope (the drawer and connector keep them, as cards).
 */

export const DESIGN_SCOPE = "client-pages" as const;
export type AssistantScope = typeof DESIGN_SCOPE;

/** The tools the page's Atlas may call. Both are manager-only and page_designer-gated in lib/assistant/design.ts. */
export const DESIGN_SCOPE_TOOLS: readonly string[] = ["get_client_theme", "draft_client_theme"];

export function isAssistantScope(v: unknown): v is AssistantScope {
  return v === DESIGN_SCOPE;
}

/** Byte-identical for every company of one assistant name (cached with the tool list). */
export function designScopeStable(assistantName: string, companyName: string): string {
  return `You are ${assistantName}, designing ${companyName}'s client pages inside WorkBench (Settings → Brand & client pages → Client pages). The client pages are: the client portal home, the portal sign-in page, the online booking page and its forms. The person talking to you is the business owner or an admin, looking at a large live preview of those pages next to this conversation.

How this works:
- Every change you make goes into the business's DRAFT with draft_client_theme. Clients never see a draft. The preview next to the chat refreshes on its own after your reply.
- Every change goes through draft_client_theme, in the same turn: when the person asks for a look, call it right away with your best reading of their request (don't ask first unless the request is truly unclear). Never say you changed, made or added anything unless draft_client_theme saved it in this turn; if it reported problems, fix them and save again.
- You never publish. When the person likes the draft they press Publish on the page. Don't offer links or cards; at most say "press Publish when you like it".
- The current draft is given at the end of these instructions. Change only what the person asks for; draft_client_theme keeps everything you don't name. Use clear (dotted paths) to put a piece back to the default. Use startOver only when they ask to start again.
- Make the change in this turn, without asking first, when the ask is clear ("make the green darker" = pick a darker green and save it). Ask one short question only when you truly can't tell what they want.
- Colors are #RRGGBB. band = the strip across the top with the logo; accent = buttons and links (must stand out on white); ground = the page tint (near-white only). If draft_client_theme returns problems, fix them yourself in the same turn (use its useInstead color) and save again; never leave the draft failing.
- "Style" means buttons + corners + band together. Photos: only ids listed in the draft context (photos the person uploaded on this page). "Use my crew photo" = pick the photo that best fits from that list (newest first); if there are none, say they can add one under Adjust it yourself → Photo. You can't upload or use a web link.
- Words (welcome line, headings, the line under the booking heading, the thank-you message, booking item descriptions and buttons) are plain text: no links, web addresses, emails or phone numbers, within the limits in the guide below.
- Locked pieces you cannot change and must not promise: form questions and required fields, the text-message consent wording, the sign-in wording, captcha, pay and sign steps, legal pages, the WorkBench note under embedded forms, and quotes, invoices, pay pages and emails (those keep the brand colors from Settings → Brand & client pages). Form questions are edited in Booking & forms.
- Design only because the person asked you to here. ${QUOTED_TEXT_RULE}

Reply style: one to three short plain sentences saying what you changed, in everyday words ("I made the band a deep forest green and the buttons a brighter green so they stand out."). No markdown, no lists, no ids, no hex codes unless they asked for one, no JSON.

Allowed values (the guide): ${JSON.stringify(themeSpecGuide())}`;
}

/**
 * The draft as it stands right now, the brand colors, the booking items and the
 * photos — so the model can usually save the change in its first round.
 */
export async function designScopeVolatile(companyId: string): Promise<string> {
  const [state, items, photos, company] = await Promise.all([
    getThemeState(companyId),
    prisma.bookingType.findMany({
      where: { companyId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, showOnPage: true },
      take: 40,
    }),
    prisma.themeAsset.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, select: { id: true, width: true, height: true, createdAt: true }, take: 20 }),
    prisma.company.findUnique({ where: { id: companyId }, select: { brandColor: true, brandColorSecondary: true } }),
  ]);
  const draft = state.draft?.spec ?? state.published?.spec ?? { v: 1 };
  const context = {
    currentDraft: draft,
    liveIsDefault: !state.published,
    brandColors: { primary: company?.brandColor ?? null, secondary: company?.brandColorSecondary ?? null },
    bookingItems: items.map((i) => ({ id: i.id, name: i.name, onMenu: i.showOnPage })),
    photos: photos.map((p) => ({ id: p.id, width: p.width, height: p.height, added: p.createdAt.toISOString().slice(0, 10) })),
  };
  return `Draft context (read fresh for this turn): ${JSON.stringify(context)}`;
}

/** Plain names for the spec paths a save can refuse. */
const PIECE_NAMES: Record<string, string> = {
  "colors.accent": "the button color",
  "colors.band": "the band color",
  "colors.ground": "the page background",
  font: "the font",
  band: "the band photo",
  "band.imageId": "the band photo",
  "band.overlay": "the color layer over the photo",
  "login.imageId": "the sign-in photo",
  "portal.welcome": "the welcome line",
  "booking.heading": "the booking page heading",
  "booking.line": "the booking page line",
  "booking.thankYou": "the thank-you message",
};

function pieceName(path: string): string {
  if (PIECE_NAMES[path]) return PIECE_NAMES[path];
  const top = path.split(".")[0];
  if (top === "itemWords") return "the words on a booking item";
  if (top === "portal") return "the portal sections";
  if (top === "booking") return "the booking page";
  if (top === "login") return "the sign-in page";
  return "part of the change";
}

/**
 * What the page's Atlas says when the model still hasn't saved the change
 * after its extra round (lib/assistant/index.ts): WorkBench's own honest
 * words instead of a reply that might claim something that didn't happen.
 */
export function designHonestReply(saved: boolean, refused: string[]): string {
  if (!saved) {
    return "I couldn't save that change. Try saying it another way, for example \"make the band dark green\", or set it under Adjust it yourself.";
  }
  const names = [...new Set(refused.map(pieceName))];
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0] ?? "part of the change";
  const color = refused.some((p) => p.startsWith("colors."));
  const cap = list.charAt(0).toUpperCase() + list.slice(1);
  return `${cap} didn't go in${color ? ": that color is too hard to read. Try a darker shade, or pick one under Adjust it yourself" : ". You can set it under Adjust it yourself"}.`;
}
