import type { BookingIntake } from "@/lib/booking-intake";

/**
 * Validate the "what do you need?" answer and the custom-question answers
 * a public submit carries, against the item's effective intake. Shared by
 * the request submit and the scheduled submit so both paths demand the same
 * things the form showed.
 */
export function validateAnswers(
  intake: BookingIntake,
  body: Record<string, unknown>
): { serviceAnswer: string; customLines: string[]; mappedContactFields: Record<string, string> } | { error: string } {
  const sq = intake.serviceQuestion;
  const serviceAnswer = sq.show && typeof body.service === "string" ? body.service.trim().slice(0, 200) : "";
  if (sq.show && sq.required && !serviceAnswer) return { error: `"${sq.label}" is required.` };
  if (serviceAnswer && (sq.type === "select" || sq.type === "radio") && sq.options.length > 0 && !sq.options.some((o) => o.label === serviceAnswer)) {
    return { error: `Invalid value for "${sq.label}".` };
  }

  const rawCustom = (body.custom && typeof body.custom === "object" ? body.custom : {}) as Record<string, unknown>;
  const customLines: string[] = [];
  const mappedContactFields: Record<string, string> = {};
  for (const field of intake.customFields) {
    const value = typeof rawCustom[field.id] === "string" ? (rawCustom[field.id] as string).trim() : "";
    if (!value) {
      if (field.required) return { error: `"${field.label}" is required.` };
      continue;
    }
    if (value.length > 1000) return { error: "Input too long." };
    if ((field.type === "select" || field.type === "radio") && !(field.options ?? []).some((o) => o.label === value)) {
      return { error: `Invalid value for "${field.label}".` };
    }
    customLines.push(`${field.label} - ${value}`);
    if (field.contactFieldId) mappedContactFields[field.contactFieldId] = value;
  }
  return { serviceAnswer, customLines, mappedContactFields };
}
