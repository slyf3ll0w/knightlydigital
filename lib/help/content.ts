/**
 * Every Help Center guide, in reading order. Add a guide to its section
 * file under ./sections; the pages, Atlas's help_search and /help/all.md
 * pick it up with no other change. `npx tsx scripts/test-help-content.ts`
 * checks slugs, internal links and markup.
 *
 * Write for the person in the truck: short steps, exact button labels in
 * `backticks`, the real status names, and the question they'll actually
 * ask under "If something's not working". Facts come from the code, not
 * the plan docs; if a feature changes, change its guide in the same PR.
 */
import type { HelpSection } from "./types";
import { startSection } from "./sections/start";
import { clientsSection, leadsSection } from "./sections/clients";
import { jobsSection, scheduleSection } from "./sections/jobs";
import { quotesSection } from "./sections/quotes";
import { agreementsSection, invoicesSection, paymentsSection } from "./sections/money";
import { estimatorSection, automationsSection, atlasSection } from "./sections/smart";
import { phoneSection, textingSection } from "./sections/phone";
import { portalSection, reportsSection, teamSection } from "./sections/team";
import { mobileSection, settingsSection } from "./sections/account";

export const HELP_SECTIONS: HelpSection[] = [
  startSection,
  clientsSection,
  leadsSection,
  quotesSection,
  jobsSection,
  scheduleSection,
  invoicesSection,
  paymentsSection,
  agreementsSection,
  estimatorSection,
  phoneSection,
  textingSection,
  automationsSection,
  atlasSection,
  teamSection,
  portalSection,
  reportsSection,
  settingsSection,
  mobileSection,
];

/** The chips under the search box: the questions people ask most. */
export const POPULAR_SLUGS = [
  "activate-payments",
  "refund-a-payment",
  "register-for-texting",
  "calls-in-the-app",
  "online-booking",
  "import-clients",
];

/** "New to WorkBench? Start here." */
export const START_HERE_SLUGS = ["first-week-setup", "create-and-send-a-quote", "send-an-invoice"];
