import type { Prisma } from "@prisma/client";
import { ATLAS_ACCESS_SELECT } from "@/lib/assistant-access";

/** Everything the company page header and every tab read from the Company row. */
export const COMPANY_SELECT = {
  id: true,
  name: true,
  slug: true,
  industry: true,
  city: true,
  state: true,
  email: true,
  phone: true,
  website: true,
  timezone: true,
  createdAt: true,
  isTest: true,
  suspendedAt: true,
  suspendedReason: true,
  accessPendingAt: true,
  finixMerchantId: true,
  finixOnboardingState: true,
  finixSandboxApproved: true,
  paymentsWaived: true,
  referralSource: true,
  teamSize: true,
  currentSoftware: true,
  topPriority: true,
  planGrants: true,
  addonEnabled: true,
  addonActiveAt: true,
  addonLiverySubId: true,
  lineNumber: true,
  lineForwardTo: true,
  lineProvisionedAt: true,
  lineReleaseAt: true,
  lineVoiceAppAt: true,
  lineCallerIdName: true,
  emailDomain: true,
  emailDomainStatus: true,
  setupWizardAt: true,
  hubBookingTypeId: true,
  ...ATLAS_ACCESS_SELECT,
  messagingRegistration: {
    select: {
      status: true,
      kind: true,
      entityType: true,
      legalName: true,
      brandStatus: true,
      campaignStatus: true,
      assignmentStatus: true,
      verificationStatus: true,
      rejectionReason: true,
      submittedAt: true,
      approvedAt: true,
      lastCheckedAt: true,
    },
  },
  users: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      bookable: true,
      softphoneEnabled: true,
      softphoneSeenAt: true,
      lastSeenAt: true,
      lastSeenVia: true,
      lastSignInAt: true,
      signInCount: true,
      createdAt: true,
      pushSubscriptions: { select: { platform: true } },
    },
  },
} satisfies Prisma.CompanySelect;

export type CompanyCore = Prisma.CompanyGetPayload<{ select: typeof COMPANY_SELECT }>;
export type CompanyUser = CompanyCore["users"][number];

export const TABS = ["overview", "team", "money", "usage", "controls"] as const;
export type Tab = (typeof TABS)[number];
export const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  team: "Team",
  money: "Money",
  usage: "Usage",
  controls: "Controls",
};
