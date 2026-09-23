/**
 * Unit tests for lib/softphone-mic.ts — the browser softphone's microphone
 * watchdog (one-way-audio detection) and the level meter math.
 *   npx tsx scripts/test-softphone-mic.ts
 */
import assert from "node:assert/strict";
import { MIC_GRACE_MS, MIC_SILENT_MS, MIC_STALL_MS, MicWatchdog, levelFromSamples, micLabelFor, type MicSample } from "../lib/softphone-mic";

const live = { readyState: "live" as const, muted: false, enabled: true };
const base = (over: Partial<MicSample> = {}): MicSample => ({
  activeMs: 0,
  track: live,
  packetsSent: 0,
  peak: 0.2,
  mutedByUser: false,
  held: false,
  waiting: false,
  ...over,
});

/** Feed one sample per second for `secs` seconds; packets grow 50/s unless told otherwise. */
function run(w: MicWatchdog, secs: number, over: (t: number) => Partial<MicSample>) {
  let last = w.next(base({ activeMs: 0, ...over(0) }));
  for (let t = 1; t <= secs; t++) last = w.next(base({ activeMs: t * 1000, packetsSent: t * 50, ...over(t) }));
  return last;
}

// ── grace period ─────────────────────────────────────────────────────────────
{
  const w = new MicWatchdog("Headset");
  assert.equal(w.next(base({ activeMs: 0, track: null })).verdict, "unknown", "nothing is said in the first seconds");
  assert.equal(w.next(base({ activeMs: MIC_GRACE_MS - 1, track: null })).verdict, "unknown");
  const r = w.next(base({ activeMs: MIC_GRACE_MS, track: null }));
  assert.equal(r.verdict, "dead");
  assert.match(r.message ?? "", /isn't attached/);
}

// ── a healthy call ───────────────────────────────────────────────────────────
{
  const w = new MicWatchdog("Headset");
  const r = run(w, 20, () => ({}));
  assert.equal(r.verdict, "ok");
  assert.equal(r.message, null);
}

// ── the OS muted the device (track.muted) ────────────────────────────────────
{
  const w = new MicWatchdog("Webcam mic");
  const r = run(w, 5, () => ({ track: { ...live, muted: true }, peak: 0 }));
  assert.equal(r.verdict, "dead");
  assert.match(r.message ?? "", /"Webcam mic" isn't producing any audio/);
}

// ── the track ended ──────────────────────────────────────────────────────────
{
  const w = new MicWatchdog(null);
  const r = run(w, 5, () => ({ track: { ...live, readyState: "ended" } }));
  assert.equal(r.verdict, "dead");
}

// ── packets stop leaving ─────────────────────────────────────────────────────
{
  const w = new MicWatchdog("Headset");
  // Fine for 5 s, then the counter freezes.
  let r = run(w, 5, () => ({}));
  assert.equal(r.verdict, "ok");
  for (let t = 6; t <= 5 + MIC_STALL_MS / 1000 - 1; t++) {
    r = w.next(base({ activeMs: t * 1000, packetsSent: 250 }));
    assert.equal(r.verdict, "ok", `still within the stall window at ${t}s`);
  }
  r = w.next(base({ activeMs: (5 + MIC_STALL_MS / 1000) * 1000, packetsSent: 250 }));
  assert.equal(r.verdict, "dead");
  assert.match(r.message ?? "", /isn't leaving this browser/);
  // Packets resume: clears.
  r = w.next(base({ activeMs: 20_000, packetsSent: 900 }));
  assert.equal(r.verdict, "ok");
}

// ── stats unavailable: no stall verdict, silence still judged ────────────────
{
  const w = new MicWatchdog("Headset");
  const r = run(w, 20, () => ({ packetsSent: null }));
  assert.equal(r.verdict, "ok");
  const w2 = new MicWatchdog("Headset");
  const r2 = run(w2, MIC_SILENT_MS / 1000 + 1, () => ({ packetsSent: null, peak: 0 }));
  assert.equal(r2.verdict, "silent");
}

// ── silence: track fine, packets flowing, nothing heard ──────────────────────
{
  const w = new MicWatchdog("Realtek Audio");
  let r = run(w, MIC_SILENT_MS / 1000 - 1, () => ({ peak: 0.001 }));
  assert.equal(r.verdict, "ok", "silence under the threshold is tolerated");
  r = w.next(base({ activeMs: MIC_SILENT_MS, packetsSent: 9999, peak: 0.001 }));
  assert.equal(r.verdict, "silent");
  assert.match(r.message ?? "", /"Realtek Audio"/);
  // They speak: the warning clears at once.
  r = w.next(base({ activeMs: MIC_SILENT_MS + 1000, packetsSent: 10_050, peak: 0.3 }));
  assert.equal(r.verdict, "ok");
}

// ── mute / hold: no verdict, and the counters don't carry over ───────────────
{
  const w = new MicWatchdog("Headset");
  let r = run(w, 4, () => ({}));
  // 30 s muted with a frozen counter and silence: nothing is said.
  for (let t = 5; t <= 35; t++) {
    r = w.next(base({ activeMs: t * 1000, packetsSent: 200, peak: 0, mutedByUser: true }));
    assert.equal(r.verdict, "ok");
    assert.equal(r.message, null);
  }
  // Unmuted: the stall and silence clocks start from zero.
  r = w.next(base({ activeMs: 36_000, packetsSent: 200, peak: 0 }));
  assert.equal(r.verdict, "ok");
  r = w.next(base({ activeMs: 37_000, packetsSent: 200, peak: 0 }));
  assert.equal(r.verdict, "ok");
  const wh = new MicWatchdog("Headset");
  r = run(wh, 30, () => ({ held: true, peak: 0, packetsSent: 0 }));
  assert.equal(r.verdict, "ok");
  // Outbound, customer still ringing: quiet is expected, no verdict.
  const ww = new MicWatchdog("Headset");
  r = run(ww, 30, () => ({ waiting: true, peak: 0, packetsSent: 0 }));
  assert.equal(r.verdict, "ok");
  assert.equal(r.message, null);
}

// ── certainty order: a muted track beats a stalled counter beats silence ─────
{
  const w = new MicWatchdog("Headset");
  const r = run(w, 12, () => ({ track: { ...live, muted: true }, packetsSent: 0, peak: 0 }));
  assert.match(r.message ?? "", /isn't producing any audio/);
}

// ── levelFromSamples ─────────────────────────────────────────────────────────
{
  assert.equal(levelFromSamples([]), 0);
  assert.equal(levelFromSamples(new Uint8Array(256).fill(128)), 0, "flat line = silence");
  const loud = new Uint8Array(256);
  for (let i = 0; i < 256; i++) loud[i] = i % 2 ? 255 : 1;
  assert.equal(levelFromSamples(loud), 1, "full-scale square wave pins the meter");
  const quiet = new Uint8Array(256);
  for (let i = 0; i < 256; i++) quiet[i] = i % 2 ? 132 : 124;
  const q = levelFromSamples(quiet);
  assert.ok(q > 0.1 && q < 0.2, `speech-ish input sits mid-meter (${q})`);
}

// ── micLabelFor ──────────────────────────────────────────────────────────────
{
  assert.equal(micLabelFor({ label: " Jabra Link ", deviceId: "abc" }, 3), "Jabra Link");
  assert.equal(micLabelFor({ label: "", deviceId: "default" }, 0), "System default");
  assert.equal(micLabelFor({ label: "", deviceId: "x" }, 1), "Microphone 2");
}

console.log("softphone-mic: all tests passed");
