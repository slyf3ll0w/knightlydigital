"use client";

/**
 * "Call" means the business line whenever the company has one.
 *
 * Every Call button in the app used to be a plain tel: link — the phone's
 * own dialer, from the tech's personal cell. Once a company has a business
 * line on the voice app (lib/voice.ts), that is the wrong default: on a
 * phone it pops the OS "which app?" chooser and the client sees a personal
 * number. So the platform layout publishes one flag here (LineCalling.tsx
 * sets it from the same predicate that mounts the softphone), and every
 * Call surface — components/CallLink.tsx, the row quick-menus, the swipe
 * trays — reads it: on → the call goes out from the line, off → tel:.
 *
 * placeLineCall() is the one way out from the line, shared by the buttons:
 *   softphone registered in this tab (browser, Android shell, iPhone engine)
 *     → the tab places the call itself ("app")
 *   otherwise → the tier-1 flow: the server rings the signed-in user's cell
 *     first, whispers who they're about to call, then rings the client and
 *     bridges ("cell") — so the UI's whole job is to say "pick up your phone".
 *
 * No React context, same as lib/softphone-client.ts: one module-level store,
 * useSyncExternalStore on top.
 */

import { useSyncExternalStore } from "react";
import { fmtPhone } from "@/lib/format";
import {
  getSoftphoneState,
  softphone,
  softphoneElsewhere,
  softphoneIdle,
  softphoneRecoverable,
  waitForSoftphone,
  type PlaceCallTarget,
  type SoftphoneState,
  SOFTPHONE_WAIT_MS,
} from "@/lib/softphone-client";

/* ── The flag ─────────────────────────────────────────────────────────── */

let enabled = false;
const flagListeners = new Set<() => void>();

/** Set once by components/LineCalling.tsx in the platform layout. */
export function setLineCalling(on: boolean): void {
  if (enabled === on) return;
  enabled = on;
  flagListeners.forEach((l) => l());
}

export function lineCallingEnabled(): boolean {
  return enabled;
}

const subscribeFlag = (l: () => void) => {
  flagListeners.add(l);
  return () => {
    flagListeners.delete(l);
  };
};

/** True when Call buttons should dial from the business line instead of tel:. False during SSR and until the layout says so. */
export function useLineCalling(): boolean {
  return useSyncExternalStore(subscribeFlag, () => enabled, () => false);
}

/* ── Placing the call ─────────────────────────────────────────────────── */

export type LineCallResult = { via: "app" } | { via: "cell"; agentNumber: string | null };

/**
 * Place a call from the business line. Resolves once the call is on its way
 * (in this tab, or ringing the cell); rejects with a message fit to show.
 */
