import { randomBytes } from "crypto";
import { prisma } from "../db";
import {
  type Role,
  canSell,
  canSeeMoney,
  canSeePricing,
  canManageRole,
  isManager,
  jobScope,
  viaContactScope,
  roleLabel,
} from "../permissions";
import {
  DAY_KEYS,
  DAY_LABELS,
  type DayKey,
  sanitizeBusinessHours,
  timeToMinutes,
} from "../business-hours";
import { type Tool, str, num, money, stage, siteBase } from "./core";
import { sanitizeIntake } from "@/lib/booking-intake";
import { KIND_META } from "@/lib/booking-types";

/** kebab-case a label into a stable config key/id. */
function slugId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "field";
}

/** Company overview, settings, hours, team, price book, client fields, web forms. */
export const companyTools: Tool[] = [
  {
    decl: {
      name: "whats_needing_attention",
      description:
        "One-call overview of everything waiting on the business right now: bookings to approve, new requests, past-due and draft invoices, quotes to send/convert, stale quotes awaiting a client reply, jobs to schedule or invoice, unsigned agreements. Use this for 'what should I do', 'how are we doing', or as a starting point for advice.",
      parameters: { type: "object", properties: {} },
    },
    allowed: () => true,
    run: async (actor) => {
      const companyId = actor.companyId;
      const sell = canSell(actor.role);
      const seeMoney = canSeeMoney(actor);
      const lead = viaContactScope(actor);
      const jScope = jobScope(actor);
      const weekAgo = new Date(Date.now() - 7 * 86400000);
      const [
        needsApproval, newRequests, pastDue, draftInvoices, draftQuotes,
        approvedQuotes, staleQuotes, unscheduledJobs, toInvoice, unsignedAgreements,
      ] = await Promise.all([
        sell ? prisma.request.count({ where: { companyId, ...lead, status: "NEEDS_APPROVAL" } }) : 0,
        sell ? prisma.request.count({ where: { companyId, ...lead, status: "NEW" } }) : 0,
        seeMoney ? prisma.invoice.count({ where: { companyId, ...lead, status: "PAST_DUE" } }) : 0,
        seeMoney ? prisma.invoice.count({ where: { companyId, ...lead, status: "DRAFT" } }) : 0,
        sell ? prisma.quote.count({ where: { companyId, ...lead, status: "DRAFT" } }) : 0,
        sell ? prisma.quote.count({ where: { companyId, ...lead, status: "APPROVED" } }) : 0,
        sell
          ? prisma.quote.count({
              where: { companyId, ...lead, status: "AWAITING_RESPONSE", sentAt: { lt: weekAgo } },
            })
          : 0,
        prisma.job.count({ where: { companyId, ...jScope, status: "ACTIVE", scheduledAt: null } }),
        prisma.job.count({ where: { companyId, ...jScope, status: "REQUIRES_INVOICING" } }),
        sell ? prisma.contract.count({ where: { companyId, ...lead, status: "SENT" } }) : 0,
      ]);
      return {
        ...(sell
          ? {
              bookingsToApprove: needsApproval,
              newRequests,
              draftQuotesToFinish: draftQuotes,
              approvedQuotesToConvert: approvedQuotes,
              quotesAwaitingReplyOverAWeek: staleQuotes,
              agreementsSentNotSigned: unsignedAgreements,
            }
          : {}),
        ...(seeMoney ? { pastDueInvoices: pastDue, draftInvoices } : {}),
        unscheduledJobs,
        jobsReadyToInvoice: toInvoice,
      };
    },
  },
  {
    decl: {
      name: "get_price_book",
      description:
        "The company's services and products with id (needed for update_service/delete_record), prices, time-on-site durations, and recurring billing settings. Use before drafting quotes so line items match real offerings.",
      parameters: { type: "object", properties: {} },
    },
    allowed: (a) => canSeePricing(a.role),
    run: async (actor) => {
      const rows = await prisma.workItem.findMany({
        where: { companyId: actor.companyId, isActive: true },
        take: 60, orderBy: { name: "asc" },
        select: {
          id: true, name: true, type: true, unitPrice: true, durationMinutes: true,
          recurringInterval: true, requiresAgreement: true,
        },
      });
      return {
        items: rows.map((w) => ({
          id: w.id, name: w.name, type: w.type, price: money(w.unitPrice),
          minutesOnSite: w.durationMinutes,
          ...(w.recurringInterval ? { billing: w.recurringInterval } : {}),
          ...(w.requiresAgreement ? { requiresAgreement: true } : {}),
        })),
      };
    },
  },
  {
    decl: {
      name: "get_company_settings",
      description:
        "How the company is configured: business hours, service-area ZIPs, arrival window, online-booking status and which services are bookable, bookable team members, timezone, review link, web forms.",
      parameters: { type: "object", properties: {} },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor) => {
      const [company, bookable, forms] = await Promise.all([
        prisma.company.findUnique({
          where: { id: actor.companyId },
          select: {
            timezone: true, businessHours: true, serviceZips: true,
            arrivalWindowMinutes: true, reviewLink: true, industry: true,
            assistantName: true, phone: true, email: true, website: true,
          },
        }),
        prisma.user.findMany({
          where: { companyId: actor.companyId, isActive: true, bookable: true },
          select: { name: true },
        }),
        prisma.bookingType.findMany({
          where: { companyId: actor.companyId, isActive: true },
          select: { name: true, kind: true, mode: true, showOnPage: true, services: { select: { workItem: { select: { name: true, isActive: true } } } } },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        }),
      ]);
      if (!company) return { error: "Company not found" };
      const selfScheduleOn = forms.some((f) => f.mode === "SCHEDULE");
      // only services on a scheduled item are actually bookable online
      const bookableServices = forms
        .filter((f) => f.mode === "SCHEDULE" && f.kind === "SERVICE")
        .flatMap((f) => f.services.filter((s) => s.workItem.isActive).map((s) => s.workItem.name));
      return {
        servicesBookableOnline: selfScheduleOn ? bookableServices : [],
        industry: company.industry,
        assistantName: company.assistantName ?? "Atlas (default)",
        businessPhone: company.phone,
        businessEmail: company.email,
        website: company.website,
        timezone: company.timezone,
        businessHours: company.businessHours,
        serviceZipCount: company.serviceZips.length,
        arrivalWindowMinutes: company.arrivalWindowMinutes,
        onlineBookingEnabled: selfScheduleOn,
        bookableTeamMembers: bookable.map((u) => u.name),
        reviewLinkConfigured: Boolean(company.reviewLink),
        bookingItems: forms.map((f) => ({ name: f.name, kind: f.kind, mode: f.mode, onBookingPage: f.showOnPage })),
      };
    },
  },

  // ── company settings ────────────────────────────────────────────────────────

  {
    decl: {
      name: "update_company_settings",
      description:
        "Stage changes to company settings: business name, phone, email, address/city/state/zip, website, review link, brand colors (brandColor = primary for headers, brandColorSecondary = accent for buttons; #rrggbb), timezone (IANA, e.g. America/Chicago), arrival window minutes, the assistant's display name (assistantName), card surcharge (surchargeEnabled + surchargePercent, e.g. 3 for 3%), the company-default deposit on new quotes (defaultDepositType PERCENT/FIXED/FULL/NONE + defaultDepositValue), and the online-booking service area (addServiceZips / removeServiceZips — 5-digit ZIPs). Only include what should change. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          companyName: { type: "string" },
          phone: { type: "string" },
          email: { type: "string" },
          address: { type: "string" },
          city: { type: "string" },
          state: { type: "string" },
          zip: { type: "string" },
          website: { type: "string" },
          reviewLink: { type: "string" },
          brandColor: { type: "string", description: "primary brand color, #rrggbb" },
          brandColorSecondary: {
            type: "string",
            description: "secondary/accent brand color, #rrggbb",
          },
          timezone: { type: "string" },
          arrivalWindowMinutes: { type: "number" },
          assistantName: { type: "string" },
          surchargeEnabled: { type: "boolean" },
          surchargePercent: { type: "number", description: "e.g. 3 for a 3% card fee" },
          defaultDepositType: { type: "string", enum: ["PERCENT", "FIXED", "FULL", "NONE"] },
          defaultDepositValue: { type: "number" },
          addServiceZips: { type: "array", items: { type: "string" } },
          removeServiceZips: { type: "array", items: { type: "string" } },
        },
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const payload: Record<string, unknown> = {};
      const lines: string[] = [];
      const simple: [key: string, arg: unknown, label: string, max: number][] = [
        ["name", args.companyName, "Business name", 100],
        ["phone", args.phone, "Phone", 30],
        ["email", args.email, "Email", 200],
        ["address", args.address, "Address", 200],
        ["city", args.city, "City", 100],
        ["state", args.state, "State", 40],
        ["zip", args.zip, "ZIP", 10],
        ["website", args.website, "Website", 200],
        ["reviewLink", args.reviewLink, "Review link", 300],
        ["assistantName", args.assistantName, "Assistant name", 40],
      ];
      for (const [key, arg, label, max] of simple) {
        const v = str(arg, max);
        if (v) {
          payload[key] = v;
          lines.push(`${label}: ${v}`);
        }
      }
      const brandColor = str(args.brandColor, 7);
      if (brandColor) {
        if (!/^#[0-9a-fA-F]{6}$/.test(brandColor)) {
          return { error: `brandColor must be a 6-digit hex like #0B57D8 (got "${brandColor}").` };
        }
        payload.brandColor = brandColor;
        lines.push(`Primary brand color: ${brandColor}`);
      }
      const brandColorSecondary = str(args.brandColorSecondary, 7);
      if (brandColorSecondary) {
        if (!/^#[0-9a-fA-F]{6}$/.test(brandColorSecondary)) {
          return {
            error: `brandColorSecondary must be a 6-digit hex like #0B57D8 (got "${brandColorSecondary}").`,
          };
        }
        payload.brandColorSecondary = brandColorSecondary;
        lines.push(`Secondary brand color: ${brandColorSecondary}`);
      }
      if (typeof args.surchargeEnabled === "boolean") {
        payload.surchargeEnabled = args.surchargeEnabled;
        lines.push(args.surchargeEnabled ? "Card surcharge: ON" : "Card surcharge: OFF");
      }
      const surcharge = num(args.surchargePercent);
      if (surcharge !== null) {
        if (surcharge < 0 || surcharge > 10) return { error: "surchargePercent must be 0–10." };
        payload.surchargeRate = surcharge / 100; // stored as a fraction
        lines.push(`Card surcharge rate: ${surcharge}%`);
      }
      const depositType = str(args.defaultDepositType, 10);
      if (["PERCENT", "FIXED", "FULL", "NONE"].includes(depositType)) {
        payload.defaultDepositType = depositType;
        payload.defaultDepositValue = num(args.defaultDepositValue) ?? 0;
        lines.push(
          depositType === "NONE"
            ? "Default deposit on new quotes: none"
            : `Default deposit on new quotes: ${depositType === "FULL" ? "full amount" : `${depositType} ${num(args.defaultDepositValue) ?? 0}`}`
        );
      }
      const tz = str(args.timezone, 60);
      if (tz) {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: tz });
          payload.timezone = tz;
          lines.push(`Timezone: ${tz}`);
        } catch {
          return { error: `"${tz}" isn't a valid timezone — use an IANA name like America/Chicago.` };
        }
      }
      const win = num(args.arrivalWindowMinutes);
      if (win !== null) {
        if (win < 30 || win > 480) return { error: "arrivalWindowMinutes must be 30–480." };
        payload.arrivalWindowMinutes = win;
        lines.push(`Arrival window: ${win} minutes`);
      }
      const addZips = (Array.isArray(args.addServiceZips) ? args.addServiceZips : [])
        .map((z) => str(z, 5)).filter((z) => /^\d{5}$/.test(z));
      const removeZips = (Array.isArray(args.removeServiceZips) ? args.removeServiceZips : [])
        .map((z) => str(z, 5)).filter((z) => /^\d{5}$/.test(z));
      if (addZips.length > 0 || removeZips.length > 0) {
        const company = await prisma.company.findUnique({
          where: { id: actor.companyId },
          select: { serviceZips: true },
        });
        const zips = new Set(company?.serviceZips ?? []);
        addZips.forEach((z) => zips.add(z));
        removeZips.forEach((z) => zips.delete(z));
        payload.serviceZips = [...zips];
        if (addZips.length) lines.push(`Add ZIPs: ${addZips.join(", ")}`);
        if (removeZips.length) lines.push(`Remove ZIPs: ${removeZips.join(", ")}`);
        lines.push(`Service area after change: ${zips.size} ZIP(s)`);
      }
      if (lines.length === 0) return { error: "Nothing to change — provide at least one setting." };
      return stage(ctx, {
        kind: "update_company_settings",
        title: "Update company settings",
        lines,
        endpoint: "/api/app/settings",
        method: "PATCH",
        payload,
      });
    },
  },
  {
    decl: {
      name: "set_business_hours",
      description:
        "Stage new business hours for one or more days (used by online booking). days: e.g. ['sat'] or ['mon','tue','wed','thu','fri']. Give open+close (24h HH:MM, company-local) or closed: true. Other days keep their current hours. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "array",
            items: { type: "string", enum: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] },
          },
          open: { type: "string", description: "HH:MM 24h" },
          close: { type: "string", description: "HH:MM 24h" },
          closed: { type: "boolean", description: "true = closed that day" },
        },
        required: ["days"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const days = (Array.isArray(args.days) ? args.days : [])
        .map((d) => str(d, 3).toLowerCase())
        .filter((d): d is DayKey => (DAY_KEYS as readonly string[]).includes(d));
      if (days.length === 0) return { error: "days must contain at least one of sun..sat." };
      const closed = args.closed === true;
      const open = str(args.open, 5);
      const close = str(args.close, 5);
      if (!closed) {
        const s = timeToMinutes(open);
        const e = timeToMinutes(close);
        if (s === null || e === null || s >= e) {
          return { error: "Provide open and close as HH:MM with open before close, or closed: true." };
        }
      }
      const company = await prisma.company.findUnique({
        where: { id: actor.companyId },
        select: { businessHours: true },
      });
      const hours = sanitizeBusinessHours(company?.businessHours ?? null);
      for (const d of days) hours[d] = closed ? [] : [{ start: open, end: close }];
      return stage(ctx, {
        kind: "set_business_hours",
        title: closed
          ? `Close on ${days.map((d) => DAY_LABELS[d]).join(", ")}`
          : `Set hours ${open}–${close} on ${days.map((d) => DAY_LABELS[d]).join(", ")}`,
        lines: DAY_KEYS.map((d) =>
          `${DAY_LABELS[d]}: ${hours[d].length === 0 ? "closed" : hours[d].map((r) => `${r.start}–${r.end}`).join(", ")}`
        ),
        endpoint: "/api/app/settings",
        method: "PATCH",
        payload: { businessHours: hours },
      });
    },
  },

  // ── price book ──────────────────────────────────────────────────────────────

  {
    decl: {
      name: "create_service",
      description:
        "Stage adding a new service or product to the price book. Check get_price_book first to avoid duplicates. priceDisplay: FIXED, STARTING_AT, HOURLY, or QUOTE. durationMinutes makes it schedulable/bookable. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          type: { type: "string", enum: ["SERVICE", "PRODUCT"] },
          price: { type: "number" },
          cost: { type: "number", description: "Internal cost (optional)" },
          durationMinutes: { type: "number" },
          priceDisplay: { type: "string", enum: ["FIXED", "STARTING_AT", "HOURLY", "QUOTE"] },
        },
        required: ["name", "price"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (_actor, args, ctx) => {
      const name = str(args.name, 100);
      const price = num(args.price);
      if (!name || price === null || price < 0 || price > 100000) {
        return { error: "name and a price between 0 and 100000 are required" };
      }
      const cost = num(args.cost);
      const duration = num(args.durationMinutes);
      const priceDisplay = ["FIXED", "STARTING_AT", "HOURLY", "QUOTE"].includes(str(args.priceDisplay, 20))
        ? str(args.priceDisplay, 20)
        : "FIXED";
      const type = str(args.type, 10) === "PRODUCT" ? "PRODUCT" : "SERVICE";
      return stage(ctx, {
        kind: "create_service",
        title: `Add ${type === "PRODUCT" ? "product" : "service"} "${name}" — ${money(price)}`,
        lines: [
          str(args.description, 300) && `Description: ${str(args.description, 300)}`,
          `Pricing: ${priceDisplay === "FIXED" ? "fixed price" : priceDisplay === "STARTING_AT" ? "starting at" : priceDisplay.toLowerCase()} ${money(price)}${cost !== null ? ` (cost ${money(cost)})` : ""}`,
          duration ? `Duration: ${duration} min (schedulable)` : "No duration — quote-only for now",
        ].filter(Boolean) as string[],
        endpoint: "/api/app/work-items",
        method: "POST",
        payload: {
          name,
          description: str(args.description, 300) || null,
          type,
          unitPrice: price,
          unitCost: cost,
          durationMinutes: duration && duration >= 5 && duration <= 600 ? duration : null,
          priceDisplay,
        },
      });
    },
  },
  {
    decl: {
      name: "update_service",
      description:
        "Stage updating a price-book service/product (managers): rename, description, price, cost, time-on-site duration, price display (FIXED/STARTING_AT/HOURLY/QUOTE), recurring billing interval (MONTHLY/QUARTERLY/SEMIANNUAL/ANNUAL, or NONE to stop recurring), or whether it requires a signed agreement. Identify the item by id (from get_price_book) or by name. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          serviceId: { type: "string" },
          serviceName: { type: "string", description: "used to find the item when no id is given" },
          name: { type: "string", description: "new name (rename)" },
          description: { type: "string" },
          price: { type: "number" },
          cost: { type: "number" },
          durationMinutes: { type: "number", description: "15-480, or 0 to clear (not bookable)" },
          priceDisplay: { type: "string", enum: ["FIXED", "STARTING_AT", "HOURLY", "QUOTE"] },
          recurringInterval: { type: "string", enum: ["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL", "NONE"] },
          requiresAgreement: { type: "boolean" },
        },
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const id = str(args.serviceId, 40);
      let item;
      if (id) {
        item = await prisma.workItem.findFirst({
          where: { id, companyId: actor.companyId },
        });
        if (!item) return { error: "No price-book item with that id — check get_price_book." };
      } else {
        const q = str(args.serviceName, 100);
        if (!q) return { error: "Provide serviceId or serviceName." };
        const matches = await prisma.workItem.findMany({
          where: { companyId: actor.companyId, isActive: true, name: { contains: q, mode: "insensitive" } },
          take: 5,
        });
        if (matches.length === 0) return { error: `No price-book item matching "${q}" — check get_price_book.` };
        if (matches.length > 1) {
          return {
            error: "Multiple items match — ask the user which one, then call again with the exact name or id.",
            matches: matches.map((m) => ({ id: m.id, name: m.name })),
          };
        }
        item = matches[0];
      }
      const payload: Record<string, unknown> = {};
      const lines: string[] = [];
      const newName = str(args.name, 100);
      if (newName && newName !== item.name) {
        payload.name = newName;
        lines.push(`Rename: ${item.name} → ${newName}`);
      }
      const description = str(args.description, 300);
      if (description) {
        payload.description = description;
        lines.push(`Description: ${description.slice(0, 120)}`);
      }
      const price = num(args.price);
      if (price !== null && price >= 0 && price <= 100000) {
        payload.unitPrice = price;
        lines.push(`Price: ${money(item.unitPrice)} → ${money(price)}`);
      }
      const cost = num(args.cost);
      if (cost !== null && cost >= 0 && cost <= 100000) {
        payload.unitCost = cost;
        lines.push(`Cost: ${money(cost)}`);
      }
      const dur = num(args.durationMinutes);
      if (dur !== null) {
        payload.durationMinutes = dur === 0 ? null : dur;
        lines.push(dur === 0 ? "Duration cleared (not bookable)" : `Time on site: ${dur} min`);
      }
      const priceDisplay = str(args.priceDisplay, 20);
      if (["FIXED", "STARTING_AT", "HOURLY", "QUOTE"].includes(priceDisplay)) {
        payload.priceDisplay = priceDisplay;
        lines.push(`Price display: ${priceDisplay}`);
      }
      // The route re-derives the recurring/agreement block from the request on
      // EVERY patch — omitting these fields would silently wipe them. Echo the
      // item's current values, then overlay any requested change.
      const interval = str(args.recurringInterval, 12);
      const nextInterval =
        interval === "NONE" ? null
        : ["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"].includes(interval) ? interval
        : item.recurringInterval;
      const nextRequiresAgreement =
        typeof args.requiresAgreement === "boolean" ? args.requiresAgreement : item.requiresAgreement;
      // turning the requirement off with a template attached means detaching
      // the template too (an attached template forces the gate back on)
      const detachTemplate = args.requiresAgreement === false && item.agreementTemplateId !== null;
      payload.recurringInterval = nextInterval;
      payload.recurringCreatesJob = item.recurringCreatesJob;
      payload.recurringInvoiceMode = item.recurringInvoiceMode;
      payload.agreementTemplateId = detachTemplate ? null : item.agreementTemplateId;
      payload.agreementTiming = item.agreementTiming;
      payload.requiresAgreement = nextRequiresAgreement;
      if (interval && nextInterval !== item.recurringInterval) {
        lines.push(nextInterval ? `Recurring billing: ${nextInterval}` : "Recurring billing: off");
      }
      if (typeof args.requiresAgreement === "boolean" && args.requiresAgreement !== item.requiresAgreement) {
        lines.push(
          args.requiresAgreement
            ? "Now requires a signed agreement before job conversion"
            : detachTemplate
              ? "Agreement requirement removed (attached template detached)"
              : "Agreement requirement removed"
        );
      }
      if (lines.length === 0) return { error: "Nothing to change — provide at least one field." };
      return stage(ctx, {
        kind: "update_service",
        title: `Update ${item.name}`,
        lines,
        endpoint: `/api/app/work-items/${item.id}`,
        method: "PATCH",
        payload,
      });
    },
  },

  // ── client custom fields ────────────────────────────────────────────────────

  {
    decl: {
      name: "manage_client_fields",
      description:
        "Custom client fields (the extra fields on every client record, managers only). action 'list' returns them (incl. archived); 'create' adds one (label + fieldType TEXT/NUMBER/DATE/SELECT — SELECT needs 2+ options); 'update' edits label/options/required or archives/restores (fieldId from list). Create/update show a confirmation card.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "create", "update"] },
          fieldId: { type: "string" },
          label: { type: "string" },
          fieldType: { type: "string", enum: ["TEXT", "NUMBER", "DATE", "SELECT"] },
          options: { type: "array", items: { type: "string" }, description: "choices for SELECT" },
          required: { type: "boolean" },
          archive: { type: "boolean" },
        },
        required: ["action"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const action = str(args.action, 10);
      if (action === "list") {
        const rows = await prisma.contactFieldDef.findMany({
          where: { companyId: actor.companyId },
          take: 30, orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }],
          select: { id: true, label: true, type: true, options: true, required: true, isActive: true },
        });
        return {
          fields: rows.map((f) => ({
            id: f.id, label: f.label, type: f.type, required: f.required,
            ...(Array.isArray(f.options) ? { options: f.options } : {}),
            ...(f.isActive ? {} : { archived: true }),
          })),
        };
      }
      const label = str(args.label, 80);
      const fieldType = ["TEXT", "NUMBER", "DATE", "SELECT"].includes(str(args.fieldType, 10))
        ? str(args.fieldType, 10)
        : undefined;
      const options = (Array.isArray(args.options) ? args.options : [])
        .map((o) => str(o, 100)).filter(Boolean).slice(0, 25);
      if (action === "create") {
        if (!label) return { error: "label is required" };
        const type = fieldType ?? "TEXT";
        if (type === "SELECT" && options.length < 2) return { error: "SELECT fields need at least 2 options." };
        return stage(ctx, {
          kind: "manage_client_fields",
          title: `Add client field "${label}" (${type})`,
          lines: [
            ...(options.length > 0 ? [`Options: ${options.join(", ")}`] : []),
            args.required === true ? "Required on client forms" : "Optional",
          ],
          endpoint: "/api/app/contact-fields",
          method: "POST",
          payload: { label, type, options, required: args.required === true },
        });
      }
      if (action === "update") {
        const field = await prisma.contactFieldDef.findFirst({
          where: { id: str(args.fieldId, 40), companyId: actor.companyId },
          select: { id: true, label: true, isActive: true },
        });
        if (!field) return { error: "No field with that id — use action 'list' first." };
        const payload: Record<string, unknown> = {};
        const lines: string[] = [];
        if (label && label !== field.label) {
          payload.label = label;
          lines.push(`Rename to: ${label}`);
        }
        if (fieldType) {
          payload.type = fieldType;
          lines.push(`Type: ${fieldType}`);
        }
        if (options.length > 0) {
          payload.options = options;
          lines.push(`Options: ${options.join(", ")}`);
        }
        if (typeof args.required === "boolean") {
          payload.required = args.required;
          lines.push(args.required ? "Required on client forms" : "Optional");
        }
        if (typeof args.archive === "boolean") {
          payload.isActive = !args.archive;
          lines.push(args.archive ? "Archive — hidden from forms (values kept)" : "Restore");
        }
        if (lines.length === 0) return { error: "Nothing to change." };
        return stage(ctx, {
          kind: "manage_client_fields",
          title: `Update client field "${field.label}"`,
          lines,
          endpoint: `/api/app/contact-fields/${field.id}`,
          method: "PATCH",
          payload,
        });
      }
      return { error: "action must be list, create, or update" };
    },
  },

  // ── online booking items ───────────────────────────────────────────────────

  {
    decl: {
      name: "manage_booking_item",
      description:
        "The items on the company's online booking page (managers): phone calls, video calls, visits, services, and plain message forms — each with its own link and embed. action 'list' shows every item with id, link, mode (customer picks a time vs. the business follows up), state, questions and services. 'embed' returns an item's ready-to-paste website embed code (or the whole booking page's when no item is named) — output it verbatim. 'create' adds an item (name + kind PHONE_CALL/VIDEO_CALL/IN_PERSON/SERVICE/MESSAGE, optional mode SCHEDULE/REQUEST) with sensible defaults. 'update' edits an item (itemId from list): name, isActive, showOnPage, mode, heading/intro/buttonLabel, standard question visibility (fields), custom questions (addCustomFields/removeCustomFieldLabels), the price-book services offered (setServiceNames REPLACES them; names must match the price book), timing (leadHours/horizonDays), confirmation INSTANT/APPROVAL. Create/update show a confirmation card; list/embed answer directly. Business hours, service area and the drive limit are company settings, not item settings.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "create", "update", "embed"] },
          itemId: { type: "string" },
          name: { type: "string" },
          kind: { type: "string", enum: ["PHONE_CALL", "VIDEO_CALL", "IN_PERSON", "SERVICE", "MESSAGE"] },
          mode: { type: "string", enum: ["SCHEDULE", "REQUEST"], description: "SCHEDULE = customer picks a time; REQUEST = they ask, the business follows up" },
          headline: { type: "string" },
          intro: { type: "string" },
          buttonLabel: { type: "string" },
          fields: {
            type: "object",
            description: "standard question visibility, e.g. {\"address\":{\"show\":true,\"required\":false}}",
            properties: {
              email: { type: "object", properties: { show: { type: "boolean" }, required: { type: "boolean" } } },
              phone: { type: "object", properties: { show: { type: "boolean" }, required: { type: "boolean" } } },
              address: { type: "object", properties: { show: { type: "boolean" }, required: { type: "boolean" } } },
              date: { type: "object", properties: { show: { type: "boolean" }, required: { type: "boolean" } } },
            },
          },
          leadHours: { type: "number", description: "min hours of notice for bookings (0-336)" },
          horizonDays: { type: "number", description: "how far out customers can book (1-90)" },
          confirmation: { type: "string", enum: ["INSTANT", "APPROVAL"] },
          setServiceNames: { type: "array", items: { type: "string" }, description: "REPLACES the item's services; each must be a price-book service name" },
          addCustomFields: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                fieldType: { type: "string", enum: ["text", "textarea", "select", "radio"] },
                required: { type: "boolean" },
                options: { type: "array", items: { type: "string" } },
              },
              required: ["label"],
            },
          },
          removeCustomFieldLabels: { type: "array", items: { type: "string" } },
          isActive: { type: "boolean" },
          showOnPage: { type: "boolean" },
        },
        required: ["action"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const action = str(args.action, 10);
      const baseUrl = siteBase();
      const company = await prisma.company.findUnique({ where: { id: actor.companyId }, select: { slug: true, name: true } });
      const companySlug = company?.slug ?? "";
      const link = (slug: string) => `${baseUrl}/book/${companySlug}/${slug}`;
      const embedFor = (slug: string | null, title: string) => {
        const key = slug ? `${companySlug}/${slug}` : companySlug;
        const src = slug ? `${baseUrl}/embed/${companySlug}/${slug}` : `${baseUrl}/embed/${companySlug}`;
        return `<iframe src="${src}" data-jobflow="${key}" style="width:100%;max-width:640px;height:760px;border:0;" title="${title}"></iframe>\n<script>window.addEventListener("message",function(e){var d=e.data;if(e.origin==="${baseUrl}"&&d&&d.type==="jobflow:height"&&d.slug==="${key}"){var f=document.querySelector('iframe[data-jobflow="${key}"]');if(f)f.style.height=d.height+"px";}});</script>`;
      };

      if (action === "list") {
        const rows = await prisma.bookingType.findMany({
          where: { companyId: actor.companyId },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: { services: { include: { workItem: { select: { name: true } } } }, members: { include: { user: { select: { name: true, isActive: true, bookable: true } } } } },
        });
        return {
          bookingPage: `${baseUrl}/book/${companySlug}`,
          items: rows.map((t) => {
            const intake = sanitizeIntake(t.intake, t.kind, t.mode);
            return {
              id: t.id,
              name: t.name,
              kind: t.kind,
              mode: t.mode,
              link: link(t.slug),
              isActive: t.isActive,
              showOnPage: t.showOnPage,
              confirmation: t.mode === "SCHEDULE" ? t.confirmation : undefined,
              paymentMode: t.mode === "SCHEDULE" && t.kind === "SERVICE" ? t.paymentMode : undefined,
              durationMinutes: t.mode === "SCHEDULE" ? t.durationMinutes : undefined,
              headline: intake.heading || undefined,
              services: t.services.map((s) => s.workItem.name),
              customQuestions: intake.customFields.map((c) => c.label),
              takers: t.members.filter((m) => m.user.isActive && m.user.bookable).map((m) => m.user.name),
            };
          }),
        };
      }

      if (action === "embed") {
        const wanted = str(args.itemId, 40) || str(args.name, 80);
        if (!wanted) {
          return {
            target: "the whole booking page",
            directLink: `${baseUrl}/book/${companySlug}`,
            embedCode: embedFor(null, `Book online — ${company?.name ?? ""}`),
            note: "Give the user the embedCode VERBATIM (both tags, unmodified) to paste into their site's HTML, plus the directLink as a no-embed alternative.",
          };
        }
        const rows = await prisma.bookingType.findMany({ where: { companyId: actor.companyId, isActive: true }, select: { id: true, name: true, slug: true } });
        const item = rows.find((t) => t.id === wanted) ?? rows.find((t) => t.name.toLowerCase() === wanted.toLowerCase());
        if (!item) return { error: "Say which item — pass its itemId or exact name (use action 'list').", items: rows.map((t) => ({ id: t.id, name: t.name })) };
        return {
          item: item.name,
          directLink: link(item.slug),
          embedCode: embedFor(item.slug, `${item.name} — ${company?.name ?? ""}`),
          note: "Give the user the embedCode VERBATIM (both tags, unmodified) to paste into their site's HTML, plus the directLink as a no-embed alternative.",
        };
      }

      if (action === "create") {
        const name = str(args.name, 80);
        if (!name) return { error: "name is required" };
        const existing = await prisma.bookingType.findFirst({
          where: { companyId: actor.companyId, name: { equals: name, mode: "insensitive" } },
          select: { id: true, name: true },
        });
        if (existing) {
          return { error: `An item named "${existing.name}" already exists (id ${existing.id}) — don't create it again. Use action 'update' to change it or 'embed' for its website code.` };
        }
        const kind = ["PHONE_CALL", "VIDEO_CALL", "IN_PERSON", "SERVICE", "MESSAGE"].includes(str(args.kind, 20)) ? str(args.kind, 20) : "PHONE_CALL";
        const mode = str(args.mode, 10) === "REQUEST" ? "REQUEST" : "SCHEDULE";
        return {
          ...stage(ctx, {
            kind: "manage_web_form",
            title: `Create "${name}" (${KIND_META[kind as keyof typeof KIND_META].label.toLowerCase()})`,
            lines: [kind === "MESSAGE" ? "A message form; every submission lands in Requests." : mode === "SCHEDULE" ? "Customers pick a time from your team's open slots." : "Customers send a request; you follow up to set a time.", "Starts with sensible defaults and every bookable team member."],
            endpoint: "/api/app/booking-types",
            method: "POST",
            payload: { name, kind, mode },
          }),
          note: "After the user confirms this card, the item exists — use action 'list' to get its id, 'update' to customize, 'embed' for its website code. Never stage this create again.",
        };
      }

      const item = await prisma.bookingType.findFirst({
        where: { id: str(args.itemId, 40), companyId: actor.companyId },
        include: { services: { include: { workItem: { select: { name: true } } } } },
      });
      if (!item) return { error: "No item with that id — use action 'list' first." };
      if (action !== "update") return { error: "action must be list, create, update, or embed" };

      const payload: Record<string, unknown> = {};
      const lines: string[] = [];
      const name = str(args.name, 80);
      if (name && name !== item.name) {
        payload.name = name;
        lines.push(`Rename to: ${name}`);
      }
      if (typeof args.isActive === "boolean") {
        payload.isActive = args.isActive;
        lines.push(args.isActive ? "Turn it on" : "Turn it off (link stops answering)");
      }
      if (typeof args.showOnPage === "boolean") {
        payload.showOnPage = args.showOnPage;
        lines.push(args.showOnPage ? "Show it on the booking page" : "Hide it from the booking page (link only)");
      }
      const mode = str(args.mode, 10);
      if ((mode === "SCHEDULE" || mode === "REQUEST") && mode !== item.mode) {
        if (item.kind === "MESSAGE" && mode === "SCHEDULE") return { error: "A message form can't take bookings — create a phone call, visit or service item instead." };
        payload.mode = mode;
        lines.push(mode === "SCHEDULE" ? "Customers pick a time" : "Customers send a request; you follow up");
      }
      const confirmation = str(args.confirmation, 10);
      if (confirmation === "INSTANT" || confirmation === "APPROVAL") {
        payload.confirmation = confirmation;
        lines.push(confirmation === "INSTANT" ? "Confirm bookings instantly" : "Hold bookings for approval");
      }
      const lead = num(args.leadHours);
      if (lead !== null && lead >= 0 && lead <= 336) {
        payload.leadHours = lead;
        lines.push(`Booking notice: ${lead}h minimum`);
      }
      const horizon = num(args.horizonDays);
      if (horizon !== null && horizon >= 1 && horizon <= 90) {
        payload.horizonDays = horizon;
        lines.push(`Booking window: ${horizon} days out`);
      }
      if (Array.isArray(args.setServiceNames)) {
        if (item.kind !== "SERVICE") return { error: "Only service items offer price-book services." };
        const wanted = args.setServiceNames.map((n) => str(n, 100)).filter(Boolean);
        const book = await prisma.workItem.findMany({ where: { companyId: actor.companyId, isActive: true, type: "SERVICE" }, select: { id: true, name: true } });
        const ids: string[] = [];
        const missing: string[] = [];
        for (const w of wanted) {
          const match = book.find((b) => b.name.trim().toLowerCase() === w.trim().toLowerCase());
          if (match) ids.push(match.id);
          else missing.push(w);
        }
        if (missing.length > 0) return { error: `Not in the price book: ${missing.join(", ")}. Add them under Products & Services first (manage_price_book), then retry.` };
        if (ids.length === 0) return { error: "setServiceNames needs at least one price-book service." };
        payload.services = ids;
        lines.push(`Services offered: ${wanted.join(", ")}`);
      }

      // Questions + words live in the intake blob: start from the live one, overlay, send whole
      const intake = sanitizeIntake(item.intake, item.kind, (payload.mode as "SCHEDULE" | "REQUEST" | undefined) ?? item.mode);
      let intakeChanged = false;
      const headline = str(args.headline, 100);
      if (headline) {
        intake.heading = headline;
        lines.push(`Heading: ${headline}`);
        intakeChanged = true;
      }
      const intro = str(args.intro, 500);
      if (intro) {
        payload.description = intro;
        lines.push(`Intro: ${intro.slice(0, 100)}`);
      }
      const buttonLabel = str(args.buttonLabel, 40);
      if (buttonLabel) {
        intake.buttonLabel = buttonLabel;
        lines.push(`Button: ${buttonLabel}`);
        intakeChanged = true;
      }
      if (args.fields && typeof args.fields === "object") {
        const fieldArgs = args.fields as Record<string, { show?: unknown; required?: unknown }>;
        for (const key of ["email", "phone", "address", "date"] as const) {
          const fa = fieldArgs[key];
          if (!fa || typeof fa !== "object") continue;
          const next = { ...intake.fields[key] };
          if (typeof fa.show === "boolean") next.show = fa.show;
          if (typeof fa.required === "boolean") next.required = fa.required;
          intake.fields[key] = next;
          lines.push(`${key[0].toUpperCase()}${key.slice(1)} question: ${next.show === false ? "hidden" : next.required ? "shown, required" : "shown, optional"}`);
          intakeChanged = true;
        }
      }
      if (Array.isArray(args.removeCustomFieldLabels) && args.removeCustomFieldLabels.length > 0) {
        const remove = args.removeCustomFieldLabels.map((l) => str(l, 60).toLowerCase()).filter(Boolean);
        const before = intake.customFields.length;
        intake.customFields = intake.customFields.filter((f) => !remove.includes(f.label.toLowerCase()));
        if (intake.customFields.length !== before) {
          lines.push(`Removed question(s): ${remove.join(", ")}`);
          intakeChanged = true;
        }
      }
      if (Array.isArray(args.addCustomFields) && args.addCustomFields.length > 0) {
        const added: string[] = [];
        for (const raw of args.addCustomFields.slice(0, 10)) {
          const r = (raw ?? {}) as Record<string, unknown>;
          const label = str(r.label, 60);
          if (!label) continue;
          if (intake.customFields.length >= 10) return { error: "Items are limited to 10 custom questions." };
          const type = ["text", "textarea", "select", "radio"].includes(str(r.fieldType, 10)) ? (str(r.fieldType, 10) as "text" | "textarea" | "select" | "radio") : "text";
          const options = (Array.isArray(r.options) ? r.options : []).map((o) => str(o, 80)).filter(Boolean).slice(0, 12).map((o) => ({ label: o }));
          if ((type === "select" || type === "radio") && options.length < 2) return { error: `Question "${label}" is a ${type} — it needs at least 2 options.` };
          intake.customFields.push({ id: slugId(label), label, type, required: r.required === true, ...(options.length > 0 ? { options } : {}) });
          added.push(label);
        }
        if (added.length > 0) {
          lines.push(`New question(s): ${added.join(", ")}`);
          intakeChanged = true;
        }
      }
      if (intakeChanged) payload.intake = intake;
      if (lines.length === 0) return { error: "Nothing to change — provide at least one setting." };
      return stage(ctx, {
        kind: "manage_web_form",
        title: `Update "${item.name}"`,
        lines,
        endpoint: `/api/app/booking-types/${item.id}`,
        method: "PATCH",
        payload,
      });
    },
  },

  // ── team ────────────────────────────────────────────────────────────────────

  {
    decl: {
      name: "list_team",
      description:
        "Team members with their id, role, active status, and whether they're bookable for online scheduling. Use before staging any team change.",
      parameters: { type: "object", properties: {} },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor) => {
      const rows = await prisma.user.findMany({
        where: { companyId: actor.companyId },
        take: 50,
        orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
        select: { id: true, name: true, email: true, role: true, isActive: true, bookable: true },
      });
      return {
        team: rows.map((u) => ({
          id: u.id, name: u.name, email: u.email,
          role: u.role, roleLabel: roleLabel[u.role] ?? u.role,
          active: u.isActive, bookableOnline: u.bookable,
        })),
      };
    },
  },
  {
    decl: {
      name: "add_team_member",
      description:
        "Stage adding a team member. Roles: OWNER, ADMIN, USER ('Sales + Tech'), SALES, TECH. Admins can only add USER/SALES/TECH. A starting password is generated and shown on the card for the user to pass along. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          role: { type: "string", enum: ["OWNER", "ADMIN", "USER", "SALES", "TECH"] },
          phone: { type: "string" },
        },
        required: ["name", "email", "role"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const name = str(args.name, 100);
      const email = str(args.email, 254).toLowerCase();
      const role = str(args.role, 12) as Role;
      if (!name) return { error: "name is required" };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "A valid email is required." };
      if (!["OWNER", "ADMIN", "USER", "SALES", "TECH"].includes(role)) return { error: "Invalid role." };
      if (!canManageRole(actor.role, role)) {
        return { error: "Admins can only add Sales + Tech, Sales, or Tech members — an owner must add owners/admins." };
      }
      const password = `Hub-${randomBytes(4).toString("hex")}`;
      return stage(ctx, {
        kind: "add_team_member",
        title: `Add team member ${name} (${roleLabel[role]})`,
        lines: [
          `Email: ${email}`,
          str(args.phone, 30) && `Phone: ${str(args.phone, 30)}`,
          `Starting password: ${password} — share it with them; they can change it after signing in.`,
        ].filter(Boolean) as string[],
        endpoint: "/api/app/team",
        method: "POST",
        payload: { name, email, role, password, phone: str(args.phone, 30) || undefined },
      });
    },
  },
  {
    decl: {
      name: "update_team_member",
      description:
        "Stage changing a team member (by id from list_team): role, deactivate/reactivate (active), bookable for online scheduling, name, phone, or resetPassword: true to generate a new sign-in password (shown on the card). Owners manage everyone; admins only USER/SALES/TECH. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          memberId: { type: "string" },
          role: { type: "string", enum: ["OWNER", "ADMIN", "USER", "SALES", "TECH"] },
          active: { type: "boolean" },
          bookable: { type: "boolean" },
          name: { type: "string" },
          phone: { type: "string" },
          resetPassword: { type: "boolean" },
        },
        required: ["memberId"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const target = await prisma.user.findFirst({
        where: { id: str(args.memberId, 40), companyId: actor.companyId },
        select: { id: true, name: true, role: true, isActive: true, bookable: true },
      });
      if (!target) return { error: "No team member with that id — check list_team." };
      if (!canManageRole(actor.role, target.role as Role) && target.id !== actor.id) {
        return { error: "Admins can't change owners or other admins — an owner must do that." };
      }
      const payload: Record<string, unknown> = {};
      const lines: string[] = [];
      const role = str(args.role, 12);
      if (role && role !== target.role) {
        if (!["OWNER", "ADMIN", "USER", "SALES", "TECH"].includes(role)) return { error: "Invalid role." };
        if (!canManageRole(actor.role, role as Role)) {
          return { error: "Admins can only assign Sales + Tech, Sales, or Tech roles." };
        }
        payload.role = role;
        lines.push(`Role: ${roleLabel[target.role]} → ${roleLabel[role]}`);
      }
      if (typeof args.active === "boolean" && args.active !== target.isActive) {
        if (target.id === actor.id && !args.active) return { error: "You can't deactivate your own account." };
        payload.isActive = args.active;
        lines.push(args.active ? "Reactivate their sign-in" : "Deactivate — they can no longer sign in (reversible)");
      }
      if (typeof args.bookable === "boolean" && args.bookable !== target.bookable) {
        payload.bookable = args.bookable;
        lines.push(args.bookable ? "Bookable for online scheduling" : "Removed from online scheduling");
      }
      if (str(args.name, 100) && str(args.name, 100) !== target.name) {
        payload.name = str(args.name, 100);
        lines.push(`Name: ${target.name} → ${payload.name}`);
      }
      if (str(args.phone, 30)) {
        payload.phone = str(args.phone, 30);
        lines.push(`Phone: ${payload.phone}`);
      }
      if (args.resetPassword === true) {
        const password = `Hub-${randomBytes(4).toString("hex")}`;
        payload.password = password;
        lines.push(`New password: ${password} — share it with them; the old one stops working on confirm.`);
      }
      if (lines.length === 0) return { error: "Nothing to change — provide role, active, bookable, name, phone, or resetPassword." };
      return stage(ctx, {
        kind: "update_team_member",
        title: `Update team member ${target.name}`,
        lines,
        endpoint: `/api/app/team/${target.id}`,
        method: "PATCH",
        payload,
      });
    },
  },
  {
    decl: {
      name: "update_team_policy",
      description:
        "Stage company team policies: whether Sales members can see invoices & payments (salesSeePayments), and who receives new website/booking leads (defaultLeadMemberId from list_team, or 'owner' to reset to the company owner). Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          salesSeePayments: { type: "boolean" },
          defaultLeadMemberId: { type: "string" },
        },
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const payload: Record<string, unknown> = {};
      const lines: string[] = [];
      if (typeof args.salesSeePayments === "boolean") {
        payload.salesSeePayments = args.salesSeePayments;
        lines.push(
          args.salesSeePayments
            ? "Sales members CAN see invoices & payments for their leads"
            : "Sales members can NO LONGER see invoices or payments"
        );
      }
      const leadId = str(args.defaultLeadMemberId, 40);
      if (leadId) {
        if (leadId === "owner") {
          payload.defaultLeadUserId = null;
          lines.push("New website leads go to: the company owner (default)");
        } else {
          const user = await prisma.user.findFirst({
            where: { id: leadId, companyId: actor.companyId, isActive: true },
            select: { id: true, name: true },
          });
          if (!user) return { error: "No active team member with that id — check list_team." };
          payload.defaultLeadUserId = user.id;
          lines.push(`New website leads go to: ${user.name}`);
        }
      }
      if (lines.length === 0) return { error: "Provide salesSeePayments and/or defaultLeadMemberId." };
      return stage(ctx, {
        kind: "update_team_policy",
        title: "Update team policies",
        lines,
        endpoint: "/api/app/team/settings",
        method: "PATCH",
        payload,
      });
    },
  },
];
