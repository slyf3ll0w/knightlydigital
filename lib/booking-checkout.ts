import type { EngineRules, Slot } from "@/lib/booking-engine";
import type { LoadedBookingType } from "@/lib/booking-runtime";
import type { BookingCompanyRow, CustomerInput } from "@/lib/booking-submit";
import type { ServiceSelection } from "@/lib/booking-services";

/**
 * SERVICE booking types: approved quote → scheduled job, with an optional
 * deposit / full payment charged at booking. Filled in by Phase C of the
 * online-booking build; until then service types can be configured but
 * not booked.
 */
export type ServiceBookingResult =
  | { booking: Record<string, unknown> }
  | { slotTaken: true }
  | { declined: true; error: string }
  | { error: string; status?: number };

export async function createServiceBooking(_params: {
  type: LoadedBookingType;
  company: BookingCompanyRow;
  customer: CustomerInput;
  slot: Slot;
  rules: EngineRules;
  now: Date;
  selection: ServiceSelection;
  paymentToken: string | null;
  fraudSessionId: string | null;
}): Promise<ServiceBookingResult> {
  return { error: "Service booking isn't available yet.", status: 400 };
}
