// Unit check for lib/appointment-hint.ts — run: npx tsx scripts/test-appointment-hint.ts
import assert from "node:assert/strict";
import { looksLikeAppointment } from "../lib/appointment-hint";

const yes = [
  "Friday Appointment",
  "appt with Dan",
  "Estimate — roof",
  "Consultation",
  "1-on-1 with Mike",
  "One on one",
  "1:1 coffee",
  "Sales call",
  "Discovery call",
  "Zoom w/ vendor",
  "Lunch with Ray",
  "Networking meetup",
];
const no = [
  "Gutter cleaning",
  "AC tune-up",
  "Roof inspection",
  "Site visit",
  "Walkthrough — final",
  "Lawn maintenance",
  "Appointmentless", // no word boundary
  "",
];
for (const t of yes) assert.equal(looksLikeAppointment(t), true, `expected match: ${t}`);
for (const t of no) assert.equal(looksLikeAppointment(t), false, `expected no match: ${t}`);
assert.equal(looksLikeAppointment(null), false);
console.log(`appointment-hint: ${yes.length + no.length + 1}/${yes.length + no.length + 1} ok`);
