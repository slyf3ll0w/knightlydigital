import { MapPin, MessageSquare, Phone, Video, Wrench } from "lucide-react";
import type { BookingKind } from "@/lib/booking-types";

/** One glyph per kind of bookable item — the public menu and Settings share it. */
export const KIND_ICON: Record<BookingKind, typeof Phone> = {
  PHONE_CALL: Phone,
  VIDEO_CALL: Video,
  IN_PERSON: MapPin,
  SERVICE: Wrench,
  MESSAGE: MessageSquare,
};
