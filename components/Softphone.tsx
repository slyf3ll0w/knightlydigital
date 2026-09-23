"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Maximize2, Mic, MicOff, Pause, Phone, PhoneIncoming, PhoneOff, Play, X } from "lucide-react";
import { nativePlatform } from "@/components/NativeShell";
import { useSession } from "next-auth/react";
import { nativeVoip, onVoip, rememberVoipToken, stashPendingVoipCall, takePendingVoipCall, type VoipIncoming } from "@/lib/native-voip";
import { switchToMembership } from "@/lib/company-switch";
import { MicRow, MicWarning } from "@/components/MicControls";
import { MIC_CHOICE_KEY, MIC_SILENT_PEAK, MicWatchdog, levelFromSamples, micLabelFor } from "@/lib/softphone-mic";
import {
  fmtElapsed,
  getSoftphoneState,
  patchSoftphoneCall,
  registerSoftphoneController,
  setMicLevel,
  setSoftphoneState,
  softphone,
  useSoftphone,
  type MicTestResult,
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
 * The input is a choice (MicPicker → localStorage → `setAudioSettings` on the
 * client, `setAudioInDevice` on a live call), and while a call is up a
 * watchdog (lib/softphone-mic.ts) reads the local track, the outbound RTP
 * counter and an AnalyserNode level once a second. One-way audio — they hear
 * nothing, you hear them fine — is a capture-side problem the server cannot
 * see (the legs bridge, the row says COMPLETED): the OS picked a webcam mic
 * or a headset with hands-free off, muted the device, or another app holds
 * it. So the card shows the level, names the device, says when nothing is
 * leaving, and offers the picker.
 *
 * Presence is a heartbeat every 30 s while registered and a beacon on
 * pagehide (lib/softphone.ts decides who rings from it). A browser without
 * WebRTC never registers, and neither does the Android shell (its tier 3 —
 * a foreground service — is still queued).
 *
 * iPhone app (tier 3, lib/native-voip.ts + ios/App/App/VoipPlugin.swift):
 * the same registration while the app is open, but the phone can also be
 * rung while the app is closed. The server sends a VoIP push, iOS shows the
 * system call screen at once, and the app loads underneath it; once this
 * component is registered it POSTs /api/app/line/softphone/ready, the SIP
 * leg is dialed, and an Answer already tapped on the system screen answers
 * the INVITE the moment it lands. CallKit owns the ringing and the audio
 * session, so the in-page ringer stays quiet there.
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

/**
 * The ringtone for an incoming call — a soft marimba-like motif on Web Audio,
 * no asset to load. (It was the 440+480 Hz ringback tone before, which is
 * what you hear when YOU dial someone; a phone's own ring is a melody.)
 * Browsers keep an AudioContext suspended until the page
 * has seen a user gesture, which is why the ring used to be silent in a tab
 * nobody had clicked since it loaded: arm() unlocks audio on the first
 * pointer / key / touch, a call that arrives before any gesture still asks
 * for resume() and reports whether the browser allowed it (the caller then
 * falls back to an OS notification), and a ring that was refused starts on
 * its own the moment a gesture unlocks audio while the call is still ringing.
 */
class Ringer {
  private ctx: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private wanted = false;
  private unarm: (() => void) | null = null;

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    try {
      this.ctx = new Ctx();
    } catch {
      return null;
    }
    return this.ctx;
  }

  /** Unlock audio on the first user gesture so a later call can ring without one. */
  arm() {
    if (this.unarm) return;
    const unlock = () => {
      const ctx = this.context();
      if (!ctx) return;
      const then = () => {
        if (this.wanted && !this.timer) void this.start();
      };
      if (ctx.state === "running") then();
      else ctx.resume().then(then).catch(() => {});
    };
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    for (const ev of events) window.addEventListener(ev, unlock, { capture: true, passive: true });
    this.unarm = () => {
      for (const ev of events) window.removeEventListener(ev, unlock, { capture: true });
    };
  }

  /** Resolves false when the browser is keeping audio locked (no gesture yet). */
  async start(): Promise<boolean> {
    this.wanted = true;
    if (this.timer) return true;
    const ctx = this.context();
    if (!ctx) return false;
    if (ctx.state !== "running") {
      try {
        await ctx.resume();
      } catch {
        /* locked until a gesture */
      }
    }
    if (ctx.state !== "running") return false;
    if (!this.wanted || this.timer) return true;
    // E5 G5 B5 E6 B5 G5 — plucked, twice per ring, then a breath.
    const NOTES = [659.25, 783.99, 987.77, 1318.51, 987.77, 783.99];
    const ring = () => {
      if (ctx.state !== "running") return;
      const master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      const t0 = ctx.currentTime;
      for (let rep = 0; rep < 2; rep++) {
        NOTES.forEach((f, i) => {
          const t = t0 + rep * 1.5 + i * 0.16;
          const env = ctx.createGain();
          env.gain.setValueAtTime(0.0001, t);
          env.gain.exponentialRampToValueAtTime(0.6, t + 0.01);
          env.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
          env.connect(master);
          const osc = ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.value = f;
          osc.connect(env);
          osc.start(t);
          osc.stop(t + 0.4);
          // A quiet octave above gives the pluck its "wood".
          const shimmer = ctx.createOscillator();
          shimmer.type = "triangle";
          shimmer.frequency.value = f * 2;
          const sg = ctx.createGain();
          sg.gain.value = 0.15;
          shimmer.connect(sg);
          sg.connect(env);
          shimmer.start(t);
          shimmer.stop(t + 0.4);
        });
      }
      setTimeout(() => master.disconnect(), 3400);
    };
    ring();
    this.timer = setInterval(ring, 3600);
    return true;
  }

  stop() {
    this.wanted = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** End-of-call cue: two falling notes when the other side hung up, one short low note when you did. */
  chime(kind: "remote" | "local") {
    const ctx = this.context();
    if (!ctx || ctx.state !== "running") return;
    const notes: Array<[number, number]> = kind === "remote" ? [[660, 0], [494, 0.16]] : [[392, 0]];
    const master = ctx.createGain();
    master.gain.value = 0.3;
    master.connect(ctx.destination);
    const t0 = ctx.currentTime;
    for (const [f, at] of notes) {
      const t = t0 + at;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      env.connect(master);
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      osc.connect(env);
      osc.start(t);
      osc.stop(t + 0.25);
    }
    setTimeout(() => master.disconnect(), 800);
  }

  dispose() {
    this.stop();
    this.unarm?.();
    this.unarm = null;
  }
}

/**
 * The input level of whatever stream the softphone is capturing from, on an
 * AnalyserNode: ten readings a second into the level store (MicMeter) and the
 * peak since the last takePeak() for the watchdog. Its own AudioContext — the
 * Ringer's is for output — and it never plays anything.
 */
class LevelMeter {
  private ctx: AudioContext | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private peak = 0;
  /** The stream currently metered, so a caller can release only its own. */
  stream: MediaStream | null = null;

  attach(stream: MediaStream): boolean {
    this.detach();
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return false;
    try {
      this.ctx = this.ctx ?? new Ctx();
      if (this.ctx.state !== "running") void this.ctx.resume().catch(() => {});
      this.src = this.ctx.createMediaStreamSource(stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.src.connect(this.analyser);
    } catch (err) {
      console.warn("[softphone] level meter unavailable", err);
      this.detach();
      return false;
    }
    this.stream = stream;
    const analyser = this.analyser;
    const buf = new Uint8Array(analyser.fftSize);
    this.timer = setInterval(() => {
      analyser.getByteTimeDomainData(buf);
      const level = levelFromSamples(buf);
      if (level > this.peak) this.peak = level;
      setMicLevel(level);
    }, 100);
    return true;
  }

  /** The highest level since the last call, then reset. */
  takePeak(): number {
    const p = this.peak;
    this.peak = 0;
    return p;
  }

  /** Release the stream — all of them, or only if it is the given one (a test must not tear down a call's meter). */
  detach(only?: MediaStream) {
    if (only && this.stream !== only) return;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    try {
      this.src?.disconnect();
      this.analyser?.disconnect();
    } catch {
      /* already gone */
    }
    this.src = null;
    this.analyser = null;
    this.stream = null;
    this.peak = 0;
    setMicLevel(0);
  }

  dispose() {
    this.detach();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}

/** When the browser keeps audio locked, the OS at least shows the call; clicking it brings the tab up. */
function showIncomingNotice(label: string): Notification | null {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return null;
  try {
    const n = new Notification("Incoming call", { body: label, tag: "wb-incoming-call", requireInteraction: true });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return n;
  } catch {
    return null;
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
  const levelMeter = useRef<LevelMeter | null>(null);
  const notice = useRef<Notification | null>(null);
  /** Set before a hangup we caused (or a failure the poll saw), so the end-of-call cue knows whose it was. */
  const endedBy = useRef<"local" | "remote" | null>(null);
  /** iPhone: a call CallKit is showing that has no SIP INVITE here yet (pushed while the app was closed). */
  const voipPending = useRef<{ callId: string; answered: boolean; at: number } | null>(null);
  /** iPhone: the end came from the system call screen, so CallKit already knows. */
  const endedFromCallKit = useRef(false);
  /** iPhone: a pushed call for another company on this login — the session is re-pointed and the page reloads as that company. */
  const { update: updateSession } = useSession();
  const updateSessionRef = useRef(updateSession);
  updateSessionRef.current = updateSession;

  useEffect(() => {
    // The iPhone app has a CallKit bridge; the Android shell does not (yet).
    const voip = nativeVoip();
    if (nativePlatform() && !voip) {
      setSoftphoneState({ status: "off", reason: "native" });
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      setSoftphoneState({ status: "off", reason: "unsupported" });
      return;
    }
    if (!voip) {
      ringer.current = ringer.current ?? new Ringer();
      ringer.current.arm();
    }
    let unmounted = false;
    /** Bumped on every connect/teardown; handlers from an older client compare and bail. */
    let gen = 0;
    let client: RtcClient | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let fallback: ReturnType<typeof setTimeout> | null = null;
    let inviteWatch: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    /* ── Microphone: which one, and whether it is actually sending (lib/softphone-mic.ts) ── */
    const readMicChoice = (): string | null => {
      try {
        return localStorage.getItem(MIC_CHOICE_KEY);
      } catch {
        return null;
      }
    };
    const writeMicChoice = (id: string | null) => {
      try {
        if (id) localStorage.setItem(MIC_CHOICE_KEY, id);
        else localStorage.removeItem(MIC_CHOICE_KEY);
      } catch {
        /* private window, blocked storage: the choice just doesn't survive a reload */
      }
    };
    setSoftphoneState({ micId: readMicChoice() });
    const micConstraints = (): MediaStreamConstraints => {
      const id = getSoftphoneState().micId;
      return { audio: id ? { deviceId: { exact: id } } : true };
    };
    const deviceGone = (err: unknown) =>
      err instanceof Error && (err.name === "OverconstrainedError" || err.name === "NotFoundError" || err.name === "NotReadableError");
    const micFailure = (err: unknown): string => {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotReadableError") return "The microphone is in use by another app — close it and try again.";
      if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone was found on this device.";
      return "Microphone access was refused — allow it for this site (icon left of the address bar), then reload.";
    };
    /** Open the chosen input, falling back to the default once when that device is gone; the caller stops the tracks. */
    const openMic = async (): Promise<MediaStream> => {
      try {
        return await navigator.mediaDevices.getUserMedia(micConstraints());
      } catch (err) {
        if (!getSoftphoneState().micId || !deviceGone(err)) throw err;
        console.info("[softphone] chosen microphone unavailable, back to the default:", err);
        writeMicChoice(null);
        setSoftphoneState({ micId: null });
        return navigator.mediaDevices.getUserMedia({ audio: true });
      }
    };
    const refreshDevices = async () => {
      try {
        const ins = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
        const labelsKnown = ins.some((d) => d.label);
        let micId = getSoftphoneState().micId;
        if (micId && labelsKnown && !ins.some((d) => d.deviceId === micId)) {
          // Unplugged: the next call must not fail on an exact deviceId nobody has.
          console.info("[softphone] chosen microphone is gone; back to the default");
          writeMicChoice(null);
          micId = null;
        }
        if (!unmounted) setSoftphoneState({ micDevices: ins.map((d, i) => ({ id: d.deviceId, label: micLabelFor(d, i) })), micId });
      } catch {
        /* enumerateDevices unavailable */
      }
    };
    const onDeviceChange = () => void refreshDevices();
    navigator.mediaDevices.addEventListener?.("devicechange", onDeviceChange);
    /** The chosen device becomes the SDK's audio constraint for the calls this client answers ({} = back to its default). */
    const applyMic = async (c: RtcClient) => {
      const id = getSoftphoneState().micId;
      try {
        await c.setAudioSettings(id ? { micId: id, micLabel: getSoftphoneState().micDevices.find((d) => d.id === id)?.label } : {});
      } catch (err) {
        if (!id) return;
        console.warn("[softphone] chosen microphone refused by the SDK; using the default", err);
        writeMicChoice(null);
        setSoftphoneState({ micId: null });
      }
    };

    // The watchdog: once a second while a call is up, the local track, the
    // outbound RTP packet counter and the meter's peak go to MicWatchdog; its
    // one-line verdict is micWarning on the card. Also the only console trail
    // that says which device a call captured from.
    const meter = levelMeter.current ?? (levelMeter.current = new LevelMeter());
    let micTimer: ReturnType<typeof setInterval> | null = null;
    let micCall: RtcCall | null = null;
    const localStreamOf = (call: RtcCall): MediaStream | null => {
      try {
        return call.localStream ?? null;
      } catch {
        return null; // no peer yet
      }
    };
    const micWatchStop = () => {
      if (micTimer) clearInterval(micTimer);
      micTimer = null;
      micCall = null;
      meter.detach();
      if (getSoftphoneState().micWarning) setSoftphoneState({ micWarning: null });
    };
    const micWatchStart = (call: RtcCall) => {
      micWatchStop();
      micCall = call;
      const since = Date.now();
      const track = localStreamOf(call)?.getAudioTracks()[0] ?? null;
      const label = track?.label || getSoftphoneState().micLabel || null;
      const dog = new MicWatchdog(label);
      setSoftphoneState({ micLabel: label, micWarning: null });
      console.info("[softphone] mic track:", track ? `"${track.label}" ${track.readyState} muted=${track.muted} enabled=${track.enabled}` : "none");
      let attached: MediaStream | null = null;
      let lastVerdict = "unknown";
      micTimer = setInterval(() => {
        if (micCall !== call || callRef.current !== call) return micWatchStop();
        void (async () => {
          const stream = localStreamOf(call);
          // Follow a replaced track (device switch, SDK recovery).
          if (stream && stream !== attached) attached = meter.attach(stream) ? stream : null;
          const t = stream?.getAudioTracks()[0] ?? null;
          let packets: number | null = null;
          try {
            const pc = call.peer?.instance;
            if (pc) {
              (await pc.getStats()).forEach((r: { type: string; kind?: string; mediaType?: string; packetsSent?: number }) => {
                if (r.type === "outbound-rtp" && (r.kind ?? r.mediaType) === "audio" && typeof r.packetsSent === "number") {
                  packets = (packets ?? 0) + r.packetsSent;
                }
              });
            }
          } catch {
            /* stats unavailable: the watchdog judges without them */
          }
          if (micCall !== call) return;
          const cur = getSoftphoneState();
          const report = dog.next({
            activeMs: Date.now() - since,
            track: t ? { readyState: t.readyState, muted: t.muted, enabled: t.enabled } : null,
            packetsSent: packets,
            peak: meter.takePeak(),
            mutedByUser: call.isAudioMuted,
            held: call.state === "held" || cur.call?.state === "held",
            waiting: cur.call?.state === "dialing",
          });
          if (report.verdict !== lastVerdict) {
            lastVerdict = report.verdict;
            console.info(`[softphone] mic ${report.verdict}`, report.message ?? "", `packets=${packets ?? "?"}`);
          }
          if ((report.message ?? null) !== cur.micWarning) setSoftphoneState({ micWarning: report.message ?? null });
        })();
      }, 1000);
    };

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
      notice.current?.close();
      notice.current = null;
      if (document.title.startsWith("☎ ")) document.title = document.title.slice(2);
    };

    const endCall = (call: RtcCall) => {
      if (callRef.current !== call) return;
      callRef.current = null;
      stopRinger();
      micWatchStop();
      // One low note when you ended it, two falling notes when the other side did (or it never connected).
      ringer.current?.chime(endedBy.current === "local" ? "local" : "remote");
      endedBy.current = null;
      const ended = getSoftphoneState().call?.callId ?? null;
      setSoftphoneState({ call: null });
      // Keep the system call screen in step: it dismisses when we end here,
      // unless the end came from that screen in the first place.
      if (voip && ended && !endedFromCallKit.current) void voip.endCall({ callId: ended, reason: "remoteEnded" });
      endedFromCallKit.current = false;
    };

    /** iPhone: tell the server this phone is awake for a pushed call, so its SIP leg gets dialed. */
    /**
     * iPhone: the pushed call belongs to another company on this login. Park
     * the call in localStorage, re-point the session and reload as that
     * company; the effect on the other side picks it up (takePendingVoipCall)
     * and asks to be dialed once its softphone registers. CallKit keeps the
     * call on screen throughout — the native side outlives the page.
     */
    let switching = false;
    const switchForCall = (callId: string, userId: string | null) => {
      if (switching || !userId) return;
      switching = true;
      const p = voipPending.current;
      const cur = getSoftphoneState().call;
      stashPendingVoipCall({ callId, label: cur?.label ?? "Incoming call", number: cur?.number ?? null, answered: p?.answered ?? false, at: p?.at ?? Date.now() });
      void switchToMembership(updateSessionRef.current, userId).catch(() => {
        switching = false;
      });
    };

    /** iPhone: is this pushed call ours as signed in, or another company's? Decides before the softphone even registers. */
    const probeCompany = async (callId: string) => {
      if (!voip) return;
      let outcome = "same";
      let switchTo: string | null = null;
      try {
        const res = await fetch("/api/app/line/softphone/ready", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callId, probe: true }),
        });
        const j = (await res.json().catch(() => ({}))) as { outcome?: string; userId?: string };
        outcome = j.outcome ?? "same";
        switchTo = j.userId ?? null;
      } catch {
        outcome = "same"; // offline for a moment: carry on as before, the row watch below sorts the rest
      }
      if (unmounted || voipPending.current?.callId !== callId || callRef.current) return;
      if (outcome === "switch") return switchForCall(callId, switchTo);
      if (outcome === "late" || outcome === "ineligible") {
        voipPending.current = null;
        setSoftphoneState({ call: null });
        void voip.endCall({ callId, reason: outcome === "late" ? "answeredElsewhere" : "unanswered" });
        return;
      }
      if (getSoftphoneState().status === "ready") void postReady(callId);
      watchPending(callId);
    };

    const postReady = async (callId: string) => {
      if (!voip) return;
      let outcome = "late";
      let switchTo: string | null = null;
      try {
        const res = await fetch("/api/app/line/softphone/ready", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callId }),
        });
        const j = (await res.json().catch(() => ({}))) as { outcome?: string; userId?: string };
        outcome = j.outcome ?? "late";
        switchTo = j.userId ?? null;
      } catch {
        outcome = "late";
      }
      if (unmounted || voipPending.current?.callId !== callId || callRef.current) return;
      if (outcome === "switch") return switchForCall(callId, switchTo);
      if (outcome === "late" || outcome === "ineligible") {
        // Answered elsewhere, the cell already has it, or the caller is gone.
        voipPending.current = null;
        setSoftphoneState({ call: null });
        void voip.endCall({ callId, reason: "answeredElsewhere" });
      }
    };

    /** iPhone: while CallKit shows a pushed call and no INVITE has landed, watch the row so a call that ended elsewhere dismisses. */
    const watchPending = (callId: string) => {
      const started = Date.now();
      const tick = async () => {
        const p = voipPending.current;
        if (unmounted || !p || p.callId !== callId || callRef.current) return;
        if (Date.now() - started > 45_000) {
          voipPending.current = null;
          setSoftphoneState({ call: null, error: p.answered ? "The call didn't reach the app in time." : null });
          void voip?.endCall({ callId, reason: p.answered ? "failed" : "unanswered" });
          return;
        }
        try {
          const res = await fetch(`/api/app/line/softphone/call?id=${encodeURIComponent(callId)}`, { cache: "no-store" });
          const j = (await res.json()) as { call?: { status: string } | null };
          if (!j.call || j.call.status === "IN_PROGRESS" || TERMINAL.has(j.call.status)) {
            if (voipPending.current?.callId !== callId || callRef.current) return;
            voipPending.current = null;
            setSoftphoneState({ call: null });
            void voip?.endCall({ callId, reason: j.call?.status === "IN_PROGRESS" ? "answeredElsewhere" : "remoteEnded" });
            return;
          }
        } catch {
          /* next tick */
        }
        setTimeout(() => void tick(), 2500);
      };
      setTimeout(() => void tick(), 2500);
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
    /**
     * Open the microphone and let it go: proves the permission, names the
     * device, and catches the one thing a permission query can't — a track
     * the OS reports as muted (device muted in the system, or held by another
     * app), which is a silent call waiting to happen.
     */
    const requestMic = async (): Promise<boolean> => {
      try {
        const s = await openMic();
        const t = s.getAudioTracks()[0] ?? null;
        const label = t?.label || null;
        const osMuted = !!t?.muted;
        s.getTracks().forEach((x) => x.stop());
        console.info("[softphone] microphone:", label ?? "(no label)", osMuted ? "— the OS reports no audio from it" : "");
        setSoftphoneState({
          mic: "granted",
          error: null,
          micLabel: label,
          micWarning: osMuted
            ? `${label ? `"${label}"` : "Your microphone"} isn't producing any audio right now — the system may have it muted, or another app is using it. Pick another microphone if you have one.`
            : null,
        });
        void refreshDevices();
        return true;
      } catch (err) {
        console.warn("[softphone] microphone refused", err);
        const message = micFailure(err);
        setSoftphoneState({ mic: message.startsWith("Microphone access") ? "denied" : getSoftphoneState().mic, error: message });
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
      const pushed = voipPending.current;
      const known = pushed && (callId === null || pushed.callId === callId) ? pushed : null;
      setSoftphoneState({
        error: null,
        call: {
          callId: callId ?? known?.callId ?? null,
          direction: "in",
          label: known ? getSoftphoneState().call?.label || "Incoming call" : call.options.remoteCallerName || fmtNumber(call.options.remoteCallerNumber) || "Incoming call",
          number: call.options.remoteCallerNumber ?? getSoftphoneState().call?.number ?? null,
          contactId: null,
          state: "ringing",
          startedAt: null,
          muted: false,
        },
      });
      const ringLabel = call.options.remoteCallerName || fmtNumber(call.options.remoteCallerNumber) || "Incoming call";
      if (voip) {
        // CallKit rings, not the page. A call pushed while the app was closed
        // is already on the system screen; one that arrived as an INVITE
        // first (app in the foreground) is put there now.
        const id = callId ?? known?.callId ?? null;
        if (id && !known) void voip.reportIncoming({ callId: id, label: ringLabel, number: call.options.remoteCallerNumber ?? null });
        if (known) {
          voipPending.current = null;
          if (known.answered) doAnswer();
        }
      } else {
        void ringer.current?.start().then((audible) => {
          if (!audible && callRef.current === call) notice.current = showIncomingNotice(ringLabel);
        });
        if (!document.title.startsWith("☎ ")) document.title = `☎ ${document.title}`;
      }
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
          // The INVITE's header didn't survive the SDK: the row named the call, so the system screen can show it now.
          if (voip && !callId) void voip.reportIncoming({ callId: j.call.id, label: j.call.label, number: j.call.number });
        })
        .catch(() => {});
    };

    /** Answer the ringing INVITE (microphone first — a permission prompt inside the SDK's answer() would race the INVITE's timeout; the probe also names the device for the watchdog). */
    const doAnswer = () => {
      const c = callRef.current;
      if (!c || c.state !== "ringing") return;
      stopRinger();
      void requestMic().then((ok) => {
        if (callRef.current !== c) return;
        if (ok) void c.answer();
        else void c.hangup();
      });
    };

    const onCallUpdate = (call: RtcCall) => {
      switch (call.state) {
        case "ringing":
          onIncoming(call);
          return;
        case "active": {
          if (callRef.current !== call) return;
          stopRinger();
          if (micCall !== call) micWatchStart(call);
          const cur = getSoftphoneState().call;
          if (cur?.direction === "out" && cur.state === "dialing") {
            // The tab is live but the customer isn't yet: keep "Calling…" until the row says bridged (polled below).
            patchSoftphoneCall({ muted: call.isAudioMuted });
          } else {
            patchSoftphoneCall({ state: "active", startedAt: cur?.startedAt ?? Date.now(), muted: call.isAudioMuted });
            if (voip && cur?.callId) void voip.reportConnected({ callId: cur.callId });
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
      if (getSoftphoneState().micId) await applyMic(c);
      if (unmounted || myGen !== gen) return;
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
        if (voip) {
          // Registered: this phone can be pushed for calls from now on — and
          // if it was launched FOR a call, say so, and the SIP leg gets dialed.
          void voip.register().catch(() => {});
          const p = voipPending.current;
          if (p && !callRef.current) void postReady(p.callId);
        }
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
        const p = voipPending.current;
        if (!callRef.current && p) {
          // Pushed call, INVITE not here yet: answer the moment it lands.
          p.answered = true;
          return;
        }
        doAnswer();
      },
      decline: () => {
        // Straight to voicemail, like a phone. The server hears it FIRST: a
        // browser leg that merely drops means "ring the cell next".
        const id = getSoftphoneState().call?.callId ?? null;
        const c = callRef.current;
        const pushed = voipPending.current;
        endedBy.current = "local";
        void (async () => {
          if (id) {
            await fetch("/api/app/line/call/decline", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id }),
            }).catch(() => {});
          }
          if (c) void c.hangup();
          else if (!pushed) cancelPending();
        })();
        if (c) endCall(c);
        else if (pushed) {
          // Declined before the INVITE arrived (pushed call): the row is
          // already VOICEMAIL; drop the card and the system screen.
          voipPending.current = null;
          endedBy.current = null;
          setSoftphoneState({ call: null });
          if (voip && !endedFromCallKit.current) void voip.endCall({ callId: pushed.callId, reason: "declined" });
          endedFromCallKit.current = false;
        } else endedBy.current = null;
      },
      hangup: () => {
        const c = callRef.current;
        const cur = getSoftphoneState().call;
        endedBy.current ??= "local";
        if (c) {
          void c.hangup();
          // Outbound, customer not on yet: the SIP leg alone hanging up would leave the customer leg ringing.
          if (cur?.direction === "out" && cur.state === "dialing" && cur.callId) void hangupServerSide(cur.callId);
          // The card goes now; the SDK's own hangup event a moment later finds nothing to do.
          endCall(c);
        } else {
          cancelPending();
          endedBy.current = null;
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
        // The SDK's hold only quiets our leg; the other party gets the hold music from the server, on their leg.
        const callId = getSoftphoneState().call?.callId ?? null;
        const music = (on: boolean) =>
          callId
            ? fetch("/api/app/line/call", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: callId, hold: on }),
              }).catch(() => {})
            : Promise.resolve();
        if (c.state === "held") {
          void c.unhold().then(() => patchSoftphoneCall({ state: "active" }));
          void music(false);
        } else {
          void c.hold();
          void music(true);
        }
      },
      requestMic,
      sendDigits: (digits: string) => {
        const c = callRef.current;
        const clean = digits.replace(/[^0-9*#]/g, "");
        if (!c || !clean || (c.state !== "active" && c.state !== "held")) return;
        try {
          c.dtmf(clean);
        } catch (err) {
          console.warn("[softphone] dtmf failed", err);
        }
      },
      setMic: async (deviceId: string | null) => {
        writeMicChoice(deviceId);
        setSoftphoneState({ micId: deviceId, micWarning: null });
        const c = clientRef.current;
        const call = callRef.current;
        try {
          if (c) await applyMic(c);
          if (call && (call.state === "active" || call.state === "held")) {
            await call.setAudioInDevice(deviceId ?? "default");
            micWatchStart(call); // the new track, fresh counters, the new name on the card
          }
        } catch (err) {
          console.warn("[softphone] switching microphone failed", err);
          setSoftphoneState({ error: "Couldn't switch to that microphone — try another, or hang up and call again." });
        }
      },
      testMic: async (): Promise<MicTestResult> => {
        if (callRef.current) {
          return { heard: false, label: getSoftphoneState().micLabel, osMuted: false, error: "You're on a call — the meter on the call card shows your microphone." };
        }
        let s: MediaStream;
        try {
          s = await openMic();
        } catch (err) {
          const message = micFailure(err);
          setSoftphoneState({ mic: message.startsWith("Microphone access") ? "denied" : getSoftphoneState().mic, error: message });
          return { heard: false, label: null, osMuted: false, error: message };
        }
        const t = s.getAudioTracks()[0] ?? null;
        const label = t?.label || null;
        setSoftphoneState({ mic: "granted", micLabel: label, error: null });
        void refreshDevices();
        const metered = meter.attach(s);
        await new Promise((r) => setTimeout(r, 4000));
        const peak = meter.stream === s ? meter.takePeak() : 0;
        const osMuted = !!t?.muted;
        meter.detach(s); // only if a call hasn't taken the meter over meanwhile
        s.getTracks().forEach((x) => x.stop());
        const heard = metered && peak >= MIC_SILENT_PEAK;
        console.info("[softphone] mic test:", label ?? "(no label)", `peak=${peak.toFixed(3)}`, osMuted ? "— the OS reports no audio from it" : "");
        if (heard && getSoftphoneState().micWarning) setSoftphoneState({ micWarning: null });
        return { heard, label, osMuted, error: metered ? null : "This browser can't meter the microphone." };
      },
      placeCall: async (target: PlaceCallTarget) => {
        if (!clientRef.current || getSoftphoneState().status !== "ready") throw new Error("The softphone isn't connected.");
        if (callRef.current || getSoftphoneState().call) throw new Error("You're already on a call.");
        // Microphone BEFORE the server dials this tab, so the INVITE isn't answered late (or never) behind the prompt.
        // Always a real open, not the permission state: it names the device and catches an OS-muted one.
        if (!(await requestMic())) {
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
        const outLabel = target.label || fmtNumber(data.customerNumber) || "Calling…";
        setSoftphoneState({
          error: null,
          call: {
            callId: placedId,
            direction: "out",
            label: outLabel,
            number: data.customerNumber ?? null,
            contactId: target.contactId ?? null,
            state: "dialing",
            startedAt: null,
            muted: false,
          },
        });
        // iPhone: an outgoing call on the system screen too, so the audio
        // session and the lock-screen controls behave like a phone call.
        if (voip) void voip.startOutgoing({ callId: placedId, label: outLabel, number: data.customerNumber ?? null }).catch(() => {});
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

    // iPhone: what the system call screen and PushKit tell us (lib/native-voip.ts).
    const offVoip: Array<() => void> = [];
    if (voip) {
      offVoip.push(
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
      offVoip.push(
        onVoip<VoipIncoming>(voip, "incomingCall", (inc) => {
          if (unmounted || !inc?.callId) return;
          const cur = getSoftphoneState().call;
          // The INVITE beat the push here (app in the foreground): nothing to add.
          if (callRef.current && cur?.callId === inc.callId) return;
          if (callRef.current || voipPending.current) {
            // Busy with another call: this one rings on, elsewhere.
            void voip.endCall({ callId: inc.callId, reason: "unanswered" });
            return;
          }
          voipPending.current = { callId: inc.callId, answered: false, at: Date.now() };
          setSoftphoneState({
            error: null,
            call: { callId: inc.callId, direction: "in", label: inc.label || "Incoming call", number: inc.number ?? null, contactId: null, state: "ringing", startedAt: null, muted: false },
          });
          // Whose call is this? Ours as signed in → dial when registered;
          // another company on this login → switch over first.
          void probeCompany(inc.callId);
        })
      );
      // A call carried across a company switch (see switchForCall): CallKit
      // still shows it; register, then ask to be dialed (telnyx.ready above).
      const carried = takePendingVoipCall();
      if (carried && !voipPending.current) {
        voipPending.current = { callId: carried.callId, answered: carried.answered, at: carried.at };
        setSoftphoneState({
          error: null,
          call: { callId: carried.callId, direction: "in", label: carried.label, number: carried.number, contactId: null, state: "ringing", startedAt: null, muted: false },
        });
        watchPending(carried.callId);
      }
      offVoip.push(
        onVoip<{ callId: string }>(voip, "callAnswered", ({ callId }) => {
          if (unmounted) return;
          const p = voipPending.current;
          if (callRef.current?.state === "ringing") doAnswer();
          else if (p && p.callId === callId) {
            p.answered = true;
            // Tapped while the company switch is reloading the page: the parked call must carry the answer across.
            if (switching) {
              const cur = getSoftphoneState().call;
              stashPendingVoipCall({ callId, label: cur?.label ?? "Incoming call", number: cur?.number ?? null, answered: true, at: p.at });
            }
          }
        })
      );
      offVoip.push(
        onVoip<{ callId: string; reason: string }>(voip, "callEnded", ({ callId }) => {
          if (unmounted) return;
          const cur = getSoftphoneState().call;
          const p = voipPending.current;
          if (cur?.callId !== callId && p?.callId !== callId) return;
          endedFromCallKit.current = true;
          const c = callRef.current;
          if (c?.state === "ringing" || (!c && p)) softphone.decline();
          else if (c) softphone.hangup();
          endedFromCallKit.current = false;
        })
      );
      offVoip.push(
        onVoip<{ muted: boolean }>(voip, "muteChanged", ({ muted }) => {
          const c = callRef.current;
          if (!c) return;
          if (muted && !c.isAudioMuted) c.muteAudio();
          else if (!muted && c.isAudioMuted) c.unmuteAudio();
          patchSoftphoneCall({ muted: c.isAudioMuted });
        })
      );
    }

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
      offVoip.forEach((off) => off());
      window.removeEventListener("pagehide", goodbye);
      if (retry) clearTimeout(retry);
      if (inviteWatch) clearTimeout(inviteWatch);
      unregister();
      stopRinger();
      micWatchStop();
      navigator.mediaDevices.removeEventListener?.("devicechange", onDeviceChange);
      ringer.current?.dispose();
      levelMeter.current?.dispose();
      levelMeter.current = null;
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
          endedBy.current = "remote"; // not your hangup — the other side never came on
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
  const pathname = usePathname();
  const ringing = call.state === "ringing";
  const dialing = call.state === "dialing";
  const held = call.state === "held";
  // The call screen (/app/calls/[id]) carries the full controls for this very call — no second card on top of it.
  const screenHref = call.callId ? `/app/calls/${call.callId}` : null;
  if (screenHref && pathname === screenHref) return null;
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
        {screenHref && !ringing && (
          <Link
            href={screenHref}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
            title="Open the call screen — save them, quote, schedule or invoice while you talk"
            aria-label="Open the call screen"
          >
            <Maximize2 size={15} />
          </Link>
        )}
      </div>
      {!ringing && (
        <div className="-mt-1 px-4 pb-3">
          <MicRow />
          <MicWarning className="mt-2" />
        </div>
      )}
      <div className="flex items-center justify-end gap-2 px-4 pb-4">
        {ringing ? (
          <>
            <button
              type="button"
              onClick={() => softphone.decline()}
              className={`${btn} bg-red-500 text-white hover:bg-red-600`}
              title="Decline — sends the caller to voicemail"
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
