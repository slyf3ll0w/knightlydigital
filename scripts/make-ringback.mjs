// Generates public/ringback.wav — the US ringback tone (440 Hz + 480 Hz,
// 2 s on / 4 s off) callers hear while the owner's cell is being tried and
// the whisper plays (lib/voice.ts plays it in a loop via playback_start).
// 8 kHz 16-bit mono PCM: what the PSTN carries anyway, ~96 KB for 6 s.
//   node scripts/make-ringback.mjs
import { writeFileSync } from "node:fs";

const rate = 8000;
const seconds = 6;
const samples = rate * seconds;
const data = Buffer.alloc(samples * 2);
for (let i = 0; i < samples; i++) {
  const t = i / rate;
  const on = t < 2;
  // Gentle 20 ms ramps so the tone doesn't click on and off.
  const env = !on ? 0 : t < 0.02 ? t / 0.02 : t > 1.98 ? (2 - t) / 0.02 : 1;
  const v = env * 0.25 * (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 480 * t));
  data.writeInt16LE(Math.round(v * 32767), i * 2);
}
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + data.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(rate, 24);
header.writeUInt32LE(rate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(data.length, 40);
writeFileSync("public/ringback.wav", Buffer.concat([header, data]));
console.log(`public/ringback.wav: ${((44 + data.length) / 1024).toFixed(0)} KB`);
