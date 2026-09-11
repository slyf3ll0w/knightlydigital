/**
 * Does a typed title read like a sales appointment rather than billable work?
 * Appointments (estimates, consults, 1-on-1s with other owners) end with an
 * optional quote; jobs end with an invoice. Users who title a job "Friday
 * appointment" get nudged toward the right record before they book it.
 *
 * Deliberately narrow: "inspection", "site visit", "walkthrough" can be paid
 * work, so they don't match.
 */
const APPOINTMENT_WORDS =
  /\b(appointments?|appt|estimates?|consult(?:ation|ing)?|meeting|meet[- ]?up|1[- :]?on[- ]?1|one[- ]on[- ]one|1[- ]2[- ]1|sales call|discovery(?: call)?|intro(?:duction)? call|phone call|video call|zoom|demo|coffee|lunch|networking)\b/i;

export function looksLikeAppointment(title: string | null | undefined): boolean {
  if (!title) return false;
  return APPOINTMENT_WORDS.test(title.trim());
}
