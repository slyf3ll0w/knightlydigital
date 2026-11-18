# Getting Workbench listed in Claude, ChatGPT and Grok (2026-11-17)

David: "how can we get it to where i can connect my Claude, ChatGPT, Grok etc.
without the custom connectors thing, where i can just sign in like i have done
for Railway for you for example?"

## The short answer

The sign-in part already exists. What you did for Railway (pick it from a
list, sign in, press Allow) is what a person does on WorkBench's `/connect`
page today. The only missing piece is the **list**: Railway is in Claude's
connector directory, and WorkBench is not in anyone's yet. Until it is, a
person has to paste `https://workbenchfsm.com/api/mcp` once.

Getting listed is a submission to each AI company, made from your accounts.
It cannot be built from this side. Checked on the web 2026-11-17; these
programs change, so read each company's current page before submitting.

## What each one needs

| | Claude (Anthropic) | ChatGPT (OpenAI) | Grok (xAI) |
|---|---|---|---|
| Is there a public list? | Yes, the Connectors Directory | Yes, the ChatGPT directory (apps are submitted as plugins) | Not confirmed. Grok takes a custom connector by address. One third-party guide describes a catalog you ask xAI about directly |
| Where to submit | A portal inside Claude (their docs name `claude.ai/directory/manage` and the admin settings) | The OpenAI Platform; steps at `developers.openai.com/plugins/deploy/submission` | Contact xAI |
| Who can submit | A paid Claude plan (an Owner on Team or Enterprise) | A verified individual or organization on the OpenAI Platform | Unknown |
| What happens | Scanned automatically and listed as a Community connector; they may later review it for the Verified label | Reviewed before it is listed | Unknown |

## What reviewers check, and where WorkBench stands

| Requirement | Who asks | Status |
|---|---|---|
| A public https address for the connector | Both | Done: `https://workbenchfsm.com/api/mcp` |
| Sign-in with OAuth, on our own domain | Both | Done |
| Every tool has a title and says whether it only reads | Claude | Done 2026-11-17 |
| Every tool states all three hints (read-only, destructive, open-world) | ChatGPT | Done 2026-11-17 |
| Tool names 64 characters or fewer | Claude | Done (tested) |
| Reads and writes are separate tools | Claude | **Mostly.** Some tools take an action argument (`manage_task`, `manage_time_block`, `quickbooks`, `browse_library` and others). Any that both look up and change in one tool may be sent back; splitting them is the fix. Not audited tool by tool yet |
| Tool descriptions say what the tool does and do not tell the AI how to behave | Both | **Risk.** Atlas's descriptions include guidance written for Atlas ("check get_price_book first", "never invent prices"). A reviewer may want those trimmed for the connector |
| Does not transfer money | Claude | Done 2026-11-17: refunds, card charges, payouts and billing runs are not offered |
| Does not show subscription plans or sell digital goods | ChatGPT | Fine: it shows the owner's own business records, sells nothing |
| Every tool works and gives a clear error | Both | Not tested with a real app yet |
| Public documentation | Claude | Done: the Help article "Connect Claude or ChatGPT to WorkBench" |
| A privacy policy that covers it | Both | **Needs your edit**, see below |
| A demo account with sample data for the reviewer, with a login that works without a new sign-up or a phone code | ChatGPT (Claude asks if they review for Verified) | **To do.** A demo company exists (`streamflare-demo-co`); it needs a reviewer login |
| A support contact | ChatGPT | You have one; put it in the form |
| An icon and a short description | Both | To write at submission (copy below) |
| You tested every tool as a custom connector first | Claude | **To do**, the test in the next section |

## Order to do it in

1. **Test it for real** as a custom connector in Claude: add the address,
   Allow, ask "who owes me money?", have it draft a quote, approve the quote
   under Connected apps. Do the same in ChatGPT. Anything that fails gets
   fixed before a reviewer sees it.
2. **Update the privacy policy** (text below).
3. **Make the reviewer's demo login.**
4. **Submit to Claude first.** It lists you as a Community connector without
   waiting on a person, so it is the fastest way to "pick WorkBench from the list".
5. **Verify your organization with OpenAI, then submit to ChatGPT.**
6. **Email xAI** to ask how catalog listings work. Until then Grok users
   paste the address.

## Privacy policy: two things to change

Legal text on the live site is yours to approve, so nothing was changed.

**1. Section 6 (AI features) is out of date.** It says the AI is "currently
Google Gemini" and section on vendors lists "AI processing (Google)". Since
2026-11-05 the text features run on Anthropic's Claude, with Google as the
fallback and for speech. Both companies should be named.

**2. Add a section for connected apps.** Suggested wording:

> **Connected AI apps.** An owner or admin can choose to connect a
> third-party AI app (for example Claude or ChatGPT) to their WorkBench
> account. When they do, the records that person asks the app about are sent
> to the company that provides that app, including client names, contact
> details, addresses, jobs, quotes, invoices and payments. That company's own
> terms and privacy policy apply to what it receives. A connected app can
> read what the person who connected it can see, and can prepare changes that
> the person must approve inside WorkBench; it cannot save, send or delete
> anything on its own, and it cannot move money. We keep a record of which
> actions a connected app took and when, for 90 days, but not the data it
> read. A connection can be removed at any time in Settings → Connected apps,
> and the account owner can turn connected apps off for the whole company.

## Listing copy (edit freely)

- **Name:** WorkBench
- **One line:** Run your field-service business from your AI app: clients,
  schedule, quotes, invoices and reports.
- **Description:** WorkBench is software for home-service companies. Connect
  it to ask questions about your business ("who owes me money?", "what's on
  tomorrow?") and to prepare work like quotes, jobs and client emails.
  Anything it prepares waits in WorkBench for your approval; nothing is
  saved, sent or charged from the AI app. Owners and admins only.
- **Example prompts:** "Who owes me money?" · "What's on the schedule
  tomorrow?" · "Draft a quote for the Hendersons for a 140 ft cedar fence." ·
  "How did we do last month compared with the month before?"

## Sources

- https://claude.com/docs/connectors/building/review-criteria.md
- https://claude.com/docs/connectors/building/submission.md
- https://developers.openai.com/apps-sdk/app-submission-guidelines
- https://docs.x.ai/developers/tools/remote-mcp
- https://satsuma.ai/blog/grok-connector-guide (third party; the only source for a Grok catalog)
