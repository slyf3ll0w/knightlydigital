/**
 * Intake — the questions and words on one bookable item, stored as JSON on
 * `BookingType.intake`. Client-safe (no Prisma). This is what the old web
 * forms carried (standard fields, the service question, message box, custom
 * questions, button label) moved onto the item itself, so a phone call, a
 * paid service and a plain "contact us" form all configure the same way.
 *
 * The public renderers never read the stored JSON directly: they go through
 * `effectiveIntake`, which applies the rules the item's kind and mode force
 * (a scheduled booking always needs an email for its confirmation; a phone
 * call always needs a phone number; the address step replaces the address
 * field when the engine needs it).
 */

import type { BookingKind, BookingMode } from "@/lib/booking-types";
import { KIND_META } from "@/lib/booking-types";

export type FieldOption = { label: string; description?: string };
export type CustomFieldType = "text" | "textarea" | "select" | "radio";
export type CustomField = {
  id: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  placeholder?: string;
  options?: FieldOption[];
  /** Save the answer into this client custom field as well */
  contactFieldId?: string;
};
export type StdField = { show: boolean; required: boolean; label: string };

export type BookingIntake = {
  /** Page heading; "" = the item's name */
  heading: string;
  /** Submit button; "" = a default that fits the kind and mode */
  buttonLabel: string;
  fields: {
    email: StdField;
    phone: StdField;
    address: StdField;
    /** "Preferred date" — request items only */
    date: StdField;
  };
  message: { show: boolean; required: boolean; label: string; placeholder: string };
  /** Free-text / choice "what do you need?" question (becomes the request title) */
  serviceQuestion: {
    show: boolean;
    required: boolean;
    label: string;
    type: "text" | "select" | "radio";
    placeholder: string;
    options: FieldOption[];
  };
  customFields: CustomField[];
  /** SERVICE items in request mode: what the submission produces */
  quoteMode: "draft" | "send";
  /** SERVICE items: customers may pick more than one service */
  allowMultiple: boolean;
};

export const MAX_CUSTOM_FIELDS = 10;
export const MAX_OPTIONS = 12;

function str(v: unknown, max: number, fallback = ""): string {
  return typeof v === "string" ? v.slice(0, max).trim() : fallback;
}

export function sanitizeOptions(v: unknown): FieldOption[] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, MAX_OPTIONS)
    .map((o) => ({
      label: str((o as FieldOption)?.label, 80),
      description: str((o as FieldOption)?.description, 140) || undefined,
    }))
    .filter((o) => o.label);
}

export function sanitizeCustomFields(v: unknown): CustomField[] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, MAX_CUSTOM_FIELDS)
    .map((f, i) => {
      const field = (f ?? {}) as Record<string, unknown>;
      const type: CustomFieldType =
        field.type === "textarea" || field.type === "select" || field.type === "radio" ? field.type : "text";
      return {
        id: str(field.id, 40) || `field-${i}`,
        label: str(field.label, 60),
        type,
        required: field.required === true,
        placeholder: str(field.placeholder, 120) || undefined,
        options: type === "select" || type === "radio" ? sanitizeOptions(field.options) : undefined,
        contactFieldId: str(field.contactFieldId, 40) || undefined,
      };
    })
    .filter((f) => f.label && (!["select", "radio"].includes(f.type) || (f.options?.length ?? 0) > 0));
}

/** Defaults for a fresh item of `kind` in `mode`. */
export function defaultIntake(kind: BookingKind, mode: BookingMode): BookingIntake {
  const request = mode === "REQUEST";
  const meta = KIND_META[kind];
  return {
    heading: "",
    buttonLabel: "",
    fields: {
      email: { show: true, required: !request, label: "Email" },
      phone: { show: true, required: request || kind === "PHONE_CALL", label: "Phone" },
      address: {
        show: meta.needsAddress,
        required: meta.needsAddress && !request,
        label: "Service address",
      },
      date: { show: request && kind !== "MESSAGE", required: false, label: "Preferred date" },
    },
    message: {
      show: true,
      required: false,
      label: request ? "Message" : "Anything we should know?",
      placeholder: request ? "Any additional details..." : "",
    },
    serviceQuestion: {
      show: request && kind === "IN_PERSON",
      required: true,
      label: "Service needed",
      type: "text",
      placeholder: "e.g. AC tune-up, Lawn mowing, Roof inspection",
      options: [],
    },
    customFields: [],
    quoteMode: "draft",
    allowMultiple: true,
  };
}

