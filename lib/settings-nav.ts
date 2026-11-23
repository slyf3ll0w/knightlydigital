/**
 * The Settings information architecture — one list, shared by the Settings
 * pop-up (components/SettingsPopup.tsx → app/platform/settings/SettingsClient.tsx),
 * the app shell, and ⌘K, so a group is called the same thing everywhere it
 * is pointed at.
 *
 * No React or icons here (server-safe): `icon` is the lucide-react export
 * name; the renderer maps it to the component.
 *
 * 2026-11-21 (David's map): Settings is a POP-UP over whatever page you're
 * on, holding setup only, in six groups. The pages you work in — Services,
 * Booking & forms, Website, Team — live in the sidebar only; My Profile is
 * in the avatar menu; the Get started switch is on Home.
 *
 * A group opens with `?settings=<key>` on any /app URL. Old links to
 * `/app/settings?s=<key>` (emails, Help, Atlas, bookmarks) redirect to
 * Home with the pop-up open on the matching group.
 */

export type SettingsSectionKey = "business" | "brand" | "phone" | "money" | "documents" | "ai";

export type SettingsSection = {
  key: SettingsSectionKey;
  label: string;
  sub: string;
  /** lucide-react icon name */
  icon: "Building2" | "Palette" | "Phone" | "CreditCard" | "FileText" | "Sparkles";
};

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    key: "business",
    label: "Business",
    sub: "Name, contact details, address, time zone, sending email",
    icon: "Building2",
  },
  {
    key: "brand",
    label: "Brand & client pages",
    sub: "Logo, colors, font, sidebar, portal link, review requests",
    icon: "Palette",
  },
  {
    key: "phone",
    label: "Phone & texting",
    sub: "Business line, text notifications, On my way texts",
    icon: "Phone",
  },
  {
    key: "money",
    label: "Money",
    sub: "Online payments, service fee, deposits, tax, QuickBooks, your plan",
    icon: "CreditCard",
  },
  {
    key: "documents",
    label: "Clients & documents",
    sub: "Numbering, custom fields, lead pipeline, agreement templates, import",
    icon: "FileText",
  },
  {
    key: "ai",
    label: "Notifications & AI",
    sub: "Email notifications, automations, connected apps, the assistant",
    icon: "Sparkles",
  },
] as const;

export const SETTINGS_SECTION_KEYS: readonly SettingsSectionKey[] = SETTINGS_SECTIONS.map((s) => s.key);

/**
 * Older `?s=` keys → where that content lives now. Old links in emails,
 * notifications and bookmarks keep landing on the right group.
 * (pre-2026-09: business / customization / features; pre-2026-11:
 * company / branding / payments / automations.)
 */
export const LEGACY_SECTION_KEYS: Readonly<Record<string, SettingsSectionKey>> = {
  company: "business",
  branding: "brand",
  customization: "brand",
  features: "phone",
  payments: "money",
  automations: "ai",
};

export function isSettingsSectionKey(raw: unknown): raw is SettingsSectionKey {
  return typeof raw === "string" && (SETTINGS_SECTION_KEYS as readonly string[]).includes(raw);
}

/** A raw `?s=` / `?settings=` value → a current group key (legacy keys mapped), or null. */
export function normalizeSettingsSection(raw: string | null | undefined): SettingsSectionKey | null {
  if (!raw) return null;
  if (isSettingsSectionKey(raw)) return raw;
  return LEGACY_SECTION_KEYS[raw] ?? null;
}

/**
 * `/app/settings?s=phone` — or the bare index. Still the address to link
 * from emails, Help and Atlas: the route redirects into the pop-up, and an
 * in-app click on it opens the pop-up over the current page.
 */
export function settingsHref(key?: SettingsSectionKey | null): string {
  return key ? `/app/settings?s=${key}` : "/app/settings";
}

/** The search param that opens the pop-up on any /app page. */
export const SETTINGS_PARAM = "settings";

/** The current page with the pop-up open on `key` ("open" = the index / first group). */
export function settingsPopupHref(pathname: string, search: string, key: SettingsSectionKey | "open"): string {
  const params = new URLSearchParams(search);
  params.set(SETTINGS_PARAM, key);
  return `${pathname}?${params.toString()}`;
}

export function settingsSectionLabel(key: SettingsSectionKey): string {
  return SETTINGS_SECTIONS.find((s) => s.key === key)?.label ?? "Settings";
}

export type SettingsLink = {
  href: string;
  label: string;
  sub: string;
  /** lib/section-colors SECTION_HUES key */
  hueKey: "services" | "contracts" | "clients" | "leads" | "forms" | "team" | "business" | "payments";
  /** lucide-react icon name */
  icon: "FileSignature" | "Tags" | "Filter" | "Upload" | "RefreshCw" | "Sparkles" | "Palette";
  /** Test accounts only (Company.isTest) while the page is unfinished. */
  testOnly?: boolean;
};

