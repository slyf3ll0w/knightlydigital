# Gallery plan — phase B test recipes (2026-10-30)

What shipped in phase B (plan: `docs/plans/job-photos-companycam-2026-09-25.md`):
before/after **pairs** (pair in the viewer, "Pair up" from the shooting
order, "match this angle" before an After shot), the **BeforeAfter** card
(drag slider on phones and in the client hub, side by side on a desk), and
the **Work completed report** — a note to the client, a PDF, the client's
hub page (`/hub/<token>/work/<job>`), sent by email and/or text from the job
page, offered right after **Complete job**, rideable on the invoice email
("Include the work report"), and an automation action **Send the work
report** with a `{job_report_link}` field.
Automated: `npm run e2e -- photos` and `npx tsx scripts/test-photos.ts`.

**Preview only:** all of this shows up for **test accounts** until David
opens it (`GALLERY_OPEN=1`). Pairs and the report are Gallery-plan parts:
with `PLAN_GATING=1` a Core account sees the plan card on the Work report
fold and no pairing controls (test accounts pass every gate).

Run these on **staging** on a phone (the app, or the site in a phone
browser) and once on desktop. Every step has an **Expect** line; a mismatch
is a finding.

## 1. Match this angle (phone)

1. Open a scheduled job → **Photos**. Stage picker **Before**, take two
   shots of two different spots (say the panel, then the meter).
2. Switch the picker to **After**, tap **Take photo**.
   - **Expect:** before the camera opens, a black screen shows the FIRST
     Before shot with "Match this angle — stand where the Before shot was
     taken", and two buttons: **Open camera** and **Skip pairing**.
3. Tap **Open camera**, shoot.
   - **Expect:** the new After appears, and a **Before & after** card
     appears at the top of the fold showing the two side by side (desktop)
     or with a drag handle (phone). Drag the handle; the divide follows.
4. **Take photo** again (still After).
   - **Expect:** the angle screen now shows the SECOND Before (the first is
     taken). **Skip pairing** → the camera opens straight away and the new
     After is loose (no card for it).
5. In a browser (no native camera) with stage **After** and a loose Before:
   **Add photos**.
   - **Expect:** the same angle screen; **Pick the photo** opens the file
     picker; only the first file of a multi-pick is paired.

## 2. Pair up and the viewer

1. On a job with two loose Befores and two loose Afters (no pairs):
   - **Expect:** a **Pair up 2 before-and-afters** button above the grid
     with "Matched in the order they were taken".
2. Tap it.
   - **Expect:** two Before & after cards; the button is gone.
3. Open an After in the viewer.
   - **Expect:** five actions: Stage · **Paired · Before** · Client sees it ·
     Use on website (owners) · Delete. Tap **Paired · Before** → "Take this
     photo out of its pair?" → **Unpair** → the action reads **Pair**.
4. Tap **Pair**.
   - **Expect:** a strip of the loose Before thumbnails. Tap one → the pair
     is made, the card appears behind the viewer. Open a **During** photo:
     no Pair action (it is neither side). Open an Estimate photo that rode
     over from a quote: it pairs as a Before.
5. Delete one half of a pair.
   - **Expect:** the card disappears; the other half is loose again.

## 3. The work report (staff side)

1. Complete the job (**Complete job**).
   - **Expect:** right after, a sheet "Send <first name> the work report?"
     with a note box and **Send report** / **Not now**. It says how many
     photos are marked for the client. **Not now** → nothing is sent.
2. The job page now has a **Work report** fold (open by default until sent).
   - **Expect:** a sentence like "The client gets 2 before-and-after and 1
     photo, plus the 3-item checklist", "N hidden" with an (i), a note box,
     **Send report**, **Preview PDF**.
3. Type a note → **Save note** → reload.
   - **Expect:** the note is still there.
4. **Preview PDF**.
   - **Expect:** a letter-size PDF: company header, WORK COMPLETED, PREPARED
     FOR, the job title, facts (job #, where, technician / crew, sign-off
     when captured), the note, BEFORE & AFTER rows (two images each with
     captions), PHOTOS grid (visible singles only, 3 per row), WORK
     COMPLETED checklist (done items with +, skipped ones with the reason).
     Hidden photos (a During, a loose Before) are NOT in it.
5. **Send report** → pick Email and/or Text → Send.
   - **Expect:** the send ritual, "Sent <date>" under the buttons, and a job
     note "Work report emailed to … / texted to …". The fold header reads
     **Sent**. Sending again works (**Send again**).
6. A client with no email and no textable phone.
   - **Expect:** Send is disabled with "Add an email or a textable phone".
   - On **Complete job** no report sheet appears.

## 4. The client's side

1. Open the email.
   - **Expect:** "Work completed: <job title>" from the company; "We've
     finished <title>. Here's your report, with 2 before-and-after
     comparisons, 1 photo and the 3-item checklist."; the note; **See the
     report**; a "Download the PDF" line.
2. Tap **See the report**.
   - **Expect:** the client hub page: Work completed card (completed date,
     technician/crew, where, sign-off), the note as a quote, **Download the
     PDF**; Before & after with drag sliders; Photos grid (tap → full-screen,
     swipe); What was done.
3. The hub **Home** now has a **Completed work** card with the latest
   visits → **See all** lists every completed visit with a cover photo.
4. Paste a hidden photo's hub URL (`/hub/<token>/photos/<id>` of a During).
   - **Expect:** not found. Change the token to a wrong one: not found.
5. Text: the client gets "<Company> has finished <title>. Here's your work
   report with photos: <link>" from the business line.

## 5. On the invoice and in automations

1. Create the invoice from the completed job → **Send to client**.
   - **Expect:** the send sheet carries **Include the work report** (ticked
     when the report hasn't been sent yet, with an (i)). Send → the invoice
     email has a "See the work report" line above the PDF link, and the job's
     Work report fold now says **Sent**. Untick → no line.
2. Automations → new rule: when **a job is marked complete** → **Send the
   work report**. Complete a job for a client with an email.
   - **Expect:** the run log says "work report emailed"; while the job is
     still open the action is "skipped: Mark the job complete first…".
3. Any job automation's template fields list **Work report link**
   (`{job_report_link}`): empty while the job is open, the hub link once
   it is done.

## Not in phase B (coming in C–D)

The `/app/gallery` feed, the contact property gallery, the stitched
before/after JPEG for texts and the website, markup, Atlas vision, Save to
quote from texts, form uploads, MMS.
