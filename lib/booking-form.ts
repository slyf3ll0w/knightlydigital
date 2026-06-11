/**
 * Booking/embed form configuration, stored as JSON on Company.bookingForm.
 *
 * The form has fixed contact fields (name, email, phone — they map to the
 * Contact record) plus a configurable rest: the service question, the message
 * box, optional address/date fields, and any number of custom fields. Custom
 * field answers don't have a home in the data model, so the booking API
 * appends them to the request details as "Label - value" lines.
 */

export type FieldOption = { label: string; description?: string };

export type CustomFieldType = "text" | "textarea" | "select" | "radio";

export type CustomField = {
  id: string; // stable key the form posts answers under
  label: string;
  type: CustomFieldType;
  required: boolean;
  placeholder?: string;
  options?: FieldOption[]; // select/radio only
};

export type BookingFormConfig = {
  showAddress: boolean;
  showPreferredDate: boolean;
  service: {
    label: string;
    type: "text" | "select" | "radio";
    placeholder?: string;
    options: FieldOption[]; // select/radio only
  };
  message: {
    label: string;
    placeholder?: string;
    required: boolean;
  };
  button: {
    label: string;
    color?: string; // hex; overrides the brand color as the form accent
  };
  appearance: {
    theme: "light" | "dark" | "transparent";
    font?: string; // Google Font name, loaded inside the embed
    fontSize: "sm" | "md" | "lg";
  };
  customFields: CustomField[];
};

/** Form scale per font size — applied as CSS zoom so everything tracks. */
export const FONT_SIZE_ZOOM: Record<BookingFormConfig["appearance"]["fontSize"], number> = {
  sm: 0.9,
  md: 1,
  lg: 1.15,
};

export const GOOGLE_FONT_RE = /^[a-zA-Z0-9 ]{2,40}$/;

export const DEFAULT_BOOKING_FORM: BookingFormConfig = {
  showAddress: true,
  showPreferredDate: true,
  service: {
    label: "Service needed",
    type: "text",
    placeholder: "e.g. AC tune-up, Lawn mowing, Roof inspection",
    options: [],
  },
  message: {
    label: "Message",
    placeholder: "Any additional details...",
    required: false,
  },
  button: {
    label: "Request Appointment",
  },
  appearance: {
    theme: "light",
    fontSize: "md",
  },
  customFields: [],
};

const MAX_CUSTOM_FIELDS = 10;
const MAX_OPTIONS = 12;

function str(v: unknown, max: number, fallback = ""): string {
  return typeof v === "string" ? v.slice(0, max).trim() : fallback;
}

function sanitizeOptions(v: unknown): FieldOption[] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, MAX_OPTIONS)
    .map((o) => ({
      label: str((o as FieldOption)?.label, 80),
      description: str((o as FieldOption)?.description, 140) || undefined,
    }))
    .filter((o) => o.label);
}

/**
 * Normalize untrusted input (settings PATCH body or a raw DB value) into a
 * well-formed config. Returns the default config for null/garbage.
 */
export function sanitizeBookingForm(raw: unknown): BookingFormConfig {
  const d = DEFAULT_BOOKING_FORM;
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  const service = (r.service ?? {}) as Record<string, unknown>;
  const message = (r.message ?? {}) as Record<string, unknown>;
  const button = (r.button ?? {}) as Record<string, unknown>;
  const buttonColor = str(button.color, 7);
  const appearance = (r.appearance ?? {}) as Record<string, unknown>;
  const font = str(appearance.font, 40);

  const serviceType = service.type === "select" || service.type === "radio" ? service.type : "text";
  const customFields: CustomField[] = Array.isArray(r.customFields)
    ? r.customFields
        .slice(0, MAX_CUSTOM_FIELDS)
        .map((f, i) => {
          const field = (f ?? {}) as Record<string, unknown>;
          const type: CustomFieldType =
            field.type === "textarea" || field.type === "select" || field.type === "radio"
              ? field.type
              : "text";
          return {
            id: str(field.id, 40) || `field-${i}`,
            label: str(field.label, 60),
            type,
            required: field.required === true,
            placeholder: str(field.placeholder, 120) || undefined,
            options: type === "select" || type === "radio" ? sanitizeOptions(field.options) : undefined,
          };
        })
        .filter((f) => f.label && (!["select", "radio"].includes(f.type) || (f.options?.length ?? 0) > 0))
    : [];

  return {
    showAddress: r.showAddress !== false,
    showPreferredDate: r.showPreferredDate !== false,
    service: {
      label: str(service.label, 60) || d.service.label,
      type: serviceType,
      placeholder: str(service.placeholder, 120) || d.service.placeholder,
      options: sanitizeOptions(service.options),
    },
    message: {
      label: str(message.label, 60) || d.message.label,
      placeholder: str(message.placeholder, 200) || d.message.placeholder,
      required: message.required === true,
    },
    button: {
      label: str(button.label, 40) || d.button.label,
      color: /^#[0-9a-fA-F]{6}$/.test(buttonColor) ? buttonColor : undefined,
    },
    appearance: {
      theme:
        appearance.theme === "dark" || appearance.theme === "transparent"
          ? appearance.theme
          : "light",
      font: GOOGLE_FONT_RE.test(font) ? font : undefined,
      fontSize:
        appearance.fontSize === "sm" || appearance.fontSize === "lg" ? appearance.fontSize : "md",
    },
    customFields,
  };
}

/** Form accent: explicit button color beats the company brand color. */
export function bookingAccent(config: BookingFormConfig, brandFallback: string): string {
  return config.button.color ?? brandFallback;
}
