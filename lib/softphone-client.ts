/**
 * Browser-side state of the softphone (components/Softphone.tsx owns the
 * Telnyx WebRTC client and publishes here). Anything that wants to place a
 * call in the app or show its state — the Calls page dialer, "Call from
 * line" on a contact — subscribes with useSoftphone() and drives the call
 * through the `softphone` commands. No React context: the client lives once
 * in the platform layout and outlives every page.
 */

import { useSyncExternalStore } from "react";

export type SoftphoneStatus = "off" | "connecting" | "ready" | "error";

export type SoftphoneCall = {
  /** Our Call row id (known from the POST for outbound; from the INVITE header or a lookup for inbound). */
  callId: string | null;
  direction: "in" | "out";
  /** Who's on the other end: contact name, else formatted number. */
  label: string;
  number: string | null;
  contactId: string | null;
  /** ringing = incoming, not yet answered · dialing = outbound, customer not yet on · active · held */
  state: "ringing" | "dialing" | "active" | "held";
  /** When the conversation started (bridged), for the elapsed timer. */
  startedAt: number | null;
  muted: boolean;
};

export type MicState = "unknown" | "prompt" | "granted" | "denied";

export type SoftphoneState = {
  status: SoftphoneStatus;
  /** Why it's off: "voice" | "line" | "addon" | "role" | "disabled" | "native" | "unsupported" | "other_tab". */
  reason: string | null;
  call: SoftphoneCall | null;
  error: string | null;
  /** Microphone permission for this site — "prompt" means the browser will ask on the first call. */
  mic: MicState;
};

const INITIAL: SoftphoneState = { status: "off", reason: null, call: null, error: null, mic: "unknown" };
let state: SoftphoneState = INITIAL;
const listeners = new Set<() => void>();

export function getSoftphoneState(): SoftphoneState {
  return state;
}

export function setSoftphoneState(patch: Partial<SoftphoneState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function patchSoftphoneCall(patch: Partial<SoftphoneCall>): void {
  if (!state.call) return;
  setSoftphoneState({ call: { ...state.call, ...patch } });
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useSoftphone(): SoftphoneState {
  return useSyncExternalStore(subscribe, getSoftphoneState, () => INITIAL);
}

/** Ready to place a call right now: registered, and not already on one. */
export function softphoneIdle(s: SoftphoneState): boolean {
  return s.status === "ready" && !s.call;
}

export type PlaceCallTarget = { contactId?: string | null; to?: string | null; label?: string };

export type SoftphoneController = {
  answer(): void;
  decline(): void;
  hangup(): void;
  toggleMute(): void;
  toggleHold(): void;
  placeCall(target: PlaceCallTarget): Promise<void>;
  /** Ask the browser for the microphone now (needs a click), so the first call doesn't stall on the prompt. */
  requestMic(): Promise<boolean>;
  /** Touch-tones on the live call (phone menus: "press 1 for…"). Digits 0-9, * and #. */
  sendDigits(digits: string): void;
};

let controller: SoftphoneController | null = null;

export function registerSoftphoneController(c: SoftphoneController): () => void {
  controller = c;
  return () => {
    if (controller === c) controller = null;
  };
}

const notConnected = () => new Error("The softphone isn't connected.");

/** Commands any component may issue; no-ops (or a rejected promise) while nothing is registered. */
export const softphone = {
  answer: () => controller?.answer(),
  decline: () => controller?.decline(),
  hangup: () => controller?.hangup(),
  toggleMute: () => controller?.toggleMute(),
  toggleHold: () => controller?.toggleHold(),
  placeCall: (target: PlaceCallTarget): Promise<void> => (controller ? controller.placeCall(target) : Promise.reject(notConnected())),
  requestMic: (): Promise<boolean> => (controller ? controller.requestMic() : Promise.resolve(false)),
  sendDigits: (digits: string) => controller?.sendDigits(digits),
};

export function fmtElapsed(startedAt: number | null, now: number): string {
  if (!startedAt) return "0:00";
  const secs = Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}