/** QuickBooks Online — a row inside the Money group. */
export const QUICKBOOKS_LINK: SettingsLink = {
  href: "/app/settings/quickbooks",
  label: "QuickBooks Online",
  sub: "Sync clients, invoices, and payments automatically",
  hueKey: "payments",
  icon: "RefreshCw",
};

/** Your WorkBench plan (lib/addon.ts, lib/plans.ts) — Voice, Pro, Max, seats, card. */
export const ADDON_LINK: SettingsLink = {
  href: "/app/settings/plans",
  label: "Your WorkBench plan",
  sub: "What you're on — add Voice, Pro or Max, people, your card",
  hueKey: "payments",
  icon: "Sparkles",
};

/**
 * Standalone setup pages, listed at the foot of their group. (QuickBooks and
 * the plan are placed by hand in Money; Automations and Connected apps by
 * hand in Notifications & AI.)
 */
export const SETTINGS_SECTION_LINKS: Readonly<Partial<Record<SettingsSectionKey, readonly SettingsLink[]>>> = {
  brand:
    process.env.PAGE_DESIGNER === "1"
      ? [
          {
            // The AI page designer (Pro, page_designer): the page shows the upsell off Pro
            href: "/app/settings/client-pages",
            label: "Client pages",
            sub: "The look of your portal, sign-in, booking page and forms — or ask Atlas to design it",
            hueKey: "forms",
            icon: "Palette",
          },
        ]
      : [],
  documents: [
    {
      href: "/app/contracts?view=templates",
      label: "Agreement templates",
      sub: "Reusable agreements clients e-sign from a link",
      hueKey: "contracts",
      icon: "FileSignature",
    },
    {
      href: "/app/settings/client-fields",
      label: "Client custom fields",
      sub: "Extra fields every client record carries",
      hueKey: "clients",
      icon: "Tags",
    },
    {
      href: "/app/settings/pipeline",
      label: "Lead pipeline",
      sub: "Leads board stages and the ad-platform lead webhook",
      hueKey: "leads",
      icon: "Filter",
    },
    {
      href: "/app/settings/import",
      label: "Import clients",
      sub: "Bring your client list in from a CSV",
      hueKey: "clients",
      icon: "Upload",
    },
  ],
};

/**
 * Search words per group: the names of the settings inside each one, so
 * "tax", "time zone" or "logo" find the right group, not just its title.
 */
export const SETTINGS_KEYWORDS: Readonly<Record<SettingsSectionKey, string>> = {
  business:
    "company name phone email address time zone timezone industry hours business hours sending email reply-to website url service area",
  brand:
    "logo colors colours accent font wallpaper sidebar portal link client portal booking page look theme review requests google reviews",
  phone:
    "business line phone number calls voicemail forwarding ring texting sms text messages notifications on my way texts toll-free",
  money:
    "payments online payments square card ach bank payouts service fee surcharge deposits tax sales tax rate quickbooks plan billing subscription seats tap to pay",
  documents:
    "numbering invoice numbers quote numbers prefixes custom fields lead pipeline stages agreement templates contracts import csv clients terms footer",
  ai: "email notifications alerts automations connected apps integrations zapier atlas assistant ai",
};

/** A page you can reach from Settings search (sidebar pages and setup pages). */
export type SettingsSearchPage = { href: string; label: string; sub: string; testOnly?: boolean };

/**
 * Pages Settings search also finds: the setup pages inside the groups and
 * the work pages that moved to the sidebar (David's map, 2026-11-21), so
 * someone who still looks for "Services" in Settings is taken there.
 */
export const SETTINGS_SEARCH_PAGES: readonly SettingsSearchPage[] = [
  { href: "/app/settings/products", label: "Services", sub: "Your services and prices, the price book" },
  { href: "/app/settings/booking", label: "Booking & forms", sub: "Online booking, request forms, what clients can book" },
  { href: "/app/settings/website", label: "Website", sub: "Your WorkBench website", testOnly: true },
  { href: "/app/settings/team", label: "Team & roles", sub: "Invite people, roles, permissions, pay rates" },
  { href: "/app/settings/profile", label: "My Profile", sub: "Your name, photo, password, sign-in" },
  { href: "/app/automations", label: "Automations", sub: "Follow-ups and reminders that run on their own" },
  { href: "/app/settings/connected-apps", label: "Connected apps", sub: "Zapier, Google and other apps" },
  QUICKBOOKS_LINK,
  ADDON_LINK,
  ...Object.values(SETTINGS_SECTION_LINKS).flatMap((l) => l ?? []),
];
