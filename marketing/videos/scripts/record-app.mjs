// Phone-size recordings of the WorkBench APP (local prod build on :3077, signed in as the local
// Steadfast company — see PLAYBOOK.md "App b-roll") → public/broll/<take>.mp4 (786x1704, full phone screen).
// node scripts/record-app.mjs [take...]
import fs from 'node:fs';
import {chromium} from 'playwright';
import {recordTake, scrollBy} from './lib.mjs';

const BASE = 'http://localhost:3077';
const {token} = JSON.parse(fs.readFileSync('token.json', 'utf8'));
const browser = await chromium.launch();
const ctx = await browser.newContext({viewport: {width: 393, height: 852}, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
await ctx.addCookies([{name: 'next-auth.session-token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax'}]);
const page = await ctx.newPage();
const emu = await ctx.newCDPSession(page);
// iPhone 15 safe areas so the app lays out under the drawn status bar / home indicator
await emu.send('Emulation.setSafeAreaInsetsOverride', {insets: {top: 59, bottom: 34, left: 0, right: 0}});
const wait = (ms) => page.waitForTimeout(ms);
const scroll = (dy, ms) => scrollBy(page, dy, ms);
// Never show dev artifacts: localhost URLs → workbenchfsm.com; blur the fake login email
const clean = () => page.evaluate(() => {
  document.querySelector('nextjs-portal')?.remove();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode()); ) {
    if (n.nodeValue.includes('localhost:3077')) n.nodeValue = n.nodeValue.replaceAll('http://localhost:3077', 'https://workbenchfsm.com').replaceAll('localhost:3077', 'workbenchfsm.com');
    if (n.nodeValue.includes('.test')) n.parentElement.style.filter = 'blur(6px)';
  }
});
const go = async (p) => {
  await page.goto(BASE + p, {waitUntil: 'networkidle'}).catch(() => {});
  await clean(); await wait(1800);
  // one-device-per-login lock: each run is a "new device" — take it back
  const take = page.getByText('Use it here');
  if (await take.count()) { await take.first().click(); await wait(2500); }
  await clean();
};
const rec = (name, fn) => recordTake(ctx, page, name, fn);

const TAKES = {
  sfwDash: async () => { await go('/app/dashboard'); await rec('sfwDash', async () => { await wait(2500); await scroll(350, 2200); await wait(2000); }); },
  sfwSchedule: async () => { await go('/app/schedule'); await rec('sfwSchedule', async () => { await wait(3000); await scroll(250, 2000); await wait(3000); }); },
  sfwTeam: async () => { await go('/app/settings/team'); await rec('sfwTeam', async () => { await wait(2500); await scroll(250, 1800); await wait(1500); }); },
  sfwRequests: async () => { await go('/app/requests'); await rec('sfwRequests', async () => { await wait(3500); }); },
  sfwPricebook: async () => { await go('/app/settings/products'); await rec('sfwPricebook', async () => { await wait(1200); await scroll(500, 2400); await wait(1500); }); },
  sfwBooking: async () => { await go('/app/settings/booking'); await rec('sfwBooking', async () => { await wait(1500); await scroll(400, 2200); await wait(1500); }); },
};
for (const t of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TAKES)) await TAKES[t]();
await browser.close();
