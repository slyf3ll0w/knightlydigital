// Shared helpers — cross-platform (Mac + Windows). cwd = marketing/videos.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

/** Remotion's bundled ffmpeg (no system ffmpeg needed). Minimal build: no select/tile/fps filters — use -r/-s. */
export const ff = (args) => execFileSync('npx', ['remotion', 'ffmpeg', ...args], {stdio: ['ignore', 'inherit', 'inherit'], shell: process.platform === 'win32'});
export const ffprobe = (args) => execFileSync('npx', ['remotion', 'ffprobe', ...args], {encoding: 'utf8', shell: process.platform === 'win32'});

/**
 * CDP-screencast a phone-size page into public/broll/<name>.mp4.
 * Each frame is held until the next one arrives, so idle pages stay smooth.
 */
export async function recordTake(ctx, page, name, fn, {w = 786, h = 1704, tailMs = 3000} = {}) {
  const dir = path.join('takes', name);
  fs.rmSync(dir, {recursive: true, force: true});
  fs.mkdirSync(dir, {recursive: true});
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    const file = path.join(dir, String(frames.length).padStart(5, '0') + '.jpg');
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({file, t: f.metadata.timestamp});
    cdp.send('Page.screencastFrameAck', {sessionId: f.sessionId}).catch(() => {});
  });
  await cdp.send('Page.startScreencast', {format: 'jpeg', quality: 92, maxWidth: w, maxHeight: h, everyNthFrame: 1});
  const t0 = Date.now() / 1000;
  await fn();
  await page.waitForTimeout(tailMs); // tail so every take outlasts its slot
  const tEnd = Date.now() / 1000;
  await cdp.send('Page.stopScreencast');
  await cdp.detach();
  const kept = frames.filter((f) => f.t >= t0 - 0.05);
  if (frames.length && (!kept.length || kept[0].t > t0)) kept.unshift({...(frames.filter((f) => f.t < t0).at(-1) ?? frames[0]), t: t0});
  const list = [];
  kept.forEach((f, i) => list.push(`file '${path.resolve(f.file).replaceAll('\\', '/')}'`, `duration ${Math.max(0.001, (kept[i + 1]?.t ?? tEnd) - f.t).toFixed(4)}`));
  list.push(`file '${path.resolve(kept.at(-1).file).replaceAll('\\', '/')}'`);
  fs.writeFileSync(path.join(dir, 'list.txt'), list.join('\n'));
  fs.mkdirSync('public/broll', {recursive: true});
  ff(['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), '-r', '30', '-s', `${w}x${h}`, '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', path.resolve(`public/broll/${name}.mp4`)]);
  console.log(`take ${name}: ${(tEnd - t0).toFixed(1)}s, ${kept.length} frames${kept.length < 5 ? ' (static page — fine if nothing scrolls; check it is not a login/lock screen)' : ''}`);
}

/** Eased scroll of the page's main scroller (WorkBench app: main.app-main; websites: the document). */
export const scrollBy = (page, dy, ms = 1600) =>
  page.evaluate(([dy, ms]) => new Promise((res) => {
    const cands = [...document.querySelectorAll("main.app-main, [class*='overflow-y-auto']")].filter((e) => e.scrollHeight > e.clientHeight + 20);
    const el = cands.sort((a, b) => b.clientHeight - a.clientHeight)[0] ?? document.scrollingElement;
    const start = el.scrollTop, t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
    const step = (now) => { const t = Math.min(1, (now - t0) / ms); el.scrollTop = start + dy * ease(t); t < 1 ? requestAnimationFrame(step) : res(); };
    requestAnimationFrame(step);
  }), [dy, ms]);
