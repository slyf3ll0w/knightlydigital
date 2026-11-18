# Video editing playbook — David's social videos

**Claude: read this whole file before touching a video.** It is what David
likes, learned from the first video (`steadfast-ep1`, Nov 2026: car intro +
"office" walkthrough of the new Steadfast fence company, built with WorkBench).
Follow it and the first cut should need few revisions. When David gives a
new note, add it to "David's notes log" at the bottom so the next video starts
from it.

## What these videos are

David (WorkBench co-founder) documents starting **Steadfast Outdoor Living Co.**
— a real, brand-new fence / outdoor-living company in DFW — and running it on
WorkBench. Audience: home-service owners + people following the build. Viewers
know the business is brand new, so **empty screens are fine and honest**
(no clients yet, $0, "No requests yet"). Never fake activity, revenue,
reviews or customers.

Series so far: ep1 = why build a company with WorkBench, the website + Google
Business Profile, why the name (1 Corinthians 15:58), how it'll run (crews +
WorkBench for sales/admin). He said ep2 = **the ad spend**.

## Format

- **Vertical 1080×1920, 30 fps**, H.264 MP4, `--crf=18`. Output to
  `Downloads/Steadfast Video vN.mp4` (bump N each revision, keep old ones
  until he approves).
- Sources: phone clips (vertical) and webcam/desk clips (landscape 1280×720 —
  cropped to center on him with `objectFit: cover`).
- Several source clips play back to back with a quick white flash between.

## What David LIKED (keep doing)

