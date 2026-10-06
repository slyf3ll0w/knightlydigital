/** Send later — what the action bars show after scheduling (client-safe, no Prisma). */

export type ScheduleWarning = "past" | "expires_first" | "unreachable";

export const SCHEDULE_WARNING_TEXT: Record<ScheduleWarning, string> = {
  past: "That time has already passed, so it will go out within the next few minutes.",
  expires_first: "This quote expires before that time. Extend the expiry or pick an earlier time.",
  unreachable: "The client has no email or textable phone on file yet, so this will fail unless one is added first.",
};
