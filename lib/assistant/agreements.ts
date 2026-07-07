import { prisma } from "../db";
import { canSell, isManager, contactScope, viaContactScope } from "../permissions";
import { type Tool, str, clientName, stage, siteBase } from "./core";

/** Agreements/contracts: templates, sending for e-signature, void/edit. */
export const agreementTools: Tool[] = [
  {
    decl: {
      name: "list_agreements",
      description:
        "Contracts/service agreements across all clients with id (needed for update_agreement/delete_record), signature status, and each unsigned agreement's client signing link (for when the user wants to share it themselves). filter: 'outstanding' (sent or drafted, not yet signed), 'signed', or 'all'.",
      parameters: {
        type: "object",
        properties: { filter: { type: "string", enum: ["outstanding", "signed", "all"] } },
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args) => {
      const filter = str(args.filter, 12) || "outstanding";
      const status =
        filter === "signed"
          ? { status: "SIGNED" as const }
          : filter === "outstanding"
            ? { status: { in: ["DRAFT" as const, "SENT" as const] } }
            : { status: { not: "VOID" as const } };
      const rows = await prisma.contract.findMany({
        where: { companyId: actor.companyId, ...viaContactScope(actor), ...status },
        take: 15, orderBy: { updatedAt: "desc" },
        select: {
          id: true, title: true, status: true, sentAt: true, signedAt: true, publicToken: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
          quote: { select: { quoteNumber: true } },
        },
      });
      return {
        agreements: rows.map((k) => ({
          id: k.id, title: k.title, client: clientName(k.contact), status: k.status,
          sent: k.sentAt?.toISOString().slice(0, 10),
          signed: k.signedAt?.toISOString().slice(0, 10) ?? null,
          ...(k.status === "DRAFT" || k.status === "SENT"
            ? { signingLink: `${siteBase()}/contract/${k.publicToken}` }
            : {}),
          ...(k.quote ? { quoteN: k.quote.quoteNumber } : {}),
        })),
      };
    },
  },
  {
    decl: {
      name: "list_agreement_templates",
      description:
        "The company's reusable agreement/contract templates (id, name, size). These are the templates send_agreement can send; create_agreement_template adds new ones.",
      parameters: { type: "object", properties: {} },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor) => {
      const rows = await prisma.contractTemplate.findMany({
        where: { companyId: actor.companyId, isActive: true },
        take: 25,
        orderBy: { name: "asc" },
        select: { id: true, name: true, body: true },
      });
      return {
        templates: rows.map((t) => ({
          id: t.id,
          name: t.name,
          preview: t.body.replace(/\s+/g, " ").slice(0, 120),
          characters: t.body.length,
        })),
      };
    },
  },
  {
    decl: {
      name: "create_agreement_template",
      description:
        "Stage saving a reusable agreement/contract template. YOU write the full agreement text: complete, professional, plain text with numbered sections (services, payment, ownership/IP if relevant, term & cancellation, liability). Use the placeholders {{client_name}}, {{company_name}} and {{date}} — they fill in automatically when the agreement is sent. Don't ask permission to draft — write a solid draft; the user reviews it on the card and you can revise it later with update_agreement_template. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Template name, e.g. 'Custom Web Design Agreement'" },
          body: { type: "string", description: "The complete agreement text" },
        },
        required: ["name", "body"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (_actor, args, ctx) => {
      const name = str(args.name, 100);
      const body = str(args.body, 50000);
      if (!name || body.length < 100) {
        return { error: "name and a complete agreement body (write the full text) are required" };
      }
      const preview = body
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 3)
        .map((l) => l.slice(0, 110));
      return stage(ctx, {
        kind: "create_agreement_template",
        title: `Create agreement template "${name}"`,
        lines: [...preview, `…${body.length.toLocaleString()} characters — ask me anytime to revise it`],
        endpoint: "/api/app/contract-templates",
        method: "POST",
        payload: { name, body },
      });
    },
  },
  {
    decl: {
      name: "update_agreement_template",
      description:
        "Stage renaming, rewriting, or archiving an agreement template. Get the id from list_agreement_templates. Only include fields that should change; archive:true retires it. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          templateId: { type: "string" },
          name: { type: "string" },
          body: { type: "string", description: "Full replacement text (not a diff)" },
          archive: { type: "boolean" },
        },
        required: ["templateId"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const template = await prisma.contractTemplate.findFirst({
        where: { id: str(args.templateId, 40), companyId: actor.companyId },
        select: { id: true, name: true },
      });
      if (!template) return { error: "No template with that id — check list_agreement_templates." };
      const payload: Record<string, unknown> = {};
      const lines: string[] = [];
      const name = str(args.name, 100);
      if (name && name !== template.name) {
        payload.name = name;
        lines.push(`Rename to: ${name}`);
      }
      const body = str(args.body, 50000);
      if (body) {
        payload.body = body;
        lines.push(`New text: ${body.replace(/\s+/g, " ").slice(0, 90)}… (${body.length.toLocaleString()} characters)`);
      }
      if (args.archive === true) {
        payload.isActive = false;
        lines.push("Archive — it disappears from the template list");
      }
      if (lines.length === 0) return { error: "Nothing to change — provide name, body, or archive." };
      return stage(ctx, {
        kind: "update_agreement_template",
        title: `Update template "${template.name}"`,
        lines,
        endpoint: `/api/app/contract-templates/${template.id}`,
        method: "PATCH",
        payload,
      });
    },
  },
  {
    decl: {
      name: "send_agreement",
      description:
        "Stage sending an agreement to a client for e-signature — confirming this card really EMAILS the client a signing link (if they have an email on file). Use a saved template (id from list_agreement_templates) or provide a custom title + body. Optional quoteId ties the signature to that quote's convert-to-job gate. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          templateId: { type: "string", description: "Saved template to send" },
          title: { type: "string", description: "Custom agreement title (when not using a template)" },
          body: { type: "string", description: "Custom agreement text (when not using a template)" },
          quoteId: { type: "string" },
        },
        required: ["clientId"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const contact = await prisma.contact.findFirst({
        where: { id: str(args.clientId, 40), companyId: actor.companyId, ...contactScope(actor) },
        select: { id: true, firstName: true, lastName: true, companyName: true, email: true },
      });
      if (!contact) return { error: "No client with that id (or not visible to this user)." };
      const templateId = str(args.templateId, 40);
      const title = str(args.title, 120);
      const body = str(args.body, 50000);
      let displayTitle = title;
      if (templateId) {
        const template = await prisma.contractTemplate.findFirst({
          where: { id: templateId, companyId: actor.companyId, isActive: true },
          select: { name: true },
        });
        if (!template) return { error: "No active template with that id — check list_agreement_templates." };
        displayTitle = title || template.name;
      } else if (!title || body.length < 100) {
        return { error: "Provide a templateId, or a title plus the full agreement body." };
      }
      return stage(ctx, {
        kind: "send_agreement",
        title: `Send "${displayTitle}" to ${clientName(contact)}`,
        lines: [
          contact.email
            ? `Emails a signing link to ${contact.email} immediately on confirm.`
            : "No email on file — ask me for the signing link afterward to share it yourself.",
        ],
        endpoint: "/api/app/contracts",
        method: "POST",
        payload: {
          contactId: contact.id,
          ...(templateId ? { templateId } : {}),
          ...(title ? { title } : {}),
          ...(body ? { body } : {}),
          ...(str(args.quoteId, 40) ? { quoteId: str(args.quoteId, 40) } : {}),
        },
      });
    },
  },
  {
    decl: {
      name: "update_agreement",
      description:
        "Stage changes to an issued agreement (id from list_agreements or get_client_activity): void it (void: true), un-void back to sent (unvoid: true), or fix its title/body while unsigned. Signed agreements can't be edited. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          agreementId: { type: "string" },
          void: { type: "boolean" },
          unvoid: { type: "boolean" },
          title: { type: "string" },
          body: { type: "string", description: "Full replacement text (not a diff)" },
        },
        required: ["agreementId"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const contract = await prisma.contract.findFirst({
        where: { id: str(args.agreementId, 40), companyId: actor.companyId, ...viaContactScope(actor) },
        select: {
          id: true, title: true, status: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
        },
      });
      if (!contract) return { error: "No agreement with that id — check list_agreements." };
      if (args.void === true) {
        const signed = contract.status === "SIGNED";
        return stage(ctx, {
          kind: "update_agreement",
          title: `Void "${contract.title}"`,
          lines: [
            `Client: ${clientName(contract.contact)}`,
            signed
              ? "This agreement is SIGNED — voiding retires it but does not erase the signature record."
              : "The signing link stops working. Reversible (unvoid).",
          ],
          endpoint: `/api/app/contracts/${contract.id}`,
          method: "PATCH",
          payload: { status: "VOID" },
          ...(signed ? { danger: true } : {}),
        });
      }
      if (args.unvoid === true) {
        if (contract.status !== "VOID") return { error: `This agreement is ${contract.status}, not VOID.` };
        return stage(ctx, {
          kind: "update_agreement",
          title: `Restore "${contract.title}" to sent`,
          lines: [`Client: ${clientName(contract.contact)}`, "The signing link works again."],
          endpoint: `/api/app/contracts/${contract.id}`,
          method: "PATCH",
          payload: { status: "SENT" },
        });
      }
      if (contract.status === "SIGNED") return { error: "Signed agreements can't be edited." };
      const payload: Record<string, unknown> = {};
      const lines: string[] = [];
      const title = str(args.title, 120);
      if (title) {
        payload.title = title;
        lines.push(`Title: ${title}`);
      }
      const body = str(args.body, 50000);
      if (body) {
        payload.body = body;
        lines.push(`New text: ${body.replace(/\s+/g, " ").slice(0, 90)}… (${body.length.toLocaleString()} characters)`);
      }
      if (lines.length === 0) return { error: "Nothing to change — provide void, unvoid, title, or body." };
      return stage(ctx, {
        kind: "update_agreement",
        title: `Edit agreement "${contract.title}"`,
        lines: [`Client: ${clientName(contract.contact)}`, ...lines],
        endpoint: `/api/app/contracts/${contract.id}`,
        method: "PATCH",
        payload,
      });
    },
  },
];
