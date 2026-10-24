---
name: ticket
description: Pull a WorkBench feedback ticket — a "Suggest a change" request (picture of the screen + the tapped element + page/device + recent errors), an Atlas conversation report, or a plain bug/suggestion — and act on it. Use when David says "do ticket abc123", "ticket latest", "what tickets are open", or pastes a ticket id or #short-id.
---

# Pull a ticket and act on it

Tickets are `FeedbackTicket` rows. A ticket's handle is the last six
characters of its id (`#ab12cd`, shown on /superadmin/feedback and in the
app after sending). `scripts/ticket.mts` pulls one and writes everything to
`.tickets/` (gitignored).

## 1. Pull it

From the repo (any worktree), against production. The Railway CLI will not
run as a child of node on this machine, so pipe the variables in:

```bash
{ railway variables -s Streamflaire -e production --json; echo "<<<SEP>>>"; railway variables -s Postgres -e production --json; } | npx tsx scripts/ticket.mts --stdin <id-or-short-id>
```

- `open` instead of an id lists open tickets; `latest` takes the newest.
- Tickets filed on staging live in the staging database: use `-e staging`
  on both `railway variables` calls.
- If the permission classifier denies the production read, ask David to run
  the same command with the `!` prefix so its output lands in the
  conversation; the files it writes are what you need next.

## 2. Read what came back

- `.tickets/<short>.md` — the note (section 1, the submitter's own words)
  and the capture: WHERE (route, target, path, pages visited), ELEMENT (the
  tapped element's attributes, classes, text and HTML), SCREEN (viewport,
  theme, device, user), RECENT ERRORS, FAILED REQUESTS.
- `.tickets/<short>.png|jpg` — the screen as the user saw it, the pick
  boxed in red. Read it with the Read tool to see the picture.
- `.tickets/<short>.json` — the raw capture, if a script needs it.

## 3. Do the work

- The ELEMENT section is the grep key: its Tailwind classes and text
  usually land on one component in `app/platform/**` or `components/**`;
  the `path` chain confirms which one.
- "How it looks" → a visual change; "How it works" → check RECENT ERRORS
  and FAILED REQUESTS first, they often name the bug outright.
- Build, check, release the usual way (staging → green → main). Name the
  ticket in the commit message (`… (ticket #ab12cd)`) and, once live, mark
  it on /superadmin/feedback or tell David which short id shipped.
