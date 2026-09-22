"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mic, MicOff, Pause, Phone, PhoneIncoming, PhoneOff, Play, X } from "lucide-react";
import { nativePlatform } from "@/components/NativeShell";
import {
  fmtElapsed,
  getSoftphoneState,
  patchSoftphoneCall,
  registerSoftphoneController,
  setSoftphoneState,
  softphone,
  useSoftphone,
  type PlaceCallTarget,
  type SoftphoneCall,
} from "@/lib/softphone-client";
import type { TelnyxRTC as TelnyxRTCType } from "@telnyx/webrtc";

/**
 * The business line, in the browser (tier 2 — lib/softphone.ts). Mounted
 * once in the platform layout for a company whose number is on the voice
 * app. It registers a Telnyx WebRTC client with a per-user credential and
 * from then on Call Control can ring this tab:
 *
 *   inbound   an INVITE arrives → ringer + Answer/Decline card. Answering
 *             bridges the customer here; declining (or 15 s of silence in
 *             every browser) sends the call on to the cell.
 *   outbound  placeCall() POSTs to /api/app/line/call with via:"app"; the
 *             server dials THIS browser (X-WB-Call-Id header) and the tab
 *             auto-answers, hears ringback, and is bridged when the
 *             customer picks up.
 *
 * Presence is a heartbeat every 30 s while registered and a beacon on
 * pagehide (lib/softphone.ts decides who rings from it). Native shells
 * never register — a phone is a cell until tier 3 (CallKit / foreground
 * service) — and neither does a browser without WebRTC.
 */

type RtcClient = TelnyxRTCType;
type RtcCall = ReturnType<TelnyxRTCType["newCall"]>;

const HEARTBEAT_MS = 30_000;
const REMOTE_AUDIO_ID = "wb-softphone-audio";
/** An outbound INVITE that hasn't shown up this long after the POST means the registration dropped. */
const OUTBOUND_INVITE_WAIT_MS = 25_000;