export async function placeLineCall(target: PlaceCallTarget): Promise<LineCallResult> {
  const sp = getSoftphoneState();
  let viaApp = softphoneIdle(sp);
  if (!viaApp && (softphoneRecoverable(sp) || softphoneElsewhere(sp))) {
    // Registered a moment ago and lost it, or another tab holds the line:
    // bring it here first (up to 12 s — a fresh grant, the SDK chunk and
    // the socket on a slow link), so the call goes out from this browser
    // rather than surprising the caller with their cell.
    if (softphoneElsewhere(sp)) softphone.takeOver();
    else softphone.reconnect();
    viaApp = (await waitForSoftphone(SOFTPHONE_WAIT_MS)) && softphoneIdle(getSoftphoneState());
    if (!viaApp && softphoneElsewhere(getSoftphoneState())) {
      throw new Error("Your other WorkBench tab kept the line — it may be on a call. Call from that tab, or close it and try again.");
    }
  }
  if (viaApp) {
    await softphone.placeCall(target);
    return { via: "app" };
  }
  const st = getSoftphoneState();
  console.info(`[softphone] call button: placing the call via the cell (softphone ${st.status}${st.reason ? ` ${st.reason}` : ""})`);
  const res = await fetch("/api/app/line/call", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(target.contactId ? { contactId: target.contactId } : { to: target.to ?? null }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; agentNumber?: string | null };
  if (!res.ok) throw new Error(data.error || "Couldn't place the call.");
  return { via: "cell", agentNumber: data.agentNumber ?? null };
}

/** The hover text for a Call control that dials from the line — what will happen when it is pressed. */
export function lineCallTitle(sp: SoftphoneState, who: string, agentPhone = ""): string {
  if (softphoneIdle(sp) || (sp.status === "ready" && sp.call)) return `Call ${who} from this device. They see your business number.`;
  if (softphoneElsewhere(sp)) return `Your line is in another WorkBench tab — it's brought here first, then ${who} is called from this browser.`;
  if (softphoneRecoverable(sp)) return `The browser is reconnecting to your line — it tries that first, then rings ${agentPhone || "your cell"}.`;
  return `Ring ${agentPhone || "your cell"} first, then connect ${who}. They see your business number.`;
}

/* ── The notice (a toast, since most Call controls have no room of their own) ── */

export type LineCallNotice = {
  id: number;
  kind: "ringing" | "error";
  title: string;
  sub: string;
};

let notice: LineCallNotice | null = null;
let noticeSeq = 0;
const noticeListeners = new Set<() => void>();

function setNotice(n: LineCallNotice | null) {
  notice = n;
  noticeListeners.forEach((l) => l());
}

const subscribeNotice = (l: () => void) => {
  noticeListeners.add(l);
  return () => {
    noticeListeners.delete(l);
  };
};

export function useLineCallNotice(): LineCallNotice | null {
  return useSyncExternalStore(subscribeNotice, () => notice, () => null);
}

export function dismissLineCallNotice(id: number): void {
  if (notice?.id === id) setNotice(null);
}

/**
 * Straight to the cell flow, skipping the softphone: what the softphone
 * itself falls back to when its own leg never reaches this browser
 * (components/Softphone.tsx) — the person pressed Call once and gets a
 * ringing phone, not an error to read and a button to press again.
 */
export async function callViaCell(target: PlaceCallTarget, why?: string): Promise<void> {
  const who = target.label || (target.to ? fmtPhone(target.to) : "the client");
  try {
    const res = await fetch("/api/app/line/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(target.contactId ? { contactId: target.contactId } : { to: target.to ?? null }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; agentNumber?: string | null };
    if (!res.ok) throw new Error(data.error || "Couldn't place the call.");
    setNotice({
      id: ++noticeSeq,
      kind: "ringing",
      title: why ? `${why} Pick up your phone` : "Pick up your phone",
      sub: `Ringing ${data.agentNumber ? fmtPhone(data.agentNumber) : "your cell"} — press 1 to connect ${who}.`,
    });
  } catch (err) {
    setNotice({
      id: ++noticeSeq,
      kind: "error",
      title: "Couldn't place the call",
      sub: err instanceof Error ? err.message : "Something went wrong. Please try again.",
    });
  }
}

/**
 * The fire-and-forget form for controls without their own state (a menu
 * item, a swipe tray, a number in a card): places the call and reports
 * through the notice — a "pick up your phone" banner for the cell flow,
 * the error otherwise. Calls placed in this tab need no banner: the
 * softphone's own call card takes over.
 */
export async function callFromLine(target: PlaceCallTarget): Promise<void> {
  const who = target.label || (target.to ? fmtPhone(target.to) : "the client");
  try {
    const out = await placeLineCall(target);
    if (out.via === "cell") {
      setNotice({
        id: ++noticeSeq,
        kind: "ringing",
        title: "Pick up your phone",
        sub: `Ringing ${out.agentNumber ? fmtPhone(out.agentNumber) : "your cell"} — press 1 to connect ${who}.`,
      });
    }
  } catch (err) {
    setNotice({
      id: ++noticeSeq,
      kind: "error",
      title: "Couldn't place the call",
      sub: err instanceof Error ? err.message : "Something went wrong. Please try again.",
    });
  }
}