1. **Captions** — every word, bold uppercase Montserrat 900, white with a
   black stroke, the spoken word in WorkBench orange `#F86808`, 1–3 words per
   page, pop-in. (`src/Captions.tsx` — don't restyle.) Fix whisper's
   spelling: "WorkBench" (capital B), "Steadfast", verse refs as `15:58`.
2. **Cutting to the real thing he's talking about**, timed to the word — he
   says "service pages" → the services page appears. Real website recordings
   in an iPhone frame on the blue WorkBench backdrop.
3. **The Bible verse card** — when he reads Scripture: full-screen card in the
   business's colors, reference in script font, the verse lighting up word by
   word as he reads it (key words in gold), his face small in a gold circle
   below. Captions hidden while it's up. Use ESV unless he reads another.
4. **The name reveal** — logo badge springs in + name in the brand's script
   font on the brand's paper color.
5. **WorkBench app clips of HIS business** (Steadfast), matching what he says.

## What David DISLIKED (never do)

1. **Random stock photos** as b-roll (fence photos from the site's stock
   folder were cut). If there's nothing real to show, stay on him or use a
   designed card — never generic imagery.
2. **App footage of a fake/unrelated demo company** (the old "Ridgeline" demo
   that greets "Edan"). Every WorkBench screen must be the Steadfast account
   (or whichever company the video is about), even if it's empty.
3. **Too much of him in the home office** — "it doesn't look the best". For
   desk/room footage: full-screen face only for the first ~2 seconds, then
   cover nearly everything with website/app/cards. Long personal stretches go
   in the **talk card** (him in a large gold circle on the brand-green
   background with a short script title like "Not in vain"). Car/outdoor
   phone footage is fine full-screen with occasional punch-in zooms.

## Defaults that went unremarked (fine to keep)

- WorkBench pill badge + orange topic tag at the top for the first ~6 s.
- Gentle punch-in zooms (1.12–1.15) on key lines while he's on camera.
- Orange progress bar along the bottom.
- "Next video: …" orange tag over the closing line when he teases the next
  video, then the WorkBench end card (logo, workbenchfsm.com, App Store ·
  Google Play · Web).

## Brand reference

- WorkBench: blue `#0B57D8`, orange `#F86808`, Montserrat. Logo `public/logo.png`.
- Steadfast (from steadfastoutdoorco.com CSS): green `#438051`, deep
  `#1f4c2c`, night `#142e1b`, paper `#fdf9f1` / `#f6eedd`, gold accent
  `#e7c873` (ours). Script font **Pacifico**, body Albert Sans, verse serif
  Lora. Badge `public/sf/steadfast-badge.svg`. Site: https://steadfastoutdoorco.com
  (About page has an "Our Name" section with the verse). WorkBench slug
  `steadfast-outdoor-living`; booking page
  https://workbenchfsm.com/book/steadfast-outdoor-living.
- The Steadfast site SOURCE is not in `workbench-sites` (only on David's PC
  at one point) — record the **live** site instead; that's what viewers see.
- Google Business Profile: Google blocks automated capture. Ask David for a
  screenshot/recording; until then a plain card ("Google Business Profile is
  live · First reviews from family & friends") — no stars or ratings.

## The workflow (fastest path to an approved cut)

Everything runs from `marketing/videos/` (Mac or Windows). One-time:
`npm install` here, and `npx playwright install chromium`.

1. **Get the clips.** David drops them in Downloads. Probe each:
   `npx remotion ffprobe -v error -show_entries format=duration:stream=codec_type,width,height -of compact "<file>"`.
   Order = how he tells you (default: intro/car first, then the walkthrough).
2. **Transcribe** each clip (copies it into `public/<dir>/`, writes word
   timings, prints a `[seconds]` transcript):
   `node scripts/transcribe.mjs <dir> <clipId> "<path to clip>"`
   (first run downloads whisper.cpp + the small.en model). Read the
   transcript; fix new mis-hearings in the `fixes` list.
3. **Plan shots against the transcript**: for every noun he names, what is
   the REAL thing to show? (site page, app screen, verse, logo). Cut a beat
   before the word. Note gaps where only a talk card fits.
4. **Record b-roll** that doesn't exist yet:
   - Website: add a take to `scripts/record-site.mjs`, run
     `node scripts/record-site.mjs <take>`.
   - WorkBench app: see "App b-roll" below, then
     `node scripts/record-app.mjs <take>`.
   Check takes by grabbing frames:
   `npx remotion ffmpeg -y -v error -ss 3 -i public/broll/<take>.mp4 -frames:v 1 -s 262x568 work/<take>.jpg`
   and LOOK at them (a 2–3 frame take = static page; make sure it isn't a
   login or "This login is in use" screen).
5. **Edit**: copy `src/videos/steadfast-ep1/` to a new folder, write its
   `edit.ts` (segments + shots — that file is the whole edit decision list),
   register it in `src/Root.tsx`.
6. **Check stills before rendering**:
   `npx remotion still src/index.ts <id> work/f<frame>.png --frame=<n> --scale=0.25`
   at 6–10 key moments; tile and look.
7. **Render** (~6 min for 3 min of video):
   `npx remotion render src/index.ts <id> "<Downloads>/Steadfast Video vN.mp4" --crf=18`
8. Send David the file path + a short list of what to check and what's
   still a placeholder. Apply notes in `edit.ts`, re-render vN+1.

Shot kinds in `edit.ts`: `face` (+`zoom`), `site` (website take, content-only
786×1518, status bar drawn), `app` (app take, full 786×1704 screen), `gbp`,
`name`, `verse`, `talk` (+`title`), `photo` (exists, but David dislikes stock —
only for HIS real photos, e.g. a finished job).

## App b-roll (recording WorkBench as Steadfast)

David can't sign in from an automated browser (Turnstile), and the real
account is nearly empty anyway, so we record a **local copy** of WorkBench
with a Steadfast company that mirrors the real one (logo, green brand
color, phone, hours, the 8 services, Service Inquiry + Free estimate items —
all pulled from the public site-data endpoint). Nothing touches production.

1. A checkout of the repo at `main` (a `git worktree` is cleanest so you
   don't disturb his working branch).
2. Local Postgres: `node scripts/local-db.mjs` (leave running; port 54329).
3. `.env.local` in the repo root with ONLY local values:
   `DATABASE_URL=postgresql://wb:wb@localhost:54329/workbench`,
   `AUTH_SECRET=<any random string>`, `NEXTAUTH_URL=http://localhost:3077`.
   (Don't add NEXTAUTH_SECRET.) Load it into the shell, then from the repo
   root: `npx prisma generate`, `npx prisma db push --skip-generate`,
   `npx tsx marketing/videos/scripts/seed-steadfast.mts` (refuses any
   non-localhost DB; writes `marketing/videos/token.json`),
   `npx next build`, `npx next start -p 3077`.
4. `node scripts/record-app.mjs` (from `marketing/videos/`). It swaps
   "localhost:3077" for workbenchfsm.com on screen, blurs the fake login
   email, and clicks through the one-device lock.
5. If the worktree shares `node_modules` with his main checkout, re-run
   `npx prisma generate` in the main checkout afterwards.

Screens used in ep1 (and what line they matched): Dashboard "Good afternoon,
David" + Get started 2/7 ("use WorkBench to start a company"), Booking &
forms ("show what this software can do"), Schedule ("I'm not able to do the
work"), Team with "Add team member" ("hiring crews"), Requests ("sales"),
price book ("admin side"), the public booking page ("get this going
quicker"). Settings → Website redirects to the settings list locally — skip it.

## Machine notes

- No system ffmpeg needed: `npx remotion ffmpeg` / `npx remotion ffprobe`
  (Remotion's own build — no `select`/`tile`/`fps` filters; use `-r`/`-s`).
  Tile contact sheets with Python PIL or just look at single frames.
- Media is gitignored (`public/**/*.mov|mp4|wav|webp|jpg`) — source clips
  and b-roll live only on the machine that made them. Re-record b-roll with
  the scripts; it's fast. Committed: code, `logo.png`, the Steadfast badge,
  ep1's `*.words.json`.
- Windows: run commands in PowerShell or Git Bash; paths with spaces in
  quotes. Playwright needs `npx playwright install chromium` once.

## David's notes log

- 2026-11-17 v1 → liked: captions, Steadfast website cuts, the verse card.
  Disliked: random stock photos; WorkBench clips of "random stuff" (demo
  company); too much of him in the office.
- 2026-11-17 v2 → couldn't sign in to record the real account: "just mimic
  the dashboard since there is nothing there anyway, make sure to show
  relevant stuff". Approved v2 as final ("i am happy with it").
