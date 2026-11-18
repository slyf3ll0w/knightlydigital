# Getting WorkBench listed in Claude, ChatGPT and Grok (2026-11-17)

David: "how can we get it to where i can connect my Claude, ChatGPT, Grok etc.
without the custom connectors thing, where i can just sign in like i have done
for Railway for you for example?" and then "can you give me a step-by-step of
what i need to do to become a partner of those apps?"

## The short answer

The sign-in part already exists. What you did for Railway (pick it from a
list, sign in, press Allow) is what a person does on WorkBench's `/connect`
page today. The only missing piece is the **list**: Railway is in Claude's
connector directory, and WorkBench is not in anyone's yet. Until it is, a
person pastes `https://workbenchfsm.com/api/mcp` once.

There is no "partner program" to join for this. Each AI company has a
self-serve submission. It is made from your accounts, so it cannot be done
from this side. Steps below are from each company's own docs, read
2026-11-17. These programs change; if a screen differs, follow the screen.

## Where things stand (2026-11-17, evening)

- Tested in Claude as a custom connector by David: worked.
- Reviewer account: the same WorkBench account used for Apple's app review.
- Claude: submission in progress in the portal.
- ChatGPT: business verification submitted to OpenAI; they said a few days.

## Before either submission (do these once)

1. **Test it for real.** In Claude: Settings → Connectors → Add custom
   connector → paste `https://workbenchfsm.com/api/mcp` → sign in → Allow.
   Then ask "who owes me money?", "what's on tomorrow?", and "draft a quote
   for <a client> for <a job>". Approve the quote under Settings → Connected
   apps in WorkBench. Do the same in ChatGPT. Both companies ask you to
   confirm you did this, and anything that breaks should break for you first.
2. **Make a reviewer account.** A separate WorkBench company with sample
   data, and an owner login for it that needs no phone code and no email
   link. Both reviewers will ask for it. Write the email and password down;
   you paste them into OpenAI's portal and email them to Anthropic only if
   they ask.
3. **Have these ready** (all exist today):
   - Documentation: `https://workbenchfsm.com/help` → "Connect Claude or
     ChatGPT to WorkBench"
   - Privacy policy: `https://workbenchfsm.com/privacy` (updated 2026-11-17
     with a connected-apps section)
   - Terms: `https://workbenchfsm.com/terms`
   - Support: `https://workbenchfsm.com/contact`
   - A square icon (the WorkBench mark), PNG, at least 512 px
   - The listing copy at the end of this file

## Claude (Anthropic): the faster one

Needs: any paid Claude plan (on Team or Enterprise, an Owner submits). No fee
is mentioned in their docs.

1. Go to `https://claude.ai/directory/manage`, press **Submit new**, choose
   **MCP connector**.
2. **Connection:** paste `https://workbenchfsm.com/api/mcp` (or pick the
   custom connector you added while testing).
3. **Tools:** it reads the tool list from the server. Every tool should show
   a title and a read-only or write label. If any is flagged, tell me which.
4. **Listing:** name (100 characters max), one-liner (200), description
   (2,000), one to five categories, the documentation, privacy and support
   links, the icon, and a URL slug. **The slug is permanent**; use `workbench`.
5. **Use cases:** what it is for, what a person needs first (a WorkBench
   account, owner or admin), and that it both reads and writes.
6. **Company:** Streamflaire Group LLC, the website, and your email for
   review updates.
7. **Authentication:** sign-in is **required**, method **OAuth**. Leave the
   client ID and secret empty: WorkBench lets Claude identify itself, so
   there is no client to hand over.
8. **Data handling:** the API is **your own**. No health data, no sponsored
   content.
9. **Test & launch:** confirm you ran every tool (step 1 above). Do not put
   the reviewer login here; they email you if they want it.
10. **Compliance:** seven boxes. Two to read carefully: "financial
    transactions" (WorkBench's connector does not move money; refunds, card
    charges and payouts were removed from it) and "prompt injection" (tool
    descriptions must describe, not instruct).
11. **Review and submit.**

After that: it is scanned automatically and normally listed as a **Community**
connector with nothing more from you. From then on anyone can pick WorkBench
from Claude's list. Anthropic may later look at it for the **Verified** label;
that is when a person tests each tool and asks for the reviewer login. Status
and feedback show at the same address. If it is stuck:
`mcp-review@anthropic.com`.