/**
 * Normalize untrusted input (a PATCH body or the stored JSON) into a
 * well-formed intake. Missing pieces fall back to the kind/mode defaults so
 * a null column reads as "defaults".
 */
export function sanitizeIntake(raw: unknown, kind: BookingKind, mode: BookingMode): BookingIntake {
  const d = defaultIntake(kind, mode);
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  const rawFields = (r.fields ?? {}) as Record<string, unknown>;
  const stdField = (key: keyof BookingIntake["fields"]): StdField => {
    const f = (rawFields[key] ?? {}) as Record<string, unknown>;
    if (rawFields[key] === undefined) return d.fields[key];
    return {
      show: f.show !== false,
      required: f.required === true,
      label: str(f.label, 60) || d.fields[key].label,
    };
  };
  const message = (r.message ?? {}) as Record<string, unknown>;
  const sq = (r.serviceQuestion ?? {}) as Record<string, unknown>;
  const fields = {
    email: stdField("email"),
    phone: stdField("phone"),
    address: stdField("address"),
    date: stdField("date"),
  };
  // A submission must be able to reach someone
  if (!fields.email.show && !fields.phone.show) fields.phone = { ...d.fields.phone, show: true, required: true };
  return {
    heading: str(r.heading, 100),
    buttonLabel: str(r.buttonLabel, 40),
    fields,
    message:
      r.message === undefined
        ? d.message
        : {
            show: message.show !== false,
            required: message.required === true,
            label: str(message.label, 60) || d.message.label,
            placeholder: str(message.placeholder, 200),
          },
    serviceQuestion:
      r.serviceQuestion === undefined
        ? d.serviceQuestion
        : {
            show: sq.show === true,
            required: sq.required !== false,
            label: str(sq.label, 60) || d.serviceQuestion.label,
            type: sq.type === "select" || sq.type === "radio" ? sq.type : "text",
            placeholder: str(sq.placeholder, 120),
            options: sanitizeOptions(sq.options),
          },
    customFields: sanitizeCustomFields(r.customFields),
    quoteMode: r.quoteMode === "send" ? "send" : "draft",
    allowMultiple: r.allowMultiple !== false,
  };
}

/**
 * The rules an item's kind and mode force on top of what the owner saved.
 * Renderers and the submit routes both use this, so what the customer sees
 * and what the server demands never drift.
 */
export function effectiveIntake(intake: BookingIntake, type: { kind: BookingKind; mode: BookingMode }): BookingIntake {
  const meta = KIND_META[type.kind];
  const scheduled = type.mode === "SCHEDULE";
  const out: BookingIntake = JSON.parse(JSON.stringify(intake));
  if (scheduled) {
    // The confirmation (and .ics) goes to their email
    out.fields.email = { ...out.fields.email, show: true, required: true };
    // The engine's address step collects the address; no second field
    if (meta.needsAddress) out.fields.address = { ...out.fields.address, show: false, required: false };
    // A real time is picked; no "preferred date"
    out.fields.date = { ...out.fields.date, show: false, required: false };
  } else {
    if (type.kind === "MESSAGE") out.fields.date = { ...out.fields.date, show: false, required: false };
  }
  if (type.kind === "PHONE_CALL") out.fields.phone = { ...out.fields.phone, show: true, required: true };
  if (type.kind === "SERVICE") out.serviceQuestion = { ...out.serviceQuestion, show: false };
  if (!out.fields.email.show && !out.fields.phone.show) out.fields.phone = { ...out.fields.phone, show: true, required: true };
  return out;
}

/** The submit button when the owner hasn't written their own. */
export function defaultButtonLabel(type: {
  kind: BookingKind;
  mode: BookingMode;
  confirmation: "INSTANT" | "APPROVAL";
}): string {
  if (type.mode === "REQUEST") {
    switch (type.kind) {
      case "MESSAGE":
        return "Send message";
      case "SERVICE":
        return "Request a quote";
      case "IN_PERSON":
        return "Request an estimate";
      default:
        return "Request a call";
    }
  }
  return type.confirmation === "INSTANT" ? "Confirm booking" : "Request this time";
}
