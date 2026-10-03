import type { HelpSection } from "../types";

export const quotesSection: HelpSection = {
  id: "quotes",
  title: "Quotes",
  icon: "quotes",
  tagline: "Price the work, get it signed, turn it into a job.",
  articles: [
    {
      slug: "create-and-send-a-quote",
      title: "Create and send a quote",
      summary: "Build a quote from your price book, add a deposit, and email it for the client to approve online.",
      keywords: ["estimate", "proposal", "bid", "line items", "price book", "email quote", "new quote"],
      where: { label: "Quotes", href: "/app/quotes" },
      roles: "Owners, admins and sales",
      blocks: [
        {
          type: "steps",
          items: [
            "Go to **Quotes** and press `New`.",
            "Pick the **client** and the property address (it starts on their primary address).",
            "Give it a **title**, then add line items. Pick services from your price book, or type a description, quantity and unit price and press `Add line item`.",
            "Optional: set tax, a discount (% or $), a deposit, a **Client message**, **Terms**, and a **Valid until** date. **Internal notes** are never shown to the client.",
            "Press `Save Quote`. It saves as a **Draft**.",
            "Press `Send to Client` (it reads `Email to Client` until texting is on). The client gets a link to view, sign and approve it; when they have both an email and a phone that takes texts, you pick **Email**, **Text** or both first — the text goes from your business line. The status moves to **Awaiting Response**.",
          ],
        },
        {
          type: "tip",
          text: "Tick **Optional (client can remove it before approving)** on add-ons like a maintenance plan. The client can untick it and the total updates as they go.",
        },
        {
          type: "tip",
          text: "WorkBench sends follow-up emails by itself **3 and 7 days** after you send a quote that hasn't been answered.",
        },
        {
          type: "h",
          text: "Other ways to send it",
        },
        {
          type: "list",
          items: [
            "`Copy client link` in the ⋯ menu gives you the approval link to paste anywhere.",
            "`Download PDF` saves a printable copy.",
            "`Mark as Sent (no email)` changes the status only. Use it when you handed the quote over in person.",
            "Quotes are never texted, because carriers treat quote texts as marketing. Email or the link are the ways to send them.",
          ],
        },
        {
          type: "faq",
          items: [
            {
              q: "I pressed Send to Client and got \"Email isn't set up on this server yet.\"",
              a: "Emails to clients switch on once your business is approved for payments (see [Activate your account](/help/activate-payments)). Until then, use `Copy client link` and send the link yourself.",
            },
            {
              q: "The button says Mark as Sent instead of Send to Client.",
              a: "The client has no email address on file and no phone that can be texted. Add one on their client page, or copy the link and send it another way.",
            },
            {
              q: "I left a quote and it asked \"Send this quote first?\"",
              a: "The quote is still a Draft nobody has sent. `Stay` keeps you on it; `Leave without sending` lets you go and the draft waits. Send it, or press `Mark as Sent` if you delivered it another way, and the question stops.",
            },
            {
              q: "I can't edit my quote.",
              a: "Quotes can be edited while they're Draft, Awaiting Response or Changes Requested. Once approved or converted they're locked, so the client's signature always matches what they signed. Use `Duplicate Quote` to start a new version.",
            },
          ],
        },
      ],
    },
    {
      slug: "quote-approval-and-deposits",
      title: "How clients approve quotes (and pay deposits)",
      summary: "What the client sees, how signing works, and what WorkBench does the moment a quote is approved.",
      keywords: ["approve", "sign", "signature", "e-signature", "deposit", "changes requested", "expired", "mark approved"],
      where: { label: "Quotes", href: "/app/quotes" },
      blocks: [
        {
          type: "p",
          text: "The client opens the link and sees your quote with your logo and colors. From there they can:",
        },
        {
          type: "list",
          items: [
            "**Approve** it by typing their full name under **Sign by typing your full name** and pressing `Approve Quote`.",
            "**Request changes** with a note. The quote moves to **Changes Requested** and you're notified. Edit it and send it again.",
            "Untick any optional items before approving.",
          ],
        },
        {
          type: "h",
          text: "What happens when a quote is approved",
        },
        {
          type: "list",
          items: [
            "The quote is stamped **Approved**, with who signed and when.",
            "If a deposit is due, a **deposit invoice** is created and its pay link is emailed to the client.",
            "Any agreement set to go out \"when the quote is approved\" is sent for signature.",
            "If the client was a lead, their card moves to **Converted** on the Leads board.",
          ],
        },
        {
          type: "p",
          text: "Got a yes over the phone? Press `Mark Approved`. It does exactly what an online signature does.",
        },
        {
          type: "h",
          text: "Deposits",
        },
        {
          type: "p",
          text: "Choose **No deposit**, **Percent of total**, **Fixed amount** or **Full payment upfront** on the quote. Services in your price book can carry their own deposit rule, and everything else uses the default in Settings → Payments & accounting. You can also press `Collect deposit` before approval. The final invoice subtracts any deposit already paid, shown as **Deposit applied**.",
        },
        {
          type: "faq",
          items: [
            {
              q: "My client says the quote won't let them sign.",
              a: "The typed name has to match the client's name on file, and the page tells them whose name it expects. If the name on file is wrong, fix it on the client page. If the **Valid until** date has passed, the quote shows as Expired and can't be approved online. Change the date and send it again.",
            },
            {
              q: "The deposit invoice email didn't go out.",
              a: "The client's activity shows a note when that happens. Open the deposit invoice and press `Send to Client`, or copy its payment link.",
            },
          ],
        },
      ],
    },
    {
      slug: "convert-quote-to-job",
      title: "Turn an approved quote into a job",
      summary: "Convert to Job copies the approved lines onto a job you can schedule and later invoice.",
      keywords: ["convert", "job from quote", "agreement required", "awaiting agreement signature"],
      where: { label: "Quotes", href: "/app/quotes" },
      blocks: [
        {
          type: "video",
          src: "/video/tip-quote-to-job.mp4",
          poster: "/video/tip-quote-to-job-poster.jpg",
          title: "Quote to job in two taps (28 seconds, no sound)",
          text: "On a phone: open a quote that's Awaiting Response, press Mark Approved when the client says yes, then press Convert to Job. The quote shows Converted and links to the new job.",
        },
        {
          type: "steps",
          items: [
            "Open the approved quote.",
            "Press `Convert to Job`. The job gets every line the client kept (items they removed are left out).",
            "Schedule it from the job page. When the work is done, press `Create Invoice` on the job.",
          ],
        },
        {
          type: "tip",
          text: "Recurring lines (like a monthly service) start a recurring plan automatically when you convert.",
        },
        {
          type: "faq",
          items: [
            {
              q: "Convert to Job is replaced by \"Send Agreement\" or \"Awaiting agreement signature.\"",
              a: "One of the services on the quote needs a signed agreement first. Send it (or send it again). Once the client signs, the Convert button comes back.",
            },
            {
              q: "Can I invoice straight from a quote?",
              a: "Not directly. Convert it to a job, then press `Create Invoice` on the job. For a deposit, use the quote's deposit settings or `Collect deposit`.",
            },
            {
              q: "I archived a quote by mistake.",
              a: "Open it and press `Reopen Quote`. It goes back to Awaiting Response if it was sent, otherwise to Draft.",
            },
          ],
        },
      ],
    },
    {
      slug: "quote-and-invoice-numbers",
      title: "Change your quote and invoice numbers",
      summary: "Start numbering where your old system left off.",
      keywords: ["numbering", "invoice number", "quote number", "start at", "sequence"],
      where: { label: "Payments settings", href: "/app/settings" },
      roles: "Owners and admins",
      blocks: [
        {
          type: "steps",
          items: [
            "Go to **Settings → Payments & accounting → Numbering**.",
            "Set **Quotes start at** and **Invoices start at**. The hint shows the next number you'll get.",
            "Save.",
          ],
        },
        {
          type: "warn",
          text: "Numbers only ever go up. You can't set a number lower than one you've already used, and documents you've already made keep their numbers.",
        },
      ],
    },
  ],
};
