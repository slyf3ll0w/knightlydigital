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
 *             customer picks up. Cancel before the INVITE lands hangs the
 *             server-side call up (DELETE /api/app/line/call).
 *
 * Connection discipline (learned the hard way on 2026-09-21): the SDK
 * reconnects BY ITSELF when its socket drops (maxReconnectAttempts), and it
 * also fires `telnyx.socket.close` when WE disconnect it. So this component
 * never reconnects on a close event directly — it waits RECONNECT_FALLBACK_MS
 * for the SDK to come back and only then mints a fresh token — and every
 * handler checks it still belongs to the live client (generation counter),
 * so a torn-down client can't schedule anything. Otherwise each reconnect
 * spawned the next one, the dialer flickered, and the grant route's rate
 * limit tripped.
 *
 * One registration per browser (Web Locks `wb-softphone`): Telnyx forks an
 * INVITE to every registration of the credential, and two tabs answering the
 * same call is a SIP 486 race the SDK documents. The tab holding the lock runs
 * the softphone; the others say so and take over the moment it closes. An
 * outbound leg placed from ANOTHER tab/device (X-WB-Outbound header, or the
 * row lookup saying OUTBOUND) is left alone — neither answered nor rejected —
 * so the placing browser's answer wins cleanly.
 *
 * Microphone: the permission state is read on registration; the Calls page
 * offers to grant it up front, and a call placed from here asks for it BEFORE
 * the server dials, so the INVITE never times out behind the browser prompt.
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
/** After a socket drop, how long the SDK's own reconnect gets before we start over with a fresh token. */
const RECONNECT_FALLBACK_MS = 45_000;
/** After the grant route says "too many", stay quiet this long. */
const RATE_LIMITED_WAIT_MS = 3 * 60_000;
const TERMINAL = new Set(["COMPLETED", "MISSED", "VOICEMAIL", "NO_ANSWER", "FAILED"]);

