/**
 * The Settings information architecture — one list, shared by the Settings
 * page (app/platform/settings/SettingsClient.tsx), the app shell, and ⌘K, so
 * a section is called the same thing everywhere it is pointed at.
 *
 * No React or icons here (server-safe): `icon` is the lucide-react export
 * name; the renderer maps it to the component.
 *
 * Sections are panels inside /app/settings, addressed by `?s=<key>`. The
 * link groups are standalone pages listed under the sections.
 */

export type SettingsSectionKey = "company" | "branding" | "phone" | "payments" | "automations";

export type SettingsSection = {
  key: SettingsSectionKey;
  label: string;
  sub: string;
  /** lucide-react icon name */
  icon: "Building2" | "Palette" | "Phone" | "CreditCard" | "Zap";
};

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    key: "company",
    label: "Company",
    sub: "Business info, portal link, timezone, sending domain",
    icon: "Building2",
  },
  {
    key: "branding",
    label: "Branding & client experience",
    sub: "Logo, colors, font, sidebar, review requests",
    icon: "Palette",
  },
  {
    key: "phone",
    label: "Phone & texting",
    sub: "Business line, text notifications, On My Way texts",
    icon: "Phone",
  },
  {
    key: "payments",
    label: "Payments & accounting",
    sub: "Online payments, surcharging, deposits, tax, QuickBooks",
    icon: "CreditCard",
  },
  {
    key: "automations",
    label: "Automations & assistant",
    sub: "Atlas rules and the assistant's name",
    icon: "Zap",
  },
] as const;

export const SETTINGS_SECTION_KEYS: readonly SettingsSectionKey[] = SETTINGS_SECTIONS.map((s) => s.key);

/**
 * Old `?s=` keys (pre-2026-09 IA) → where that content lives now. Old links
 * in emails, notifications and bookmarks keep landing on the right panel.
 */
export const LEGACY_SECTION_KEYS: Readonly<Record<string, SettingsSectionKey>> = {
  business: "company",
  customization: "branding",
  features: "phone",
};

export function isSettingsSectionKey(raw: unknown): raw is SettingsSectionKey {
  return typeof raw === "string" && (SETTINGS_SECTION_KEYS as readonly string[]).includes(raw);
}

/** A raw `?s=` value → a current section key (legacy keys mapped), or null. */
export function normalizeSettingsSection(raw: string | null | undefined): SettingsSectionKey | null {
  if (!raw) return null;
  if (isSettingsSectionKey(raw)) return raw;
  return LEGACY_SECTION_KEYS[raw] ?? null;
}

/** `/app/settings?s=phone` — or the bare index. */
export function settingsHref(key?: SettingsSectionKey | null): string {
  return key ? `/app/settings?s=${key}` : "/app/settings";
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
  icon: "Package" | "FileSignature" | "Tags" | "Filter" | "Globe" | "Users" | "Upload" | "UserRound" | "RefreshCw" | "Sparkles";
};

export type SettingsLinkGroup = { key: string; label: string; links: readonly SettingsLink[] };

/** Standalone pages, grouped under the sections in the rail and the phone index. */
export const SETTINGS_LINK_GROUPS: readonly SettingsLinkGroup[] = [
  {
    key: "catalog",
    label: "Catalog & documents",
    links: [
      {
        href: "/app/settings/products",
        label: "Services",
        sub: "Your price book — items autocomplete on quotes and invoices",
        hueKey: "services",
        icon: "Package",
      },
      {
        href: "/app/contracts?view=templates",
        label: "Agreement templates",
        sub: "Reusable agreements clients e-sign from a link",
        hueKey: "contracts",
        icon: "FileSignature",
      },
      {
        href: "/app/settings/booking",
        label: "Booking & forms",
        sub: "Your booking page and website forms, each with its own link",
        hueKey: "forms",
        icon: "Globe",
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
    ],
  },
  {
    key: "team",
    label: "Team",
    links: [
      {
        href: "/app/settings/team",
        label: "Team & roles",
        sub: "Invite your crew and set what each role can see",
        hueKey: "team",
        icon: "Users",
      },
      {
        href: "/app/settings/import",
        label: "Import clients",
        sub: "Bring your client list in from a CSV",
        hueKey: "clients",
        icon: "Upload",
      },
    ],
  },
  {
    key: "you",
    label: "You",
    links: [
      {
        href: "/app/settings/profile",
        label: "My Profile",
        sub: "Sign-in, appearance, calendar sync, calls in the app",
        hueKey: "business",
        icon: "UserRound",
      },
    ],
  },
] as const;

/** QuickBooks Online — a row inside the Payments & accounting panel. */
export const QUICKBOOKS_LINK: SettingsLink = {
  href: "/app/settings/quickbooks",
  label: "QuickBooks Online",
  sub: "Sync clients, invoices, and payments automatically",
  hueKey: "payments",
  icon: "RefreshCw",
};

/**
 * Workbench Plus (lib/addon.ts) — listed with Phone & texting, and only while
 * the company's superadmin visibility switch (Company.addonEnabled) is on.
 */
export const ADDON_LINK: SettingsLink = {
  href: "/app/settings/addon",
  label: "Workbench Plus",
  sub: "Premium add-on — your own business line and more",
  hueKey: "payments",
  icon: "Sparkles",
};
