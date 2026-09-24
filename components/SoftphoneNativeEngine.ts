"use client";

import { fmtPhone } from "@/lib/format";
import { switchToMembership } from "@/lib/company-switch";
import {
  onVoip,
  rememberVoipToken,
  stashPendingVoipCall,
  takePendingVoipCall,
  type VoipCallSnapshot,
  type VoipIncoming,
  type VoipPlugin,
} from "@/lib/native-voip";
import {
  getSoftphoneState,
  patchSoftphoneCall,
  registerSoftphoneController,
  setSoftphoneState,
  type MicTestResult,
  type PlaceCallTarget,
  type SoftphoneCall,
} from "@/lib/softphone-client";

/**
 * The softphone on the iPhone: no WebRTC in the page. The native engine
 * (ios/App/App/VoipPlugin.swift) registers with Telnyx, rings the system
 * call screen and carries the audio — in the background too, which a web
 * page never could. This module keeps the call card in step with it and
 * turns the card's taps into engine calls (which go through CallKit, so the
 * system screen agrees).
 *
 * The one thing the page still owns is which company it is signed into: a
 * pushed call for another company on this login makes the engine
 * re-register as that membership on its own (the ready route says
 * `switch`), and the page follows for its UI — parks the call, switches,
 * reloads, and catches up from the engine's snapshot.
 */
