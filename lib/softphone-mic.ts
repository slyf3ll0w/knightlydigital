/**
 * The softphone's microphone watchdog — the pure part. components/Softphone.tsx
 * feeds it a sample every second while a browser call is up and shows what it
 * says on the call card.
 *
 * One-way audio (they hear nothing, you hear them fine) is the classic WebRTC
 * failure, and it is nearly always the capture side: the OS switched the
 * default input to a device with nothing on it (a webcam mic, a headset whose
 * hands-free profile is off), the device is muted in the system, another app
 * holds it, or the track never made it into the peer connection. The server
 * can't see any of it — the legs bridge and the row says COMPLETED — so the
 * browser watches its own outgoing audio: the local track's state, the RTP
 * packet counter, and the input level from an AnalyserNode.
 *
 * Verdicts, in order of certainty:
 *   dead    no track / track ended / track muted by the OS / packets stalled
 *   silent  everything is wired up but nothing has been heard for a while
 *   ok      audio is leaving
 *   unknown too early to say (the first seconds after the bridge)
 * Mute and Hold are the person's choice, and an outbound call still ringing
 * the customer has nobody to talk to: no verdict is raised in those stretches.
 */

export type MicVerdict = "unknown" | "ok" | "silent" | "dead";

export type MicSample = {
  /** Milliseconds since the SDK reported the call active. */
  activeMs: number;
  /** The local audio track as the peer connection sees it; null when there is none. */
  track: { readyState: "live" | "ended"; muted: boolean; enabled: boolean } | null;
  /** RTCOutboundRtpStreamStats.packetsSent for the audio sender; null when stats are unavailable. */
  packetsSent: number | null;
  /** Peak input level (0..1) over the last sampling window. */
  peak: number;
  /** The Mute button is on. */
  mutedByUser: boolean;
  /** The call is on hold. */
  held: boolean;
  /** Outbound and the customer hasn't picked up yet: nobody to talk to, so silence means nothing. */
  waiting: boolean;
};

export type MicReport = { verdict: MicVerdict; message: string | null };

/** No verdict before this much of the call has gone by — the track and the first packets need a moment. */
export const MIC_GRACE_MS = 3_000;
/** Packets not increasing for this long = nothing is leaving the browser. */
export const MIC_STALL_MS = 3_000;
/** Level under the floor for this long = the device is capturing silence. */
export const MIC_SILENT_MS = 6_000;
/** Below this the input is treated as silence (room noise on a working mic sits well above it). */
export const MIC_SILENT_PEAK = 0.015;

export class MicWatchdog {
  private lastPackets: number | null = null;
  private lastAt: number | null = null;
  private stallMs = 0;
  private silentMs = 0;

  constructor(private readonly label: string | null) {}

  private name(): string {
    return this.label?.trim() ? `"${this.label.trim()}"` : "your microphone";
  }

  next(s: MicSample): MicReport {
    const dt = this.lastAt === null ? 0 : Math.max(0, s.activeMs - this.lastAt);
    this.lastAt = s.activeMs;

    if (s.mutedByUser || s.held || s.waiting) {
      // Silence is the point; keep the counters from carrying over into the next stretch.
      this.stallMs = 0;
      this.silentMs = 0;
      this.lastPackets = s.packetsSent;
      return { verdict: "ok", message: null };
    }

    if (s.packetsSent !== null) {
      if (this.lastPackets !== null && s.packetsSent <= this.lastPackets) this.stallMs += dt;
      else this.stallMs = 0;
      this.lastPackets = s.packetsSent;
    }
    if (s.peak < MIC_SILENT_PEAK) this.silentMs += dt;
    else this.silentMs = 0;

    if (s.activeMs < MIC_GRACE_MS) return { verdict: "unknown", message: null };

    if (!s.track || s.track.readyState === "ended") {
      return {
        verdict: "dead",
        message: "Your microphone isn't attached to this call — hang up and call again. If it happens twice, pick another microphone below.",
      };
    }
    if (s.track.muted) {
      return {
        verdict: "dead",
        message: `${this.name()} isn't producing any audio — the system may have it muted, or another app is using it. Pick another microphone below, or free it up.`,
      };
    }
    if (this.stallMs >= MIC_STALL_MS) {
      return {
        verdict: "dead",
        message: "Your voice isn't leaving this browser — no audio is being sent. A VPN or firewall can block calls; try another network.",
      };
    }
    if (this.silentMs >= MIC_SILENT_MS) {
      return {
        verdict: "silent",
        message: `Nothing is coming through from ${this.name()} — the other side probably can't hear you. Check its mute switch, or pick another microphone below.`,
      };
    }
    return { verdict: "ok", message: null };
  }
}

/**
 * Input level (0..1) from an AnalyserNode's time-domain bytes: RMS around the
 * 128 midpoint, scaled so ordinary speech fills most of the meter.
 */
export function levelFromSamples(bytes: ArrayLike<number>): number {
  const n = bytes.length;
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = (bytes[i] - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / n) * 4);
}

/** localStorage key for the chosen microphone (a per-browser convenience, never sent to the server). */
export const MIC_CHOICE_KEY = "wb-softphone-mic";

/** A microphone's display name when the browser gives none (labels are blank until the site has permission). */
export function micLabelFor(d: { label: string; deviceId: string }, index: number): string {
  if (d.label.trim()) return d.label.trim();
  if (d.deviceId === "default") return "System default";
  return `Microphone ${index + 1}`;
}
