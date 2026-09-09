"use client";

import {
  MapPin as MapPinIcon,
  Phone as PhoneIcon,
  Repeat as RepeatIcon,
  Video as VideoIcon,
} from "lucide-react";

/** Appointment-type / recurring glyph shared by every calendar surface. */
export function TypeGlyph({
  apptType,
  recurring,
  size = 10,
}: {
  apptType: string | null;
  recurring?: boolean;
  size?: number;
}) {
  if (apptType === "PHONE_CALL") return <PhoneIcon size={size} className="inline shrink-0" />;
  if (apptType === "VIDEO_CALL") return <VideoIcon size={size} className="inline shrink-0" />;
  if (apptType === "IN_PERSON") return <MapPinIcon size={size} className="inline shrink-0" />;
  // Visit from a recurring series (subscription)
  if (recurring) return <RepeatIcon size={size} className="inline shrink-0 opacity-70" />;
  return null;
}
