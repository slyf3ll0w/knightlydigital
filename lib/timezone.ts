/**
 * IANA timezone validation, shared by Settings (where the company edits it)
 * and signup (where the browser's zone is captured so a company in Denver
 * doesn't run its reminders, booking slots, and arrival windows on Central
 * time until someone finds the setting).
 */
export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The signed-up-from browser's zone, or null when it can't be told. */
export function browserTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz !== "UTC" ? tz : null;
  } catch {
    return null;
  }
}
