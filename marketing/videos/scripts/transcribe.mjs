// node scripts/transcribe.mjs <videoDir> <clipId> <path/to/source.mov>
// Copies the source into public/<videoDir>/<clipId>.<ext>, transcribes it with whisper.cpp (word timestamps),
// writes public/<videoDir>/<clipId>.words.json, and prints the transcript with [seconds] marks for planning cuts.
import fs from 'node:fs';
import path from 'node:path';
import {installWhisperCpp, downloadWhisperModel, transcribe, toCaptions} from '@remotion/install-whisper-cpp';
import {ff} from './lib.mjs';

const [dir, id, src] = process.argv.slice(2);
if (!src) throw new Error('usage: node scripts/transcribe.mjs <videoDir> <clipId> <source>');
const ext = path.extname(src);
fs.mkdirSync(`public/${dir}`, {recursive: true});
fs.mkdirSync('work', {recursive: true});
fs.copyFileSync(src, `public/${dir}/${id}${ext}`);
const wav = path.resolve(`work/${dir}-${id}.wav`);
ff(['-y', '-v', 'error', '-i', src, '-map', '0:a:0', '-ar', '16000', '-ac', '1', wav]);

const to = path.resolve('whisper.cpp');
const version = '1.5.5';
await installWhisperCpp({to, version});
await downloadWhisperModel({model: 'small.en', folder: to});
const out = await transcribe({inputPath: wav, whisperPath: to, whisperCppVersion: version, model: 'small.en', tokenLevelTimestamps: true});
const {captions} = toCaptions({whisperCppOutput: out});

// tokens → words
const words = [];
for (const t of captions) {
  if (!t.text.trim() || /\[/.test(t.text)) continue;
  if (t.text.startsWith(' ') || !words.length) words.push({text: t.text.trim(), startMs: t.startMs, endMs: t.endMs});
  else { const w = words.at(-1); w.text += t.text; w.endMs = t.endMs; }
}
// Known whisper mistakes — add to this list as they come up (also in PLAYBOOK.md)
const fixes = [[/^work ?bench/i, 'WorkBench'], [/^movable,$/, 'immovable,']];
for (const w of words) for (const [re, r] of fixes) w.text = w.text.replace(re, r);
// "15, 58," → "15:58," (Bible references read aloud)
for (let i = 0; i < words.length - 1; i++)
  if (/^\d+,$/.test(words[i].text) && /^\d+,?$/.test(words[i + 1].text) && /Corinthians|John|Romans|Psalm|Proverbs|Matthew|Genesis|Isaiah/i.test(words[i - 1]?.text ?? '')) {
    words[i].text = words[i].text.replace(',', ':') + words[i + 1].text; words[i].endMs = words[i + 1].endMs; words.splice(i + 1, 1);
  }
fs.writeFileSync(`public/${dir}/${id}.words.json`, JSON.stringify(words));
console.log(`\n=== ${dir}/${id} (${words.length} words)\n` + words.map((w) => `[${(w.startMs / 1000).toFixed(1)}] ${w.text}`).join(' '));