## ChatGPT (OpenAI): more to prepare

Needs: an OpenAI Platform organization where you are the owner, and identity
or business verification. A person reviews it before it is listed.

1. **Verify.** `https://platform.openai.com/settings/organization/general` →
   complete business verification as Streamflaire Group LLC (or individual
   verification under your own name). The directory shows the verified name.
2. **Build the package.** ChatGPT takes a ZIP, not just an address. It holds
   a `plugin.json` (the listing: name and subtitle of 30 characters each,
   description up to 4,000, the four links, up to three starter prompts of
   128 characters, brand color, logo) and an `mcp.json` (the server address
   and how it signs in; WorkBench supports both automatic registration and
   the metadata-document method). **I can build this ZIP**; say the word once
   step 1 is done, since the file format should be read fresh at that point.
3. **Write the review material** (goes in the package): five things it should
   do, each with the prompt, the tools it should use and what should happen;
   three things it should refuse or ask about; and a short screen recording
   of those. Drafts of the eight cases are below.
4. **Upload.** `https://platform.openai.com/plugins` → **Upload new or
   existing plugin** → pick your verified identity → upload the ZIP → fix
   anything it flags.
5. **Connect the server.** Open **MCPs** → **Connect** → confirm the address.
   It will show a **domain verification token**. Send me that token (or set
   it yourself as the `OPENAI_APPS_CHALLENGE` variable on Railway). WorkBench
   then serves it at `https://workbenchfsm.com/.well-known/openai-apps-challenge`,
   which is where OpenAI looks. Then sign in with the reviewer account when
   it asks, and wait for its tool scan.
6. **Review details:** paste the reviewer account's login address
   (`https://workbenchfsm.com/app/login`), email and password, and press
   **Save details**.
7. **Submit for review** and tick the policy boxes. Feedback comes by email;
   only one review can be open at a time.
8. **When approved,** open the approved version and press **Publish plugin**.
   It is not live until you do.

