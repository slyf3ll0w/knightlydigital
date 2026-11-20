// Phone-size recordings of a LIVE website → public/broll/<take>.mp4 (786x1518: content only;
// Video.tsx draws the status bar strip above, so sticky headers never collide with "9:41").
// node scripts/record-site.mjs [take...]      (no args = all takes)
import {chromium} from 'playwright';
import {recordTake, scrollBy} from './lib.mjs';

const BASE = 'https://steadfastoutdoorco.com';
const browser = await chromium.launch();
const ctx = await browser.newContext({viewport: {width: 393, height: 759}, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
const page = await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);
const scroll = (dy, ms) => scrollBy(page, dy, ms);
const go = async (url) => {
  await page.goto(url.startsWith('http') ? url : BASE + url, {waitUntil: 'networkidle'}).catch(() => {});
  await page.evaluate(() => document.querySelectorAll('img[loading=lazy]').forEach((i) => (i.loading = 'eager')));
  await wait(1500);
};
const rec = (name, fn) => recordTake(ctx, page, name, fn, {h: 1518});
/** Scroll so the <h2> matching re sits just under the sticky header. */
const toHeading = (re, offset = 230) => page.evaluate(([src, off]) => {
  const h = [...document.querySelectorAll('h2')].find((e) => new RegExp(src).test(e.textContent));
  document.scrollingElement.scrollTop = h.getBoundingClientRect().top + scrollY - off;
}, [re, offset]);

const TAKES = {
  sfHome: async () => { await go('/'); await rec('sfHome', async () => { await wait(1800); await scroll(700, 2600); await wait(1200); await scroll(800, 2600); await wait(1200); }); },
  sfServices: async () => { await go('/services/'); await rec('sfServices', async () => { await wait(1000); await scroll(900, 3000); await wait(600); }); },
  sfCities: async () => { await go('/service-area/'); await rec('sfCities', async () => { await wait(800); await scroll(700, 2400); await wait(400); }); },
  sfCity: async () => { await go('/service-area/mckinney-tx/'); await rec('sfCity', async () => { await wait(1000); await scroll(700, 2400); await wait(800); }); },
  sfOurName: async () => { await go('/about/'); await toHeading('Our Name'); await wait(800); await rec('sfOurName', async () => { await wait(1500); await scroll(90, 2500); await wait(3000); }); },
  sfContact: async () => { await go('/contact/'); await rec('sfContact', async () => { await wait(2500); await scroll(500, 2500); await wait(2500); await scroll(400, 2000); await wait(2000); }); },
  sfAbout: async () => { await go('/about/'); await rec('sfAbout', async () => { await wait(1500); await scroll(800, 3000); await wait(1500); await scroll(800, 3000); await wait(1500); }); },
  // WorkBench public booking page (real, no login needed)
  sfBook: async () => { await go('https://workbenchfsm.com/book/steadfast-outdoor-living'); await rec('sfBook', async () => { await wait(2000); await scroll(400, 2200); await wait(2000); }); },
};
for (const t of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TAKES)) await TAKES[t]();
await browser.close();
