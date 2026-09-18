/**
 * Business-line types + constants shared by the server module
 * (lib/business-line.ts) and the client card (BusinessLineCard.tsx). Kept
 * Prisma-free so the settings page's client bundle never imports the DB.
 */

import type { LineRegistrationStatus } from "@prisma/client";

export type BrandEntityType = "PRIVATE_PROFIT" | "SOLE_PROPRIETOR";

/** TCR verticals a service business plausibly falls under, with the label the form shows. */
export const VERTICALS: Array<[string, string]> = [
  ["CONSTRUCTION", "Construction, trades & home services"],
  ["PROFESSIONAL", "Professional services"],
  ["REAL_ESTATE", "Real estate & property"],
  ["RETAIL", "Retail"],
  ["HOSPITALITY", "Hospitality"],
  ["TRANSPORTATION", "Transportation & logistics"],
  ["AGRICULTURE", "Agriculture & landscaping"],
  ["HEALTHCARE", "Healthcare"],
  ["TECHNOLOGY", "Technology"],
  ["ENERGY", "Energy & utilities"],
];

export type RegistrationForm = {
  entityType: BrandEntityType;
  legalName: string;
  displayName?: string | null;
  ein?: string | null;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  website?: string | null;
  vertical: string;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  contactPhone: string;
};

export type LineSummary = {
  enabled: boolean;
  entitled: boolean;
  number: string | null;
  forwardTo: string | null;
  provisionedAt: string | null;
  smsReady: boolean;
  registration: null | {
    status: LineRegistrationStatus;
    entityType: string;
    brandStatus: string | null;
    campaignStatus: string | null;
    assignmentStatus: string | null;
    rejectionReason: string | null;
    submittedAt: string;
    approvedAt: string | null;
    lastCheckedAt: string | null;
    form: RegistrationForm;
  };
  defaults: {
    areaCode: string;
    forwardTo: string;
    legalName: string;
    displayName: string;
    street: string;
    city: string;
    state: string;
    postalCode: string;
    website: string;
    contactFirstName: string;
    contactLastName: string;
    contactEmail: string;
    contactPhone: string;
  };
};