Things OpenAI rejects for that apply to us: a reviewer login that needs a
code or a new sign-up; a tool missing any of its three labels (done); a
privacy policy that does not cover it (done); showing or selling subscription
plans (the connector only shows the owner's own records).

## Grok (xAI)

No public list was found. Grok takes a pasted address today (grok.com →
Connectors → New connector → Custom), and WorkBench's address works there the
same way. One third-party guide says xAI keeps a catalog of sign-in
connectors and that listings are arranged with xAI directly.

1. Test WorkBench in Grok as a custom connector.
2. Email xAI's developer or partnerships contact, say WorkBench has a
   production connector with OAuth sign-in, and ask how to be added to the
   catalog.

## Where WorkBench stands against what reviewers check

| Requirement | Who asks | Status |
|---|---|---|
| A public https address | Both | Done |
| OAuth sign-in on our own domain | Both | Done |
| Every tool has a title and says whether it only reads | Claude | Done |
| Every tool states all three labels | ChatGPT | Done |
| Tool names 64 characters or fewer | Claude | Done (tested) |
| Does not transfer money | Claude | Done: refunds, card charges, payouts and billing runs are not offered |
| Domain verification address | ChatGPT | Done; needs the token from their portal |
| Public documentation, privacy policy, terms, support link | Both | Done |
| Reads and writes are separate tools | Claude | **Risk.** Some tools take an action argument (`manage_task`, `manage_time_block`, `quickbooks`, `browse_library` and others). Any that both look up and change in one tool may be sent back; splitting them is the fix. Not audited tool by tool yet |
| Descriptions describe the tool and do not instruct the AI | Both | **Risk.** Atlas's descriptions include guidance written for Atlas ("check get_price_book first", "never invent prices"). A reviewer may want those trimmed for the connector |
| Every tool works and gives a clear error | Both | Not tested with a real app yet |
| Reviewer account | ChatGPT; Claude if they review for Verified | To do (you) |
| The ZIP, eight test cases, demo recording | ChatGPT | To do (me for the ZIP and cases, you for the recording) |

## Listing copy (edit freely)

- **Name:** WorkBench
- **Subtitle (30 characters):** Run your service business
- **One line:** Run your field-service business from your AI app: clients,
  schedule, quotes, invoices and reports.
- **Description:** WorkBench is software for home-service companies. Connect
  it to ask questions about your business ("who owes me money?", "what's on
  tomorrow?") and to prepare work like quotes, jobs and client emails.
  Anything it prepares waits in WorkBench for your approval; nothing is
  saved, sent or charged from the AI app, and it cannot move money. Owners
  and admins only. Requires a WorkBench account.
- **Categories:** Business, Productivity
- **Starter prompts:** "Who owes me money?" · "What's on the schedule
  tomorrow?" · "Draft a quote for a client"

## The eight test cases for ChatGPT (drafts)

Should work:

1. "Who owes me money?" → `list_money` → a list of unpaid invoices with
   clients and amounts.
2. "What's on the schedule tomorrow?" → `get_schedule` → tomorrow's jobs and
   appointments with times.
3. "Find the client named Maria and tell me what we've done for her." →
   `search_clients`, `get_client_activity` → her jobs, quotes and invoices.
4. "Draft a quote for Maria for a 200A panel upgrade at $2,850." →
   `search_clients`, `create_quote` → says the quote is waiting for approval
   in WorkBench and gives the link; nothing is created yet.
5. "How did we do last month?" → `business_summary` → revenue, jobs and
   payments for the month.

Should refuse or ask:

6. "Refund Maria's last payment." → no tool does this; it should say refunds
   are done inside WorkBench.
7. "Email every client that we're closing." → it should ask which clients and
   what to say, and anything it prepares waits for approval.
8. "Delete all my invoices." → it should ask for confirmation of which ones;
   any delete it prepares waits for approval in WorkBench and needs the typed
   confirmation there.

## Their logos: not yet

David asked whether WorkBench can show Claude's and ChatGPT's logos on the
website and in the app. Read 2026-11-17; not legal advice.

- **Anthropic** (trademark guidelines): "You may only use our trademarks as
  specifically permitted by us and only in materials we approve beforehand."
  No altering the marks, nothing that implies sponsorship or affiliation. To
  ask: `marketing@anthropic.com` (the page says this is for companies with an
  existing business relationship; a directory listing is the relationship to
  point to).
- **OpenAI** (brand guidelines; the page blocked automated reading, so this is
  from search summaries of it): do not imply endorsement or partnership, do
  not alter the logo or make it more prominent than your own, do not use
  "GPT" in a product name. Logo permission requests: `partnercomms@openai.com`.
- **xAI:** not looked up.

So: **names in plain type are used, logos are not.** The Connected apps page
and the site say "Claude", "ChatGPT" and "Grok" as words, which is how any
product says what it works with. Logos go in only after each company says
yes in writing, using the files they supply, unaltered.

Best moment to ask: right after each directory listing is approved.

Draft to send (change the company name per recipient):

> Subject: Permission to show the Claude logo for our directory connector
>
> Hi, I'm David Lessly, owner of WorkBench (workbenchfsm.com), software for
> home-service businesses, operated by Streamflaire Group LLC. Our connector
> is listed in the Claude Connectors Directory as "WorkBench".
>
> We would like to show the Claude logo in two places, next to the word
> "Claude", to tell our customers the connection exists: (1) the Connected
> apps page inside our app, where they connect or disconnect it, and (2) one
> section of our website describing the integration. We would use your
> supplied files unaltered, at a size no larger than our own logo, with no
> wording that suggests sponsorship or partnership.
>
> Could you confirm whether this is permitted, and send the approved files
> and any rules we should follow? Happy to send screenshots for approval
> before anything goes live.

## Sources

- https://www.anthropic.com/legal/trademark-guidelines
- https://openai.com/brand/

- https://claude.com/docs/connectors/building/submission.md
- https://claude.com/docs/connectors/building/review-criteria.md
- https://developers.openai.com/plugins/deploy/submission
- https://developers.openai.com/apps-sdk/app-submission-guidelines
- https://docs.x.ai/developers/tools/remote-mcp
- https://satsuma.ai/blog/grok-connector-guide (third party; the only source for a Grok catalog)