const fmtNumber = (e164: string | null | undefined): string => {
  const d = (e164 ?? "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}` : (e164 ?? "");
};

const header = (call: RtcCall, name: string): string | null => {
  const list = (call.options as { customHeaders?: Array<{ name: string; value: string }> }).customHeaders ?? [];
  return list.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
};

/** North-American ring cadence (440+480 Hz, 2 s on / 4 s off) on Web Audio — no asset to load. */
class Ringer {
  private ctx: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  start() {
    if (this.timer) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    try {
      this.ctx = this.ctx ?? new Ctx();
      void this.ctx.resume().catch(() => {});
    } catch {
      return;
    }
    const burst = () => {
      const ctx = this.ctx;
      if (!ctx || ctx.state !== "running") return;
      const gain = ctx.createGain();
      gain.gain.value = 0.08;
      gain.connect(ctx.destination);
      for (const f of [440, 480]) {
        const osc = ctx.createOscillator();
        osc.frequency.value = f;
        osc.connect(gain);
        osc.start();
        osc.stop(ctx.currentTime + 1.6);
      }
      setTimeout(() => gain.disconnect(), 1800);
    };
    burst();
    this.timer = setInterval(burst, 4000);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export default function Softphone() {
  const state = useSoftphone();
  const clientRef = useRef<RtcClient | null>(null);
  const callRef = useRef<RtcCall | null>(null);
  const pendingOutbound = useRef<{ callId: string; at: number } | null>(null);
  const ringer = useRef<Ringer | null>(null);

  useEffect(() => {
    if (nativePlatform()) {
      setSoftphoneState({ status: "off", reason: "native" });
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      setSoftphoneState({ status: "off", reason: "unsupported" });
      return;
    }
    ringer.current = ringer.current ?? new Ringer();
    let cancelled = false;
    let client: RtcClient | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let inviteWatch: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const beat = (online: boolean) =>
      fetch("/api/app/line/softphone/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ online }),
        keepalive: true,
      }).catch(() => {});
    const stopHeartbeat = () => {
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
    };
    const teardownClient = () => {
      stopHeartbeat();
      const c = client;
      client = null;
      clientRef.current = null;
      try {
        c?.disconnect();
      } catch {
        /* already gone */
      }
    };
    const scheduleRetry = () => {
      if (cancelled) return;
      if (retry) clearTimeout(retry);
      // Don't yank a live conversation for a signaling hiccup; try again after it ends.
      const delay = callRef.current ? 30_000 : Math.min(60_000, 3_000 * 2 ** Math.min(attempt++, 5));
      retry = setTimeout(() => {
        teardownClient();
        void connect();
      }, delay);
    };

    const stopRinger = () => {
      ringer.current?.stop();
      if (document.title.startsWith("☎ ")) document.title = document.title.slice(2);
    };

    const endCall = (call: RtcCall) => {
      if (callRef.current !== call) return;
      callRef.current = null;
      stopRinger();
      setSoftphoneState({ call: null });
    };

    const onIncoming = (call: RtcCall) => {
      // One call at a time: a second INVITE while busy is declined; the server rings the cell / voicemail as usual.
      if (callRef.current && callRef.current !== call) {
        void call.hangup();
        return;
      }
      callRef.current = call;
      const callId = header(call, "X-WB-Call-Id");
      const pending = pendingOutbound.current;
      const outbound =
        header(call, "X-WB-Outbound") === "1" ||
        (pending !== null && (callId === pending.callId || Date.now() - pending.at < OUTBOUND_INVITE_WAIT_MS));
      if (outbound) {
        // Our own outbound call arriving at this tab: pick up, the server dials the customer next.
        pendingOutbound.current = null;
        if (inviteWatch) clearTimeout(inviteWatch);
        const current = getSoftphoneState().call;
        setSoftphoneState({
          error: null,
          call: {
            callId: callId ?? current?.callId ?? pending?.callId ?? null,
            direction: "out",
            label: current?.label || call.options.remoteCallerName || fmtNumber(call.options.remoteCallerNumber) || "Calling…",
            number: current?.number ?? call.options.remoteCallerNumber ?? null,
            contactId: current?.contactId ?? null,
            state: "dialing",
            startedAt: null,
            muted: false,
          },
        });
        void call.answer();
        return;
      }
      setSoftphoneState({
        error: null,
        call: {
          callId,
          direction: "in",
          label: call.options.remoteCallerName || fmtNumber(call.options.remoteCallerNumber) || "Incoming call",
          number: call.options.remoteCallerNumber ?? null,
          contactId: null,
          state: "ringing",
          startedAt: null,
          muted: false,
        },
      });
      ringer.current?.start();
      if (!document.title.startsWith("☎ ")) document.title = `☎ ${document.title}`;
      // Our own row is the truth about who this is (contact link, formatted number).
      fetch(`/api/app/line/softphone/call${callId ? `?id=${encodeURIComponent(callId)}` : ""}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { call?: { id: string; label: string; number: string; contactId: string | null } | null } | null) => {
          if (!j?.call || callRef.current !== call) return;
          patchSoftphoneCall({ callId: j.call.id, label: j.call.label, number: j.call.number, contactId: j.call.contactId });
        })
        .catch(() => {});
    };

    const onCallUpdate = (call: RtcCall) => {
      switch (call.state) {
        case "ringing":
          onIncoming(call);
          return;
        case "active": {
          if (callRef.current !== call) return;
          stopRinger();
          const cur = getSoftphoneState().call;
          if (cur?.direction === "out" && cur.state === "dialing") {
            // The tab is live but the customer isn't yet: keep "Calling…" until the row says bridged (polled below).
            patchSoftphoneCall({ muted: call.isAudioMuted });
          } else {
            patchSoftphoneCall({ state: "active", startedAt: cur?.startedAt ?? Date.now(), muted: call.isAudioMuted });
          }
          return;
        }
        case "held":
          if (callRef.current === call) patchSoftphoneCall({ state: "held" });
          return;
        case "hangup":
        case "destroy":
        case "purge":
          endCall(call);
          return;
        default:
          return;
      }
    };

    async function connect() {
      if (cancelled) return;
      setSoftphoneState({ status: "connecting" });
      let grant: { token?: string; off?: string; error?: string };
      try {
        const res = await fetch("/api/app/line/softphone", { cache: "no-store" });
        grant = (await res.json().catch(() => ({}))) as typeof grant;
        if (!res.ok) throw new Error(grant.error || "Couldn't start the softphone.");
      } catch (err) {
        setSoftphoneState({ status: "error", error: err instanceof Error ? err.message : "Couldn't start the softphone." });
        scheduleRetry();
        return;
      }
      if (cancelled) return;
      if (grant.off || !grant.token) {
        setSoftphoneState({ status: "off", reason: grant.off ?? "voice" });
        return;
      }
      const { TelnyxRTC } = await import("@telnyx/webrtc");
      if (cancelled) return;
      client = new TelnyxRTC({ login_token: grant.token });
      client.remoteElement = REMOTE_AUDIO_ID;
      client.on("telnyx.ready", () => {
        attempt = 0;
        setSoftphoneState({ status: "ready", error: null, reason: null });
        void beat(true);
        stopHeartbeat();
        heartbeat = setInterval(() => void beat(true), HEARTBEAT_MS);
      });
      client.on("telnyx.error", (err: unknown) => {
        console.warn("[softphone] error:", err);
      });
      client.on("telnyx.socket.close", () => {
        stopHeartbeat();
        if (cancelled) return;
        void beat(false);
        setSoftphoneState({ status: "connecting" });
        scheduleRetry();
      });
      client.on("telnyx.notification", (n: { type: string; call?: RtcCall; error?: Error }) => {
        if (n.type === "callUpdate" && n.call) onCallUpdate(n.call);
        else if (n.type === "userMediaError") {
          setSoftphoneState({ error: "Microphone blocked — allow it for this site in the browser, then try again." });
        }
      });
      clientRef.current = client;
      try {
        await client.connect();
      } catch (err) {
        console.warn("[softphone] connect failed:", err);
        scheduleRetry();
      }
    }

    const unregister = registerSoftphoneController({
      answer: () => {
        const c = callRef.current;
        if (!c || c.state !== "ringing") return;
        stopRinger();
        void c.answer();
      },
      decline: () => void callRef.current?.hangup(),
      hangup: () => void callRef.current?.hangup(),
      toggleMute: () => {
        const c = callRef.current;
        if (!c) return;
        if (c.isAudioMuted) c.unmuteAudio();
        else c.muteAudio();
        patchSoftphoneCall({ muted: c.isAudioMuted });
      },
      toggleHold: () => {
        const c = callRef.current;
        if (!c) return;
        if (c.state === "held") void c.unhold().then(() => patchSoftphoneCall({ state: "active" }));
        else void c.hold();
      },
      placeCall: async (target: PlaceCallTarget) => {
        if (!clientRef.current || getSoftphoneState().status !== "ready") throw new Error("The softphone isn't connected.");
        if (callRef.current) throw new Error("You're already on a call.");
        const res = await fetch("/api/app/line/call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId: target.contactId ?? null, to: target.to ?? null, via: "app" }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; callId?: string; customerNumber?: string };
        if (!res.ok || !data.callId) throw new Error(data.error || "Couldn't place the call.");
        pendingOutbound.current = { callId: data.callId, at: Date.now() };
        setSoftphoneState({
          error: null,
          call: {
            callId: data.callId,
            direction: "out",
            label: target.label || fmtNumber(data.customerNumber) || "Calling…",
            number: data.customerNumber ?? null,
            contactId: target.contactId ?? null,
            state: "dialing",
            startedAt: null,
            muted: false,
          },
        });
        if (inviteWatch) clearTimeout(inviteWatch);
        inviteWatch = setTimeout(() => {
          if (pendingOutbound.current?.callId !== data.callId) return;
          pendingOutbound.current = null;
          if (!callRef.current) {
            setSoftphoneState({ call: null, error: "The call never reached this browser — reconnecting. Try again in a moment." });
            scheduleRetry();
          }
        }, OUTBOUND_INVITE_WAIT_MS);
      },
    });

    const goodbye = () => {
      try {
        navigator.sendBeacon("/api/app/line/softphone/presence", new Blob([JSON.stringify({ online: false })], { type: "application/json" }));
      } catch {
        /* nothing to do */
      }
    };
    window.addEventListener("pagehide", goodbye);
    void connect();

    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", goodbye);
      if (retry) clearTimeout(retry);
      if (inviteWatch) clearTimeout(inviteWatch);
      unregister();
      stopRinger();
      goodbye();
      teardownClient();
      setSoftphoneState({ status: "off", reason: null, call: null });
    };
  }, []);

  // Outbound: "Calling…" until our row says the customer is on (bridged).
  const outCallId = state.call?.direction === "out" && state.call.state === "dialing" ? state.call.callId : null;
  useEffect(() => {
    if (!outCallId) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/app/line/softphone/call?id=${encodeURIComponent(outCallId)}`, { cache: "no-store" });
        const j = (await res.json()) as { call?: { status: string; answeredAt: string | null } | null };
        if (stop || !j.call) return;
        if (j.call.status === "IN_PROGRESS") {
          patchSoftphoneCall({ state: "active", startedAt: j.call.answeredAt ? Date.parse(j.call.answeredAt) : Date.now() });
        }
      } catch {
        /* next tick */
      }
    };
    const t = setInterval(tick, 2000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [outCallId]);

  return (
    <>
      <audio id={REMOTE_AUDIO_ID} autoPlay />
      {state.call ? <CallCard call={state.call} /> : state.error ? <ErrorPill message={state.error} /> : null}
    </>
  );
}

/* ───────────────────────── The card ───────────────────────── */

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function CallCard({ call }: { call: SoftphoneCall }) {
  const now = useNow(call.state === "active" || call.state === "held");
  const ringing = call.state === "ringing";
  const dialing = call.state === "dialing";
  const held = call.state === "held";
  const subtitle = ringing
    ? "calling your business line"
    : dialing
      ? "calling from your business line…"
      : held
        ? `on hold · ${fmtElapsed(call.startedAt, now)}`
        : fmtElapsed(call.startedAt, now);
  const btn = "flex items-center justify-center w-10 h-10 rounded-full transition-colors disabled:opacity-50";

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={ringing ? `Incoming call from ${call.label}` : `Call with ${call.label}`}
      className={`fixed z-[70] right-4 bottom-20 lg:bottom-6 w-[calc(100vw-2rem)] max-w-xs rounded-2xl border bg-white text-gray-900 shadow-2xl ${
        ringing ? "border-green-300 ring-4 ring-green-100" : "border-gray-200"
      }`}
    >
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <span
          className={`flex shrink-0 items-center justify-center w-10 h-10 rounded-full ${
            ringing ? "bg-green-100 text-green-700 animate-pulse" : "bg-gray-100 text-gray-700"
          }`}
        >
          {ringing ? <PhoneIncoming size={18} /> : <Phone size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          {call.contactId ? (
            <Link href={`/app/contacts/${call.contactId}`} className="block text-sm font-bold truncate hover:underline">
              {call.label}
            </Link>
          ) : (
            <p className="text-sm font-bold truncate">{call.label}</p>
          )}
          <p className="text-xs text-gray-500 truncate">
            {call.number && call.label !== fmtNumber(call.number) ? `${fmtNumber(call.number)} · ` : ""}
            {subtitle}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 px-4 pb-4">
        {ringing ? (
          <>
            <button
              type="button"
              onClick={() => softphone.decline()}
              className={`${btn} bg-red-500 text-white hover:bg-red-600`}
              title="Decline — sends the call on to the cell / voicemail"
              aria-label="Decline"
            >
              <PhoneOff size={18} />
            </button>
            <button
              type="button"
              onClick={() => softphone.answer()}
              className={`${btn} bg-green-500 text-white hover:bg-green-600 px-5 w-auto gap-2 font-semibold text-sm`}
              aria-label="Answer"
            >
              <Phone size={18} /> Answer
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => softphone.toggleMute()}
              disabled={dialing}
              className={`${btn} ${call.muted ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              title={call.muted ? "Unmute" : "Mute"}
              aria-label={call.muted ? "Unmute" : "Mute"}
            >
              {call.muted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button
              type="button"
              onClick={() => softphone.toggleHold()}
              disabled={dialing}
              className={`${btn} ${held ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              title={held ? "Resume" : "Hold"}
              aria-label={held ? "Resume" : "Hold"}
            >
              {held ? <Play size={18} /> : <Pause size={18} />}
            </button>
            <button
              type="button"
              onClick={() => softphone.hangup()}
              className={`${btn} bg-red-500 text-white hover:bg-red-600 px-5 w-auto gap-2 font-semibold text-sm`}
              aria-label="Hang up"
            >
              <PhoneOff size={18} /> {dialing ? "Cancel" : "Hang up"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ErrorPill({ message }: { message: string }) {
  return (
    <div className="fixed z-[70] right-4 bottom-20 lg:bottom-6 max-w-xs flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-lg" role="status">
      <span className="flex-1">{message}</span>
      <button type="button" onClick={() => setSoftphoneState({ error: null })} aria-label="Dismiss" className="shrink-0 text-amber-700 hover:text-amber-900">
        <X size={14} />
      </button>
    </div>
  );
}
