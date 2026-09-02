import { prisma } from "../db";
import { canSell, canSeeMoney, isManager } from "../permissions";
import { type Tool, str, money, clientName, companyTz, fmtWhen, findContact, stage } from "./core";

/**
 * Client features that shipped after Atlas v7: multiple service addresses,
 * additional people on an account, tracked one-off emails, the portal
 * message thread, A/R statements, and cards on file.
 *
 * Saving a NEW card needs the browser's card form (finix.js tokenizes the
 * number) — that stays on the client page; Atlas can list, set default, and
 * remove cards, and charge one (money-extras.ts).
 */

export const clientExtraTools: Tool[] = [
  {
    decl: {
      name: "get_client_details",
      description:
        "Everything on a client beyond the basics: saved service addresses (with ids for jobs/quotes/appointments via propertyId), additional people on the account, cards on file, custom fields, recent portal messages, and tracked emails sent. Use for 'what other properties does X have', 'who else is on the account', 'do they have a card on file', 'did they reply'.",
      parameters: { type: "object", properties: { clientId: { type: "string" } }, required: ["clientId"] },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args) => {
      const contact = await findContact(actor, str(args.clientId, 40));
      if (!contact) return { error: "No client with that id." };
      const tz = await companyTz(actor.companyId);
      const full = await prisma.contact.findUnique({
        where: { id: contact.id },
        select: {
          customFields: true, smsOptOut: true, hubLastVisitAt: true, paymentTermsDays: true,
          addresses: { orderBy: { createdAt: "asc" }, select: { id: true, label: true, address: true, city: true, state: true, zip: true, _count: { select: { jobs: true } } } },
          people: { orderBy: { sortOrder: "asc" }, select: { id: true, firstName: true, lastName: true, role: true, email: true, phone: true, notes: true } },
          savedCards: { orderBy: { isDefault: "desc" }, select: { id: true, label: true, brand: true, expMonth: true, expYear: true, isDefault: true } },
          portalMessages: { orderBy: { createdAt: "desc" }, take: 6, select: { direction: true, body: true, createdAt: true, readByTeamAt: true, sender: { select: { name: true } } } },
          clientMessages: { orderBy: { createdAt: "desc" }, take: 3, select: { subject: true, createdAt: true, emailOpenedAt: true, viewCount: true, sender: { select: { name: true } } } },
        },
      });
      if (!full) return { error: "No client with that id." };
      const canMoney = canSeeMoney(actor);
      return {
        client: clientName(contact),
        primaryAddress: contact.address,
        addresses: full.addresses.map((a) => ({ id: a.id, label: a.label, address: [a.address, a.city, a.state, a.zip].filter(Boolean).join(", "), jobsThere: a._count.jobs })),
        people: full.people.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), role: p.role, email: p.email, phone: p.phone, notes: p.notes })),
        ...(canMoney ? { cardsOnFile: full.savedCards.map((c) => ({ id: c.id, label: c.label, brand: c.brand, expires: c.expMonth && c.expYear ? `${c.expMonth}/${c.expYear}` : null, isDefault: c.isDefault })), paymentTermsDays: full.paymentTermsDays } : {}),
        customFields: full.customFields ?? {},
        smsOptOut: full.smsOptOut,
        portalLastVisit: full.hubLastVisitAt ? fmtWhen(tz, full.hubLastVisitAt, false) : null,
        portalThread: full.portalMessages.reverse().map((m) => ({ from: m.direction === "INBOUND" ? "client" : m.sender?.name ?? "us", at: fmtWhen(tz, m.createdAt, false), unread: m.direction === "INBOUND" && !m.readByTeamAt, body: m.body.length > 240 ? `${m.body.slice(0, 240)}…` : m.body })),
        emailsSent: full.clientMessages.map((m) => ({ subject: m.subject, at: fmtWhen(tz, m.createdAt, false), by: m.sender?.name ?? null, opened: Boolean(m.emailOpenedAt || m.viewCount > 0) })),
      };
    },
  },
  {
    decl: {
      name: "manage_address",
      description: "Stage adding or editing a saved service address (property) on a client — rentals, second homes, job sites. Get address ids from get_client_details. Delete via delete_record entity address.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" }, action: { type: "string", enum: ["add", "update"] }, addressId: { type: "string", description: "update only" },
          label: { type: "string", description: "e.g. Rental on Oak St" }, address: { type: "string", description: "street address" }, city: { type: "string" }, state: { type: "string" }, zip: { type: "string" },
        },
        required: ["clientId", "action"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const contact = await findContact(actor, str(args.clientId, 40));
      if (!contact) return { error: "No client with that id." };
      const fields: Record<string, string> = {};
      for (const k of ["label", "address", "city", "state", "zip"] as const) {
        const v = str(args[k], k === "address" ? 200 : k === "city" ? 100 : k === "label" ? 60 : 40);
        if (v) fields[k] = v;
      }
      const summary = [fields.address, fields.city, fields.state, fields.zip].filter(Boolean).join(", ");
      if (str(args.action, 6) === "add") {
        if (!fields.address) return { error: "A street address is required." };
        return stage(ctx, {
          kind: "add_address", title: `Add address for ${clientName(contact)}`,
          lines: [summary, ...(fields.label ? [`Label: ${fields.label}`] : [])],
          endpoint: `/api/app/contacts/${contact.id}/addresses`, method: "POST", payload: fields,
          confirmLabel: "Add address", href: `/app/contacts/${contact.id}`,
        });
      }
      const existing = await prisma.contactAddress.findFirst({ where: { id: str(args.addressId, 40), contactId: contact.id }, select: { id: true, address: true, label: true } });
      if (!existing) return { error: "No saved address with that id on this client." };
      if (Object.keys(fields).length === 0) return { error: "Nothing to change." };
      return stage(ctx, {
        kind: "update_address", title: `Update address "${existing.label || existing.address}" for ${clientName(contact)}`,
        lines: Object.entries(fields).map(([k, v]) => `${k}: ${v}`),
        endpoint: `/api/app/contacts/${contact.id}/addresses/${existing.id}`, method: "PATCH", payload: fields,
        confirmLabel: "Save changes", href: `/app/contacts/${contact.id}`,
      });
    },
  },
  {
    decl: {
      name: "manage_person",
      description: "Stage adding or editing an additional person on a client account (spouse, property manager, office contact). Ids from get_client_details. Delete via delete_record entity person.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" }, action: { type: "string", enum: ["add", "update"] }, personId: { type: "string", description: "update only" },
          firstName: { type: "string" }, lastName: { type: "string" }, role: { type: "string", description: "e.g. Property manager" }, email: { type: "string" }, phone: { type: "string" }, notes: { type: "string" },
        },
        required: ["clientId", "action"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const contact = await findContact(actor, str(args.clientId, 40));
      if (!contact) return { error: "No client with that id." };
      const fields: Record<string, string> = {};
      for (const k of ["firstName", "lastName", "role", "email", "phone", "notes"] as const) {
        const v = str(args[k], k === "notes" ? 500 : k === "email" ? 254 : 80);
        if (v) fields[k] = v;
      }
      const name = `${fields.firstName ?? ""} ${fields.lastName ?? ""}`.trim();
      if (str(args.action, 6) === "add") {
        if (!name) return { error: "A first or last name is required." };
        return stage(ctx, {
          kind: "add_person", title: `Add ${name} to ${clientName(contact)}`,
          lines: [fields.role, fields.email, fields.phone].filter(Boolean) as string[],
          endpoint: `/api/app/contacts/${contact.id}/people`, method: "POST", payload: fields,
          confirmLabel: "Add person", href: `/app/contacts/${contact.id}`,
        });
      }
      const existing = await prisma.contactPerson.findFirst({ where: { id: str(args.personId, 40), contactId: contact.id }, select: { id: true, firstName: true, lastName: true } });
      if (!existing) return { error: "No person with that id on this client." };
      if (Object.keys(fields).length === 0) return { error: "Nothing to change." };
      return stage(ctx, {
        kind: "update_person", title: `Update ${`${existing.firstName} ${existing.lastName}`.trim()} on ${clientName(contact)}`,
        lines: Object.entries(fields).map(([k, v]) => `${k}: ${v}`),
        endpoint: `/api/app/contacts/${contact.id}/people/${existing.id}`, method: "PATCH", payload: fields,
        confirmLabel: "Save changes", href: `/app/contacts/${contact.id}`,
      });
    },
  },
  {
    decl: {
      name: "email_client",
      description: "Stage a REAL one-off email to a client (tracked — the app records opens). Write the subject and a complete, friendly body yourself from what the user asked for; the sender's signature is added automatically. For quotes/invoices use email_document instead; for a portal-thread reply use reply_in_portal.",
      parameters: {
        type: "object",
        properties: { clientId: { type: "string" }, subject: { type: "string" }, body: { type: "string", description: "plain text, ready to send" } },
        required: ["clientId", "subject", "body"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const contact = await findContact(actor, str(args.clientId, 40));
      if (!contact) return { error: "No client with that id." };
      const c = await prisma.contact.findUnique({ where: { id: contact.id }, select: { email: true } });
      if (!c?.email) return { error: "This client has no email on file — add one with update_client first." };
      const subject = str(args.subject, 150);
      const body = str(args.body, 10000);
      if (!subject || !body) return { error: "subject and body are required." };
      return stage(ctx, {
        kind: "email_client", title: `Email ${clientName(contact)}`,
        lines: [`To: ${c.email}`, `Subject: ${subject}`, body.length > 400 ? `${body.slice(0, 400)}…` : body],
        endpoint: `/api/app/contacts/${contact.id}/message`, method: "POST", payload: { subject, body },
        confirmLabel: "Send email", href: `/app/contacts/${contact.id}`,
      });
    },
  },
  {
    decl: {
      name: "reply_in_portal",
      description: "Stage a reply in the client's portal message thread (the client is notified by push/SMS/email and reads it in their hub). Read the thread first with get_client_details. Use for answering a client's message; for a fresh outreach email use email_client.",
      parameters: { type: "object", properties: { clientId: { type: "string" }, body: { type: "string" } }, required: ["clientId", "body"] },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const contact = await findContact(actor, str(args.clientId, 40));
      if (!contact) return { error: "No client with that id." };
      const body = str(args.body, 5000);
      if (!body) return { error: "body is required." };
      return stage(ctx, {
        kind: "reply_in_portal", title: `Reply to ${clientName(contact)} in messages`,
        lines: [body.length > 400 ? `${body.slice(0, 400)}…` : body],
        endpoint: `/api/app/messages/${contact.id}`, method: "POST", payload: { body },
        confirmLabel: "Send reply", href: `/app/messages`,
      });
    },
  },
  {
    decl: {
      name: "get_statement",
      description: "A client's account statement: every open invoice with balance and age, the total owed, and the link to the PDF statement the user can download or forward. Use for 'what does X owe', 'send me their statement', A/R questions about one client.",
      parameters: { type: "object", properties: { clientId: { type: "string" } }, required: ["clientId"] },
    },
    allowed: (a) => canSeeMoney(a),
    run: async (actor, args) => {
      const contact = await findContact(actor, str(args.clientId, 40));
      if (!contact) return { error: "No client with that id." };
      const open = await prisma.invoice.findMany({
        where: { contactId: contact.id, companyId: actor.companyId, status: { in: ["AWAITING_PAYMENT", "PAST_DUE"] } },
        orderBy: { dueDate: "asc" },
        select: { invoiceNumber: true, subject: true, status: true, total: true, dueDate: true, issuedAt: true, payments: { select: { amount: true } } },
      });
      const now = Date.now();
      let owed = 0;
      const rows = open.map((i) => {
        const balance = Math.max(0, Number(i.total) - i.payments.reduce((s, p) => s + Number(p.amount), 0));
        owed += balance;
        const ageDays = i.dueDate ? Math.floor((now - i.dueDate.getTime()) / 86400000) : null;
        return { n: i.invoiceNumber, subject: i.subject, status: i.status, balance: money(balance), due: i.dueDate?.toISOString().slice(0, 10) ?? null, daysPastDue: ageDays !== null && ageDays > 0 ? ageDays : 0 };
      });
      return { client: clientName(contact), totalOwed: money(owed), openInvoices: rows, statementPdf: `/api/app/contacts/${contact.id}/statement-pdf`, note: "statementPdf is a download link for the signed-in user (paste it as-is)." };
    },
  },
  {
    decl: {
      name: "manage_saved_card",
      description: "Managers: cards on file for a client — set_default picks which card autopay and charge_saved_card use; remove deletes one (or all when cardId is omitted). Card ids from get_client_details. Adding a card needs the card form on the client page.",
      parameters: {
        type: "object",
        properties: { clientId: { type: "string" }, action: { type: "string", enum: ["set_default", "remove"] }, cardId: { type: "string" } },
        required: ["clientId", "action"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const contact = await findContact(actor, str(args.clientId, 40));
      if (!contact) return { error: "No client with that id." };
      const action = str(args.action, 12);
      const cardId = str(args.cardId, 40);
      const card = cardId ? await prisma.savedCard.findFirst({ where: { id: cardId, contactId: contact.id }, select: { id: true, label: true } }) : null;
      if (cardId && !card) return { error: "No card with that id on this client." };
      if (action === "set_default") {
        if (!card) return { error: "cardId is required." };
        return stage(ctx, { kind: "default_card", title: `Make ${card.label} the default card for ${clientName(contact)}`, lines: [], endpoint: `/api/app/contacts/${contact.id}/payment-method`, method: "PATCH", payload: { cardId: card.id }, confirmLabel: "Set default", href: `/app/contacts/${contact.id}` });
      }
      if (action === "remove") {
        return stage(ctx, {
          kind: "remove_card", title: card ? `Remove ${card.label} from ${clientName(contact)}` : `Remove ALL cards on file for ${clientName(contact)}`,
          lines: ["Autopay on their subscriptions stops using it. This cannot be undone."],
          endpoint: `/api/app/contacts/${contact.id}/payment-method`, method: "DELETE", payload: card ? { cardId: card.id } : {},
          danger: true, confirmLabel: "Remove card", href: `/app/contacts/${contact.id}`,
        });
      }
      return { error: "action must be set_default or remove" };
    },
  },
];