const fmtNumber = (e164: string | null | undefined): string => {
  const d = (e164 ?? "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}` : (e164 ?? "");
};

const header = (call: RtcCall, name: string): string | null => {
  const list = (call.options as { customHeaders?: Array<{ name: string; value: string }> }).customHeaders ?? [];
  return list.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
};

/** North-American ring cadence (440+480 Hz, ~2 s on / 4 s off) on Web Audio — no asset to load. */
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

async function hangupServerSide(callId: string): Promise<void> {
  await fetch(`/api/app/line/call?id=${encodeURIComponent(callId)}`, { method: "DELETE", keepalive: true }).catch(() => {});
}

export default function Softphone() {
  const state = useSoftphone();
  const clientRef = useRef<RtcClient | null>(null);
  const callRef = useRef<RtcCall | null>(null);
  const pendingOutbound = useRef<{ callId: string; at: number } | null>(null);
  /** Outbound calls the user cancelled before their INVITE arrived: decline it if it still shows up. */
  const cancelled = useRef<Set<string>>(new Set());
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
    let unmounted = false;
    /** Bumped on every connect/teardown; handlers from an older client compare and bail. */
    let gen = 0;
    let client: RtcClient | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let fallback: ReturnType<typeof setTimeout> | null = null;
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
    const clearFallback = () => {
      if (fallback) clearTimeout(fallback);
      fallback = null;
    };
    const teardownClient = () => {
      gen++; // anything the old client emits from here on is ignored
      stopHeartbeat();
      clearFallback();
      const c = client;
      client = null;
      clientRef.current = null;
      try {
        void c?.disconnect();
      } catch {
        /* already gone */
      }
    };
    /** Start over with a fresh token after `delay` ms (only path that mints a new grant). */
    const restart = (delay: number) => {
      if (unmounted) return;
      if (retry) clearTimeout(retry);
      retry = setTimeout(() => {
        retry = null;
        teardownClient();
        void connect();
      }, delay);
    };
    const backoff = () => Math.min(60_000, 3_000 * 2 ** Math.min(attempt++, 5));

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

    const checkMic = async () => {
      try {
        if (!navigator.permissions?.query) return;
        const st = await navigator.permissions.query({ name: "microphone" as PermissionName });
        const apply = () => {
          if (!unmounted) setSoftphoneState({ mic: st.state === "granted" ? "granted" : st.state === "denied" ? "denied" : "prompt" });
        };
        apply();
        st.onchange = apply;
      } catch {
        /* Firefox/Safari may refuse the query — the SDK prompts on the first call */
      }
    };
    const requestMic = async (): Promise<boolean> => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach((t) => t.stop());
        setSoftphoneState({ mic: "granted", error: null });
        return true;
      } catch (err) {
        console.warn("[softphone] microphone refused", err);
        setSoftphoneState({ mic: "denied", error: "Microphone access was refused — allow it for this site (icon left of the address bar), then reload." });
        return false;
      }
    };

    const onIncoming = (call: RtcCall) => {
      const callId = header(call, "X-WB-Call-Id");
      // The user cancelled this outbound call before its INVITE reached us.
      if (callId && cancelled.current.has(callId)) {
        cancelled.current.delete(callId);
        void call.hangup();
        return;
      }
      // One call at a time: a second INVITE while busy is declined; the server rings the cell / voicemail as usual.
      if (callRef.current && callRef.current !== call) {
        void call.hangup();
        return;
      }
      const pending = pendingOutbound.current;
      const mine = pending !== null && (callId === pending.callId || (!callId && Date.now() - pending.at < OUTBOUND_INVITE_WAIT_MS));
      if (header(call, "X-WB-Outbound") === "1" && !mine) {
        // An outbound call placed from another tab/device: neither answer nor reject —
        // Telnyx cancels this fork the moment the placing browser answers.
        console.info("[softphone] outbound leg placed elsewhere; ignoring", callId ?? "");
        return;
      }
      callRef.current = call;
      if (mine) {
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
        .then((j: { call?: { id: string; label: string; number: string; contactId: string | null; direction?: string } | null } | null) => {
          if (!j?.call || callRef.current !== call) return;
          if (j.call.direction === "OUTBOUND") {
            // Headers didn't make it through the SDK, but the row says this is an outbound call placed elsewhere.
            console.info("[softphone] ringing leg belongs to an outbound call placed elsewhere; ignoring");
            callRef.current = null;
            stopRinger();
            setSoftphoneState({ call: null });
            return;
          }
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
      if (unmounted) return;
      const myGen = ++gen;
      setSoftphoneState({ status: "connecting" });
      let grant: { token?: string; off?: string; error?: string };
      let status = 0;
      try {
        const res = await fetch("/api/app/line/softphone", { cache: "no-store" });
        status = res.status;
        grant = (await res.json().catch(() => ({}))) as typeof grant;
        if (!res.ok) throw new Error(grant.error || "Couldn't start the softphone.");
      } catch (err) {
        if (unmounted || myGen !== gen) return;
        setSoftphoneState({ status: "error", error: err instanceof Error ? err.message : "Couldn't start the softphone." });
        restart(status === 429 ? RATE_LIMITED_WAIT_MS : backoff());
        return;
      }
      if (unmounted || myGen !== gen) return;
      if (grant.off || !grant.token) {
        setSoftphoneState({ status: "off", reason: grant.off ?? "voice" });
        return;
      }
      const { TelnyxRTC } = await import("@telnyx/webrtc");
      if (unmounted || myGen !== gen) return;
      const c = new TelnyxRTC({ login_token: grant.token });
      c.remoteElement = REMOTE_AUDIO_ID;
      const live = () => !unmounted && myGen === gen && client === c;
      c.on("telnyx.ready", () => {
        if (!live()) return;
        console.info("[softphone] registered");
        attempt = 0;
        clearFallback();
        setSoftphoneState({ status: "ready", error: null, reason: null });
        void checkMic();
        void beat(true);
        stopHeartbeat();
        heartbeat = setInterval(() => void beat(true), HEARTBEAT_MS);
      });
      c.on("telnyx.error", (err: unknown) => {
        if (live()) console.warn("[softphone] error:", err);
      });
      c.on("telnyx.socket.close", (ev: { code?: number; reason?: string } | undefined) => {
        if (!live()) return; // our own teardown, or an older client
        console.info("[softphone] socket closed", ev?.code ?? "", ev?.reason ?? "", "— SDK reconnecting");
        stopHeartbeat();
        void beat(false);
        setSoftphoneState({ status: "connecting" });
        // The SDK reconnects on its own first; only if it hasn't come back do we start over with a fresh token.
        if (!fallback) {
          fallback = setTimeout(() => {
            fallback = null;
            if (live() && getSoftphoneState().status !== "ready") restart(callRef.current ? 30_000 : backoff());
          }, RECONNECT_FALLBACK_MS);
        }
      });
      c.on("telnyx.notification", (n: { type: string; call?: RtcCall; error?: Error }) => {
        if (!live()) return;
        if (n.type === "callUpdate" && n.call) {
          console.info("[softphone] call", n.call.state, n.call.options.remoteCallerNumber ?? "", header(n.call, "X-WB-Call-Id") ?? "");
          onCallUpdate(n.call);
        }
        else if (n.type === "userMediaError") {
          console.warn("[softphone] microphone error", n.error);
          setSoftphoneState({ error: "Microphone blocked — allow it for this site in the browser, then try again." });
        }
      });
      client = c;
      clientRef.current = c;
      try {
        await c.connect();
      } catch (err) {
        if (!live()) return;
        console.warn("[softphone] connect failed:", err);
        restart(backoff());
      }
    }

    const cancelPending = () => {
      // Outbound call that hasn't reached this tab yet: tell the server to hang it up and forget it here.
      const cur = getSoftphoneState().call;
      const id = pendingOutbound.current?.callId ?? cur?.callId ?? null;
      pendingOutbound.current = null;
      if (inviteWatch) clearTimeout(inviteWatch);
      if (id) {
        cancelled.current.add(id);
        setTimeout(() => cancelled.current.delete(id), 60_000);
        void hangupServerSide(id);
      }
      setSoftphoneState({ call: null });
    };

    const unregister = registerSoftphoneController({
      answer: () => {
        const c = callRef.current;
        if (!c || c.state !== "ringing") return;
        stopRinger();
        // Get the microphone first: a permission prompt inside the SDK's answer() would race the INVITE's timeout.
        void (getSoftphoneState().mic === "granted" ? Promise.resolve(true) : requestMic()).then((ok) => {
          if (callRef.current !== c) return;
          if (ok) void c.answer();
          else void c.hangup();
        });
      },
      decline: () => {
        if (callRef.current) void callRef.current.hangup();
        else cancelPending();
      },
      hangup: () => {
        const c = callRef.current;
        const cur = getSoftphoneState().call;
        if (c) {
          void c.hangup();
          // Outbound, customer not on yet: the SIP leg alone hanging up would leave the customer leg ringing.
          if (cur?.direction === "out" && cur.state === "dialing" && cur.callId) void hangupServerSide(cur.callId);
        } else {
          cancelPending();
        }
      },
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
      requestMic,
      placeCall: async (target: PlaceCallTarget) => {
        if (!clientRef.current || getSoftphoneState().status !== "ready") throw new Error("The softphone isn't connected.");
        if (callRef.current || getSoftphoneState().call) throw new Error("You're already on a call.");
        // Microphone BEFORE the server dials this tab, so the INVITE isn't answered late (or never) behind the prompt.
        if (getSoftphoneState().mic !== "granted" && !(await requestMic())) {
          throw new Error("Microphone access is needed to call from the browser — allow it and try again, or use Call from line to ring your cell.");
        }
        const res = await fetch("/api/app/line/call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId: target.contactId ?? null, to: target.to ?? null, via: "app" }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; callId?: string; customerNumber?: string };
        if (!res.ok || !data.callId) throw new Error(data.error || "Couldn't place the call.");
        const placedId = data.callId;
        pendingOutbound.current = { callId: placedId, at: Date.now() };
        setSoftphoneState({
          error: null,
          call: {
            callId: placedId,
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
          if (pendingOutbound.current?.callId !== placedId) return;
          pendingOutbound.current = null;
          if (!callRef.current) {
            console.info("[softphone] outbound INVITE never arrived; cancelling", placedId);
            void hangupServerSide(placedId);
            setSoftphoneState({ call: null, error: "The call never reached this browser — reconnecting. Try again in a moment." });
            restart(0);
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

    // One registration per browser (see the header comment). The tab that holds
    // the lock connects; any other waits, says so, and connects when it's freed.
    let releaseLock: (() => void) | null = null;
    const holdLock = () =>
      new Promise<void>((done) => {
        releaseLock = done;
      });
    const locks = navigator.locks;
    if (locks?.request) {
      void locks
        .request("wb-softphone", { ifAvailable: true }, async (lock) => {
          if (unmounted) return;
          if (lock) {
            void connect();
            await holdLock();
            return;
          }
          setSoftphoneState({ status: "off", reason: "other_tab" });
          await locks.request("wb-softphone", async () => {
            if (unmounted) return;
            void connect();
            await holdLock();
          });
        })
        .catch(() => void connect());
    } else {
      void connect();
    }

    return () => {
      unmounted = true;
      releaseLock?.();
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

  // Outbound: "Calling…" until our row says the customer is on (bridged) — or that it never will be.
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
        } else if (TERMINAL.has(j.call.status)) {
          // The leg to this browser or to the customer failed / went unanswered: don't leave a stuck card.
          softphone.hangup();
          setSoftphoneState({
            call: null,
            error:
              j.call.status === "NO_ANSWER"
                ? "No answer."
                : "The call didn't connect. If this keeps happening, use Call from line to ring your cell instead.",
          });
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
