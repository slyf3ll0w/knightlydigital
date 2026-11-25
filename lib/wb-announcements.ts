/**
 * Announcements on the WorkBench site (/announcements): one post per big
 * release, written like a short blog post — what is new, who it is for, how
 * to find it, and a link to its Help guide. The rule that says when one is
 * due is in CLAUDE.md ("Release announcements").
 *
 * To add one: put a new entry at the TOP of ANNOUNCEMENTS. The list page,
 * the post page, the sitemap, llms.txt and the footer link all read this
 * file; scripts/test-wb-site.ts checks each post is listed and that its Help
 * guide exists. Marketing-site rules apply: no prices typed in (use
 * lib/plans.ts), and never a real client's name.
 */

export const ANNOUNCEMENTS_PATH = "/announcements";

export type AnnouncementBlock =
  | { type: "p"; text: string }
  | { type: "h"; text: string }
  /** Bullets; `title` is set in bold ahead of the text */
  | { type: "list"; items: { title?: string; text: string }[] }
  | { type: "steps"; items: string[] };

export type Announcement = {
  slug: string;
  title: string;
  /** YYYY-MM-DD, the day it went live */
  date: string;
  /** One or two sentences: the list page, the meta description, llms.txt */
  summary: string;
  /** The small label over the title ("New", "Reports") */
  tag: string;
  blocks: AnnouncementBlock[];
  /** The Help guide that goes with it (lib/help slug) */
  help: { slug: string; label: string };
};

export const ANNOUNCEMENTS: Announcement[] = [
  {
    slug: "a-new-look",
    title: "WorkBench has a new look",
    date: "2026-11-25",
    tag: "New look",
    summary:
      "A cleaner WorkBench on your computer and your phone: your own colors up front, a sidebar that tells you what is waiting, and a phone app built the way iPhone apps are.",
    help: { slug: "find-your-way-around", label: "Find your way around" },
    blocks: [
      {
        type: "p",
        text: "Most people who run a service business open WorkBench a few times a day, between jobs, often on a phone. So we rebuilt how it looks around one question: can you see what needs you, and get to it, in a glance? Everything you use works the same as before. It is just clearer, calmer and more yours.",
      },
      { type: "h", text: "On your computer" },
      {
        type: "list",
        items: [
          {
            title: "Home wears your brand.",
            text: "Home opens on a band made from your company's colors, with a greeting, a short line about how your day looks, and your most-used buttons. Below it: what needs you, your money, and today's jobs.",
          },
          {
            title: "A sidebar that tells you what is waiting.",
            text: "Beside each page it says what is there right now: jobs today, quotes waiting on an answer, money owed. Groups fold away, and your uploaded logo sits at the top.",
          },
          {
            title: "Open, white pages.",
            text: "Every other page has its own clear header with a line about what is going on there, tabs with counts, and simple lists you can scan. No boxes inside boxes.",
          },
          {
            title: "A calmer Leads board.",
            text: "Quiet columns, white cards that are all the same size, and a line under each stage that grows with how much money is in it. Leads waiting more than a week stand out in amber.",
          },
        ],
      },
      { type: "h", text: "On your phone" },
      {
        type: "list",
        items: [
          {
            title: "Built like an iPhone app.",
            text: "The phone uses the same type, spacing and grouped lists as the apps that come with your iPhone, with statuses shown as a small colored dot and a word.",
          },
          {
            title: "Menu is your sidebar.",
            text: "Tap Menu and the same sidebar slides in from the left, with the same lines about what is waiting, and Atlas at the top.",
          },
          {
            title: "A new Create button.",
            text: "Tap + for the four things you make most as big buttons (job, quote, invoice, client), a Just say it line for Atlas, and everything else in one short list.",
          },
        ],
      },
      { type: "h", text: "Your colors, light or dark" },
      {
        type: "p",
        text: "WorkBench is drawn from the two colors you set under Settings, so it looks like your business, and it checks that your colors stay readable on every screen. It also comes in a dark look: pick Light, Dark or Automatic under Settings, on each device.",
      },
      {
        type: "p",
        text: "There is nothing to turn on. Open WorkBench and it is there.",
      },
    ],
  },
  {
    slug: "lead-sources",
    title: "See where your leads come from",
    date: "2026-11-17",
    tag: "New",
    summary:
      "Leads from your website are now filed by how the visitor found you, and a new report shows which sources turn into paying work.",
    help: { slug: "lead-sources", label: "See where your leads come from" },
    blocks: [
      {
        type: "p",
        text: "Most businesses can say how many leads came in last month. Far fewer can say which of them came from the ad, which from a search, and which from a neighbor's recommendation, or which of those turned into paid jobs. WorkBench now keeps track of that for you.",
      },
      { type: "h", text: "What is new" },
      {
        type: "list",
        items: [
          {
            title: "Website leads name their own source.",
            text: "When someone fills in a WorkBench form on your website, the lead is filed by how they got to your site: a click on a Google ad, a Google search, a link from Facebook, or typing your address. If the ad link carried a campaign name or a search term, that is saved on the lead too. It works when they browse a few pages first, and when they come back a few days later.",
          },
          {
            title: "One list of sources.",
            text: "Where you used to type a lead source, you now pick it from a list: Referral, Yard sign, Google search and the rest, plus any of your own. The same source can no longer end up under three different spellings.",
          },
          {
            title: "A quick question when you save a caller.",
            text: "Saving an unknown caller from the call screen shows \"How did they hear about you?\" with the common answers one tap away.",
          },
          {
            title: "The Lead sources report.",
            text: "For each source: how many leads came in, how many were sent a quote, how many became clients, the win rate, and the money collected from them so far. Tap a source to see the leads behind it.",
          },
        ],
      },
      { type: "h", text: "Who it is for" },
      {
        type: "p",
        text: "Anyone who spends money or time on being found: ads, a Google Business Profile, yard signs, door hangers, asking for referrals. If one of them brings ten leads and no jobs while another brings three leads and three jobs, this is where you see it. Owners and admins can open the report. It is part of every plan, including the free one.",
      },
      { type: "h", text: "How to find it" },
      {
        type: "steps",
        items: [
          "Open Overview, then Insights.",
          "On the \"By lead source\" card, press Lead sources.",
          "Pick 30 days, 90 days or 12 months, and tap any source to see its leads.",
        ],
      },
      {
        type: "p",
        text: "There is nothing to switch on. Forms already on your website start filing new leads this way on their own, with no change to the code you pasted. Leads you already have keep the source they had.",
      },
      { type: "h", text: "Good to know" },
      {
        type: "list",
        items: [
          {
            text: "A phone call does not carry an ad click, so a caller who saw your ad is filed as a phone call until you tap how they heard about you.",
          },
          {
            text: "A click from your Google Business Profile looks like any other Google visit. Tag the website link in your profile with utm_source=gbp (the Help guide below shows how) and those leads get their own row.",
          },
          {
            text: "You can also just ask Atlas: \"where are my leads coming from this month?\"",
          },
        ],
      },
    ],
  },
];

export function announcementPath(a: Pick<Announcement, "slug">): string {
  return `${ANNOUNCEMENTS_PATH}/${a.slug}`;
}

export function findAnnouncement(slug: string): Announcement | null {
  return ANNOUNCEMENTS.find((a) => a.slug === slug) ?? null;
}

/** "November 17, 2026" — from the stored day, never the server's clock or zone. */
export function announcementDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}