export function startNativeSoftphone(voip: VoipPlugin, sessionUpdate: () => (data?: unknown) => Promise<unknown>): () => void {
  let stopped = false;
  const off: Array<() => void> = [];

  const toCard = (c: VoipIncoming & Partial<VoipCallSnapshot>): SoftphoneCall => ({
    callId: c.callId,
    direction: c.direction ?? "in",
    label: c.label || fmtPhone(c.number) || "Incoming call",
    number: c.number ?? null,
    contactId: null,
    state: c.held ? "held" : c.connected ? "active" : c.answered ? "active" : c.direction === "out" ? "dialing" : "ringing",
    startedAt: c.connected ? Date.now() : null,
    muted: c.muted ?? false,
  });

  const current = () => getSoftphoneState().call;
  const isCurrent = (callId: string) => current()?.callId === callId;

  /** Our own row is the truth about who this is (contact link, formatted number). */
  const nameCall = (callId: string) => {
    fetch(`/api/app/line/softphone/call?id=${encodeURIComponent(callId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { call?: { id: string; label: string; number: string; contactId: string | null } | null } | null) => {
        if (!j?.call || stopped || !isCurrent(callId)) return;
        patchSoftphoneCall({ label: j.call.label, number: j.call.number, contactId: j.call.contactId });
      })
      .catch(() => {});
  };

  /**
   * Whose call is this — ours as signed in, or another company's on this
   * login? The engine already handles the leg either way; this only keeps
   * the page's company in step so the card, the call screen and the client
   * link make sense.
   */
  let switching = false;
  const probeCompany = async (callId: string) => {
    try {
      const res = await fetch("/api/app/line/softphone/ready", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId, probe: true }),
      });
      const j = (await res.json().catch(() => ({}))) as { outcome?: string; userId?: string };
      if (stopped || j.outcome !== "switch" || !j.userId || switching) return;
      switching = true;
      const cur = current();
      stashPendingVoipCall({ callId, label: cur?.label ?? "Incoming call", number: cur?.number ?? null, answered: cur?.state === "active", at: Date.now() });
      await switchToMembership(sessionUpdate(), j.userId).catch(() => {
        switching = false;
      });
    } catch {
      /* offline for a moment: the engine carries the call regardless */
    }
  };

  // ── What the engine tells us ──────────────────────────────────────────────
  off.push(
    onVoip<{ token: string | null }>(voip, "voipToken", ({ token }) => {
      rememberVoipToken(token);
      if (!token) return;
      void fetch("/api/app/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "ios-voip", token }),
      }).catch(() => {});
    })
  );
  off.push(
    onVoip<{ ready: boolean; error?: string }>(voip, "engineState", ({ ready, error }) => {
      if (stopped) return;
      if (ready) {
        setSoftphoneState({ status: "ready", reason: null, error: null });
        return;
      }
      if (error === "signedOut") setSoftphoneState({ status: "off", reason: "disabled" });
      else if (error?.startsWith("off:")) setSoftphoneState({ status: "off", reason: error.slice(4) });
      else if (error) setSoftphoneState({ status: "error", error: "The phone couldn't connect to your business line — it will keep trying." });
      else setSoftphoneState({ status: "connecting" });
    })
  );
  off.push(
    onVoip<VoipIncoming>(voip, "incomingCall", (inc) => {
      if (stopped || !inc?.callId) return;
      // A second call while on one: the system screen shows it as call
      // waiting; the card keeps the call it has.
      if (current() && !isCurrent(inc.callId)) return;
      setSoftphoneState({ error: null, call: toCard(inc) });
      nameCall(inc.callId);
      void probeCompany(inc.callId);
    })
  );
  off.push(
    onVoip<{ callId: string }>(voip, "callAnswered", ({ callId }) => {
      if (stopped) return;
      if (!current()) {
        // Answered on the system screen before the page saw the call at all.
        setSoftphoneState({ call: { callId, direction: "in", label: "Incoming call", number: null, contactId: null, state: "active", startedAt: null, muted: false } });
        nameCall(callId);
        return;
      }
      if (isCurrent(callId)) patchSoftphoneCall({ state: "active" });
    })
  );
  off.push(
    onVoip<{ callId: string }>(voip, "callActive", ({ callId }) => {
      if (stopped || !isCurrent(callId)) return;
      const c = current();
      patchSoftphoneCall({ state: "active", startedAt: c?.startedAt ?? Date.now() });
    })
  );
  off.push(
    onVoip<{ callId: string; reason: string }>(voip, "callEnded", ({ callId, reason }) => {
      if (stopped || !isCurrent(callId)) return;
      setSoftphoneState({
        call: null,
        error:
          reason === "failed"
            ? "The call didn't reach the phone in time."
            : reason === "ineligible"
              ? "This phone can't take calls for that line right now."
              : null,
      });
    })
  );
  off.push(
    onVoip<{ callId: string; muted: boolean }>(voip, "muteChanged", ({ callId, muted }) => {
      if (!stopped && isCurrent(callId)) patchSoftphoneCall({ muted });
    })
  );
  off.push(
    onVoip<{ callId: string; held: boolean }>(voip, "holdChanged", ({ callId, held }) => {
      if (!stopped && isCurrent(callId)) patchSoftphoneCall({ state: held ? "held" : "active" });
    })
  );
  off.push(
    onVoip<{ on: boolean }>(voip, "speakerChanged", ({ on }) => {
      if (!stopped) setSoftphoneState({ speaker: on });
    })
  );

  // ── What the card asks of it ──────────────────────────────────────────────
  const withCall = (fn: (callId: string) => void) => {
    const id = current()?.callId;
    if (id) fn(id);
  };
  const unregister = registerSoftphoneController({
    answer: () => withCall((id) => void voip.answer({ callId: id })),
    decline: () => withCall((id) => void voip.endCall({ callId: id, reason: "declined" })),
    hangup: () => withCall((id) => void voip.endCall({ callId: id, reason: "user" })),
    toggleMute: () => withCall((id) => void voip.setMuted({ callId: id, muted: !current()?.muted })),
    toggleHold: () => withCall((id) => void voip.setHeld({ callId: id, held: current()?.state !== "held" })),
    toggleSpeaker: () => void voip.setSpeaker({ on: !getSoftphoneState().speaker }),
    placeCall: async (target: PlaceCallTarget) => {
      if (getSoftphoneState().status !== "ready") throw new Error("The phone isn't connected to your business line yet.");
      if (current()) throw new Error("You're already on a call.");
      const res = await fetch("/api/app/line/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: target.contactId ?? null, to: target.to ?? null, via: "app", device: "ios" }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; callId?: string; customerNumber?: string };
      if (!res.ok || !data.callId) throw new Error(data.error || "Couldn't place the call.");
      const label = target.label || fmtPhone(data.customerNumber) || "Calling…";
      setSoftphoneState({
        error: null,
        call: { callId: data.callId, direction: "out", label, number: data.customerNumber ?? null, contactId: target.contactId ?? null, state: "dialing", startedAt: null, muted: false },
      });
      await voip.placeCall({ callId: data.callId, label, number: data.customerNumber ?? null });
    },
    requestMic: async () => {
      const { granted } = await voip.requestMic().catch(() => ({ granted: false }));
      setSoftphoneState({
        mic: granted ? "granted" : "denied",
        error: granted ? null : "Microphone access was refused — allow it in Settings → WorkBench → Microphone, then reopen the app.",
      });
      return granted;
    },
    sendDigits: (digits: string) => {
      const clean = digits.replace(/[^0-9*#]/g, "");
      if (clean) withCall((id) => void voip.sendDigits({ callId: id, digits: clean }));
    },
    setMic: async () => {
      /* the phone's own microphone — nothing to choose */
    },
    testMic: async (): Promise<MicTestResult> => {
      const { granted } = await voip.requestMic().catch(() => ({ granted: false }));
      return { heard: granted, label: granted ? "iPhone microphone" : null, osMuted: false, error: granted ? null : "Allow the microphone in Settings → WorkBench." };
    },
  });

  // ── Start ─────────────────────────────────────────────────────────────────
  setSoftphoneState({ status: "connecting", reason: null, error: null, micDevices: [], micId: null, micLabel: null, micWarning: null, speaker: false });
  takePendingVoipCall(); // a company switch mid-call: the engine's snapshot below is the truth now
  void voip
    .currentCalls()
    .then(({ calls, ready, speaker }) => {
      if (stopped) return;
      if (typeof speaker === "boolean") setSoftphoneState({ speaker });
      const first = calls[0];
      if (first && !current()) {
        setSoftphoneState({ call: toCard(first) });
        nameCall(first.callId);
      }
      if (ready) setSoftphoneState({ status: "ready", reason: null });
    })
    .catch(() => {});
  void voip.register().catch(() => {});
  // The iPhone's one-time microphone prompt: the first time calls are on for
  // this device, not on the first Answer.
  void voip
    .requestMic()
    .then(({ granted }) => !stopped && setSoftphoneState({ mic: granted ? "granted" : "denied" }))
    .catch(() => {});

  return () => {
    stopped = true;
    off.forEach((f) => f());
    unregister();
    setSoftphoneState({ status: "off", reason: null, call: null, speaker: null });
  };
}
