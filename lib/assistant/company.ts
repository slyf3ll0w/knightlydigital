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
import { type Tool, str, num, money, stage } from "./core";

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
        prisma.webForm.findMany({
          where: { companyId: actor.companyId, isActive: true },
          select: { name: true, type: true, config: true },
        }),
      ]);
      if (!company) return { error: "Company not found" };
      type FormCfg = { selfSchedule?: { enabled?: boolean }; services?: { name?: string }[] };
      const selfScheduleOn = forms.some((f) => {
        const c = f.config as FormCfg;
        return f.type === "BOOKING" && c?.selfSchedule?.enabled === true;
      });
      // only services placed on a self-scheduling form are actually bookable online
      const bookableServices = forms
        .filter((f) => f.type === "BOOKING" && (f.config as FormCfg)?.selfSchedule?.enabled)
        .flatMap((f) => ((f.config as FormCfg).services ?? []).map((s) => s?.name).filter(Boolean));
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
        forms: forms.map((f) => ({ name: f.name, type: f.type })),
      };
    },
  },

  // ── company settings ────────────────────────────────────────────────────────

  {
    decl: {
      name: "update_company_settings",
      description:
        "Stage changes to company settings: business name, phone, email, address/city/state/zip, website, review link, timezone (IANA, e.g. America/Chicago), arrival window minutes, the assistant's display name (assistantName), and the online-booking service area (addServiceZips / removeServiceZips — 5-digit ZIPs). Only include what should change. Confirmation card required.",
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
          timezone: { type: "string" },
          arrivalWindowMinutes: { type: "number" },
          assistantName: { type: "string" },
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
      payload.recurringInterval = nextInterval;
      payload.recurringCreatesJob = item.recurringCreatesJob;
      payload.recurringInvoiceMode = item.recurringInvoiceMode;
      payload.agreementTemplateId = item.agreementTemplateId;
      payload.agreementTiming = item.agreementTiming;
      payload.requiresAgreement = nextRequiresAgreement;
      if (interval && nextInterval !== item.recurringInterval) {
        lines.push(nextInterval ? `Recurring billing: ${nextInterval}` : "Recurring billing: off");
      }
      if (typeof args.requiresAgreement === "boolean" && args.requiresAgreement !== item.requiresAgreement) {
        if (!args.requiresAgreement && item.agreementTemplateId) {
          return { error: "This item has an agreement template attached, which forces the agreement requirement — detach the template at /app/settings/products first." };
        }
        lines.push(args.requiresAgreement ? "Now requires a signed agreement before job conversion" : "Agreement requirement removed");
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

  // ── web forms ───────────────────────────────────────────────────────────────

  {
    decl: {
      name: "manage_web_form",
      description:
        "The company's website/booking forms (managers). action 'list' shows all forms with ids, share links, and settings. 'embed' returns a form's ready-to-paste website embed code — output it verbatim. 'create' adds a form (name + formType INQUIRY/BOOKING/SERVICE_REQUEST) with sensible defaults — customize it with a follow-up 'update' after it exists. 'update' edits a form (formId from list): headline/intro, button label, theme, standard field visibility, online self-scheduling (BOOKING forms), the service list shown on the form (setServices REPLACES it; names matching the price book link automatically), custom questions (addCustomFields/removeCustomFieldLabels), isActive, or isDefault. 'duplicate' copies a form. Create/update/duplicate show a confirmation card; list/embed answer directly.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "create", "update", "duplicate", "embed"] },
          formId: { type: "string" },
          name: { type: "string" },
          formType: { type: "string", enum: ["INQUIRY", "BOOKING", "SERVICE_REQUEST"] },
          headline: { type: "string" },
          intro: { type: "string" },
          buttonLabel: { type: "string" },
          theme: { type: "string", enum: ["light", "dark", "transparent"] },
          fields: {
            type: "object",
            description: "standard field visibility, e.g. {\"address\":{\"show\":true,\"required\":false}}",
            properties: {
              email: { type: "object", properties: { show: { type: "boolean" }, required: { type: "boolean" } } },
              phone: { type: "object", properties: { show: { type: "boolean" }, required: { type: "boolean" } } },
              address: { type: "object", properties: { show: { type: "boolean" }, required: { type: "boolean" } } },
              date: { type: "object", properties: { show: { type: "boolean" }, required: { type: "boolean" } } },
            },
          },
          selfScheduleEnabled: { type: "boolean", description: "online self-scheduling (BOOKING forms)" },
          leadHours: { type: "number", description: "min hours of notice for online bookings (0-336)" },
          horizonDays: { type: "number", description: "how far out clients can book (1-90)" },
          setServices: {
            type: "array",
            description: "REPLACES the form's service list",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                price: { type: "number" },
                description: { type: "string" },
              },
              required: ["name"],
            },
          },
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
          isDefault: { type: "boolean" },
        },
        required: ["action"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const action = str(args.action, 10);
      type Cfg = Record<string, unknown> & {
        header?: { title?: string; description?: string };
        button?: { label?: string; color?: string };
        appearance?: { theme?: string; fontSize?: string; font?: string };
        fields?: Record<string, { show?: boolean; required?: boolean; label?: string }>;
        selfSchedule?: { enabled?: boolean; leadHours?: number; horizonDays?: number };
        services?: Record<string, unknown>[];
        customFields?: Record<string, unknown>[];
      };

      // Prod sets NEXTAUTH_URL; without it links come back relative and the
      // model is told to prefix them with the site the user is on.
      const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
      const formPath = (companySlug: string, f: { slug: string; isDefault: boolean }) =>
        f.isDefault ? companySlug : `${companySlug}/${f.slug}`;

      if (action === "list") {
        const [rows, company] = await Promise.all([
          prisma.webForm.findMany({
            where: { companyId: actor.companyId },
            take: 15, orderBy: { createdAt: "asc" },
            select: { id: true, name: true, type: true, slug: true, isDefault: true, isActive: true, config: true },
          }),
          prisma.company.findUnique({ where: { id: actor.companyId }, select: { slug: true } }),
        ]);
        return {
          forms: rows.map((f) => {
            const c = (f.config ?? {}) as Cfg;
            return {
              id: f.id, name: f.name, type: f.type,
              link: `${baseUrl}/book/${formPath(company?.slug ?? "", f)}`,
              isDefault: f.isDefault, isActive: f.isActive,
              headline: c.header?.title,
              selfSchedule: c.selfSchedule?.enabled === true,
              services: (c.services ?? []).map((s) => (s as { name?: string }).name).filter(Boolean),
              customFields: (c.customFields ?? []).map((s) => (s as { label?: string }).label).filter(Boolean),
            };
          }),
        };
      }

      if (action === "embed") {
        const [rows, company] = await Promise.all([
          prisma.webForm.findMany({
            where: { companyId: actor.companyId, isActive: true },
            take: 15, orderBy: { createdAt: "asc" },
            select: { id: true, name: true, slug: true, isDefault: true },
          }),
          prisma.company.findUnique({ where: { id: actor.companyId }, select: { slug: true, name: true } }),
        ]);
        if (rows.length === 0) return { error: "No forms exist yet — create one first." };
        const wanted = str(args.formId, 40) || str(args.name, 80);
        const form = wanted
          ? rows.find((f) => f.id === wanted) ??
            rows.find((f) => f.name.toLowerCase() === wanted.toLowerCase())
          : rows.length === 1
            ? rows[0]
            : rows.find((f) => f.isDefault);
        if (!form) {
          return {
            error: "Say which form — pass its formId or exact name.",
            forms: rows.map((f) => ({ id: f.id, name: f.name })),
          };
        }
        const suffix = formPath(company?.slug ?? "", form);
        const origin = baseUrl;
        const embedCode = `<iframe src="${baseUrl}/embed/${suffix}" data-jobflow="${suffix}" style="width:100%;max-width:560px;height:760px;border:0;" title="${form.name} — ${company?.name ?? ""}"></iframe>\n<script>window.addEventListener("message",function(e){var d=e.data;if(e.origin==="${origin}"&&d&&d.type==="jobflow:height"&&d.slug==="${suffix}"){var f=document.querySelector('iframe[data-jobflow="${suffix}"]');if(f)f.style.height=d.height+"px";}});</script>`;
        return {
          form: form.name,
          directLink: `${baseUrl}/book/${suffix}`,
          embedCode,
          note: "Give the user the embedCode VERBATIM (both tags, unmodified) to paste into their site's HTML, plus the directLink as a no-embed alternative.",
        };
      }

      if (action === "create") {
        const name = str(args.name, 80);
        if (!name) return { error: "name is required" };
        const existing = await prisma.webForm.findFirst({
          where: { companyId: actor.companyId, name: { equals: name, mode: "insensitive" } },
          select: { id: true, name: true },
        });
        if (existing) {
          return {
            error: `A form named "${existing.name}" already exists (id ${existing.id}) — don't create it again. Use action 'update' to change it or 'embed' for its website code.`,
          };
        }
        const formType = ["INQUIRY", "BOOKING", "SERVICE_REQUEST"].includes(str(args.formType, 20))
          ? str(args.formType, 20)
          : "INQUIRY";
        return {
          ...stage(ctx, {
            kind: "manage_web_form",
            title: `Create ${formType.toLowerCase().replace("_", " ")} form "${name}"`,
            lines: [
              "Starts with sensible defaults for its type.",
              "Once confirmed, ask me for the embed code or any customization.",
            ],
            endpoint: "/api/app/web-forms",
            method: "POST",
            payload: { name, type: formType },
          }),
          note: "After the user confirms this card, the form exists — use action 'list' to get its id, 'update' to customize, 'embed' for its website code. Never stage this create again.",
        };
      }

      const form = await prisma.webForm.findFirst({
        where: { id: str(args.formId, 40), companyId: actor.companyId },
        select: { id: true, name: true, type: true, isDefault: true, config: true },
      });
      if (!form) return { error: "No form with that id — use action 'list' first." };

      if (action === "duplicate") {
        return stage(ctx, {
          kind: "manage_web_form",
          title: `Duplicate form "${form.name}"`,
          lines: ["The copy keeps all settings, gets its own link, and is never the default."],
          endpoint: `/api/app/web-forms/${form.id}/duplicate`,
          method: "POST",
          payload: {},
        });
      }
      if (action !== "update") return { error: "action must be list, create, update, or duplicate" };

      const payload: Record<string, unknown> = {};
      const lines: string[] = [];
      const name = str(args.name, 80);
      if (name && name !== form.name) {
        payload.name = name;
        lines.push(`Rename to: ${name}`);
      }
      if (typeof args.isActive === "boolean") {
        if (!args.isActive && form.isDefault) return { error: "The default form can't be disabled — make another form the default first." };
        payload.isActive = args.isActive;
        lines.push(args.isActive ? "Enable the form" : "Disable the form (link stops accepting submissions)");
      }
      if (args.isDefault === true) {
        payload.isDefault = true;
        lines.push("Make this the default form (used by /book and the embed).");
      }

      // config-level edits: start from the live config, overlay changes, send the whole thing
      const cfg = JSON.parse(JSON.stringify(form.config ?? {})) as Cfg;
      let cfgChanged = false;
      const headline = str(args.headline, 100);
      if (headline) {
        cfg.header = { ...(cfg.header ?? {}), title: headline };
        lines.push(`Headline: ${headline}`);
        cfgChanged = true;
      }
      const intro = str(args.intro, 300);
      if (intro) {
        cfg.header = { ...(cfg.header ?? {}), description: intro };
        lines.push(`Intro: ${intro.slice(0, 100)}`);
        cfgChanged = true;
      }
      const buttonLabel = str(args.buttonLabel, 40);
      if (buttonLabel) {
        cfg.button = { ...(cfg.button ?? {}), label: buttonLabel };
        lines.push(`Button: ${buttonLabel}`);
        cfgChanged = true;
      }
      const theme = str(args.theme, 12);
      if (["light", "dark", "transparent"].includes(theme)) {
        cfg.appearance = { ...(cfg.appearance ?? {}), theme };
        lines.push(`Theme: ${theme}`);
        cfgChanged = true;
      }
      if (args.fields && typeof args.fields === "object") {
        const fieldArgs = args.fields as Record<string, { show?: unknown; required?: unknown }>;
        for (const key of ["email", "phone", "address", "date"] as const) {
          const f = fieldArgs[key];
          if (!f || typeof f !== "object") continue;
          const current = (cfg.fields?.[key] ?? {}) as { show?: boolean; required?: boolean; label?: string };
          const next = { ...current };
          if (typeof f.show === "boolean") next.show = f.show;
          if (typeof f.required === "boolean") next.required = f.required;
          cfg.fields = { ...(cfg.fields ?? {}), [key]: next };
          lines.push(`${key[0].toUpperCase()}${key.slice(1)} field: ${next.show === false ? "hidden" : next.required ? "shown, required" : "shown, optional"}`);
          cfgChanged = true;
        }
      }
      if (typeof args.selfScheduleEnabled === "boolean" || num(args.leadHours) !== null || num(args.horizonDays) !== null) {
        if (form.type !== "BOOKING" && args.selfScheduleEnabled === true) {
          return { error: "Online self-scheduling only works on BOOKING forms." };
        }
        const ss = { ...(cfg.selfSchedule ?? {}) };
        if (typeof args.selfScheduleEnabled === "boolean") {
          ss.enabled = args.selfScheduleEnabled;
          lines.push(args.selfScheduleEnabled ? "Online self-scheduling: ON" : "Online self-scheduling: OFF");
        }
        const lead = num(args.leadHours);
        if (lead !== null && lead >= 0 && lead <= 336) {
          ss.leadHours = lead;
          lines.push(`Booking notice: ${lead}h minimum`);
        }
        const horizon = num(args.horizonDays);
        if (horizon !== null && horizon >= 1 && horizon <= 90) {
          ss.horizonDays = horizon;
          lines.push(`Booking window: ${horizon} days out`);
        }
        cfg.selfSchedule = ss;
        cfgChanged = true;
      }
      if (Array.isArray(args.setServices)) {
        const wanted = args.setServices.slice(0, 30).map((s) => {
          const r = (s ?? {}) as Record<string, unknown>;
          return { name: str(r.name, 100), price: num(r.price), description: str(r.description, 200) };
        }).filter((s) => s.name);
        if (wanted.length === 0) return { error: "setServices needs at least one service with a name." };
        const book = await prisma.workItem.findMany({
          where: { companyId: actor.companyId, isActive: true },
          select: { id: true, name: true, unitPrice: true, priceDisplay: true, description: true },
        });
        const services = wanted.map((s, i) => {
          const match = book.find((w) => w.name.trim().toLowerCase() === s.name.trim().toLowerCase());
          const price = s.price ?? (match ? Number(match.unitPrice) : null);
          return {
            id: `${slugId(s.name)}-${i}`,
            ...(match ? { workItemId: match.id, priceDisplay: match.priceDisplay } : {}),
            name: s.name,
            price: price !== null && price >= 0 ? price : 0,
            ...(s.description || match?.description ? { description: s.description || match?.description || "" } : {}),
          };
        });
        cfg.services = services;
        lines.push(`Services on form: ${services.map((s) => s.name).join(", ")}`);
        const unmatched = services.filter((s) => !("workItemId" in s)).map((s) => s.name);
        if (unmatched.length > 0) lines.push(`Not in the price book (shown as-is): ${unmatched.join(", ")}`);
        cfgChanged = true;
      }
      if (Array.isArray(args.removeCustomFieldLabels) && args.removeCustomFieldLabels.length > 0) {
        const remove = args.removeCustomFieldLabels.map((l) => str(l, 60).toLowerCase()).filter(Boolean);
        const before = (cfg.customFields ?? []).length;
        cfg.customFields = (cfg.customFields ?? []).filter(
          (f) => !remove.includes(str((f as { label?: string }).label, 60).toLowerCase())
        );
        if ((cfg.customFields ?? []).length !== before) {
          lines.push(`Removed question(s): ${remove.join(", ")}`);
          cfgChanged = true;
        }
      }
      if (Array.isArray(args.addCustomFields) && args.addCustomFields.length > 0) {
        const existing = cfg.customFields ?? [];
        const added: string[] = [];
        for (const raw of args.addCustomFields.slice(0, 10)) {
          const r = (raw ?? {}) as Record<string, unknown>;
          const label = str(r.label, 60);
          if (!label) continue;
          if (existing.length + added.length >= 10) return { error: "Forms are limited to 10 custom questions." };
          const type = ["text", "textarea", "select", "radio"].includes(str(r.fieldType, 10))
            ? str(r.fieldType, 10)
            : "text";
          const options = (Array.isArray(r.options) ? r.options : [])
            .map((o) => str(o, 80)).filter(Boolean).slice(0, 12).map((o) => ({ label: o }));
          if ((type === "select" || type === "radio") && options.length < 2) {
            return { error: `Question "${label}" is a ${type} — it needs at least 2 options.` };
          }
          existing.push({
            id: slugId(label),
            label,
            type,
            required: r.required === true,
            ...(options.length > 0 ? { options } : {}),
          });
          added.push(label);
        }
        if (added.length > 0) {
          cfg.customFields = existing;
          lines.push(`New question(s): ${added.join(", ")}`);
          cfgChanged = true;
        }
      }
      if (cfgChanged) payload.config = cfg;
      if (lines.length === 0) return { error: "Nothing to change — provide at least one setting." };
      return stage(ctx, {
        kind: "manage_web_form",
        title: `Update form "${form.name}"`,
        lines,
        endpoint: `/api/app/web-forms/${form.id}`,
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
