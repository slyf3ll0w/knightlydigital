// Unit checks for lib/reminder-stage.ts + the client text templates in
// lib/sms.ts — run: npx tsx scripts/test-reminder-copy.ts
import assert from "node:assert/strict";
import { reminderStage, HOUR_STAGE_MS, inSmsQuietHours } from "../lib/reminder-stage";
import { appointmentReminderText, bookingConfirmationText, meetingLabel } from "../lib/sms";
import { swapSlugInPath, RESERVED_SLUGS } from "../lib/company-slug";
import { slugify } from "../lib/slugify";

const MIN = 60_000;
const H = 60 * MIN;
const at = (iso: string) => new Date(iso);

// ── Stage rule ─────────────────────────────────────────────────────────────
{
  // A 10:30 call booked days ago: the hour stage opens 70 min out (9:20),
  // not at the top of the hour.
  const appt = { scheduledAt: at("2026-10-06T15:30:00Z"), createdAt: at("2026-10-01T12:00:00Z"), daySentAt: at("2026-10-05T15:30:00Z"), hourSentAt: null };
  assert.equal(reminderStage({ now: at("2026-10-06T14:00:00Z"), ...appt }), null, "90 min out: not yet");
  assert.equal(reminderStage({ now: at("2026-10-06T14:20:00Z"), ...appt }), "hour", "70 min out: hour stage");
  assert.equal(reminderStage({ now: at("2026-10-06T14:25:00Z"), ...appt }), "hour", "65 min out: still hour stage");
  assert.equal(reminderStage({ now: at("2026-10-06T15:25:00Z"), ...appt }), "hour", "5 min out, never sent: still sends");
  assert.equal(reminderStage({ now: at("2026-10-06T15:31:00Z"), ...appt }), null, "started: nothing");
  assert.equal(reminderStage({ now: at("2026-10-06T14:20:00Z"), ...appt, hourSentAt: at("2026-10-06T14:20:00Z") }), null, "hour already sent");
}
{
  // Day stage: ≤ 24 h out, only when the booking existed a day ahead.
  const base = { scheduledAt: at("2026-10-07T15:00:00Z"), createdAt: at("2026-10-01T12:00:00Z"), daySentAt: null, hourSentAt: null };
  assert.equal(reminderStage({ now: at("2026-10-06T14:00:00Z"), ...base }), null, "25 h out: not yet");
  assert.equal(reminderStage({ now: at("2026-10-06T15:00:00Z"), ...base }), "day", "24 h out: day stage");
  assert.equal(reminderStage({ now: at("2026-10-07T08:00:00Z"), ...base }), "day", "7 h out (quiet hours pushed it): still day");
  assert.equal(reminderStage({ now: at("2026-10-07T13:30:00Z"), ...base }), null, "90 min out, day never sent: skipped (hour stage covers it)");
  assert.equal(reminderStage({ now: at("2026-10-07T13:55:00Z"), ...base }), "hour", "65 min out: hour stage even though day was skipped");
  // Booked this morning for this afternoon: no "day before" reminder at all.
  const sameDay = { ...base, createdAt: at("2026-10-07T09:00:00Z") };
  assert.equal(reminderStage({ now: at("2026-10-07T09:05:00Z"), ...sameDay }), null, "just booked, 6 h out: no day reminder");
  assert.equal(reminderStage({ now: at("2026-10-07T13:55:00Z"), ...sameDay }), "hour", "…but the hour reminder still comes");
  // Booked 40 minutes ahead: the confirmation IS the reminder.
  const rush = { ...base, createdAt: at("2026-10-07T14:20:00Z") };
  assert.equal(reminderStage({ now: at("2026-10-07T14:25:00Z"), ...rush }), null, "booked under 70 min ahead: no hour reminder");
  assert.ok(HOUR_STAGE_MS === 70 * MIN);
  assert.ok(H > 0);
}
{
  assert.equal(inSmsQuietHours(at("2026-10-07T12:30:00Z"), "America/Chicago"), true, "7:30 AM Chicago is quiet");
  assert.equal(inSmsQuietHours(at("2026-10-07T13:00:00Z"), "America/Chicago"), false, "8:00 AM Chicago sends");
  assert.equal(inSmsQuietHours(at("2026-10-08T02:00:00Z"), "America/Chicago"), true, "9:00 PM Chicago is quiet");
}

// ── Copy ───────────────────────────────────────────────────────────────────
{
  assert.equal(meetingLabel("Estimate", "PHONE_CALL"), "Estimate call");
  assert.equal(meetingLabel("Sales call", "PHONE_CALL"), "Sales call", "no doubled word");
  assert.equal(meetingLabel("Estimate", "VIDEO_CALL"), "Estimate video call");
  assert.equal(meetingLabel("Estimate visit", "IN_PERSON"), "Estimate visit");
  assert.equal(meetingLabel("Gutter cleaning", "VISIT"), "Gutter cleaning visit");

  const common = { companyName: "David Lessly", firstName: "Maria", serviceName: "Estimate", windowLabel: "Tue, Oct 7, 3:00 PM", timeLabel: "3:00 PM" };
  const callHour = appointmentReminderText({ ...common, kind: "PHONE_CALL", phone: "(555) 010-1234", stage: "hour" });
  assert.ok(!/arrive/i.test(callHour), `a call never "arrives": ${callHour}`);
  assert.ok(/will call you at \(555\) 010-1234/.test(callHour), callHour);
  assert.ok(/Reply STOP to opt out\.$/.test(callHour));
  const callDay = appointmentReminderText({ ...common, kind: "PHONE_CALL", phone: "(555) 010-1234", stage: "day" });
  assert.ok(/Estimate call is Tue, Oct 7, 3:00 PM/.test(callDay), callDay);
  assert.ok(/Just reply/.test(callDay), "day stage invites a reply");

  const video = appointmentReminderText({ ...common, kind: "VIDEO_CALL", meetingLink: "https://meet.example/abc", stage: "hour" });
  assert.ok(/Join: https:\/\/meet.example\/abc/.test(video), video);
  assert.ok(!/arrive/i.test(video));

  const visitHour = appointmentReminderText({ ...common, kind: "IN_PERSON", windowLabel: "Tue, Oct 7, 3:00 PM – 5:00 PM", timeLabel: "3:00 PM – 5:00 PM", address: "12 Oak St", stage: "hour" });
  assert.ok(/will arrive for your Estimate visit between 3:00 PM and 5:00 PM today at 12 Oak St/.test(visitHour), visitHour);
  const exactVisit = appointmentReminderText({ ...common, kind: "VISIT", serviceName: "Mow", address: "12 Oak St", stage: "hour" });
  assert.ok(/will arrive for your Mow visit at 3:00 PM today at 12 Oak St/.test(exactVisit), exactVisit);
  // Every template names the business exactly once (carriers want the sender; nobody wants it twice)
  for (const t of [callHour, callDay, video, visitHour, exactVisit]) {
    assert.equal(t.split("David Lessly").length - 1, 1, `names the business once: ${t}`);
  }

  const confirmed = bookingConfirmationText({ ...common, kind: "PHONE_CALL", phone: "(555) 010-1234", event: "confirmed", manageUrl: "https://x.test/m/1" });
  assert.ok(/Estimate call with David Lessly is booked for Tue, Oct 7, 3:00 PM\. We'll call you at \(555\) 010-1234\. Reschedule or cancel: https:\/\/x.test\/m\/1 Reply STOP/.test(confirmed), confirmed);
  const received = bookingConfirmationText({ ...common, kind: "IN_PERSON", address: "12 Oak St", event: "received" });
  assert.ok(/got your request for an Estimate visit on Tue, Oct 7, 3:00 PM at 12 Oak St\. We'll confirm shortly\./.test(received), received);
  const moved = bookingConfirmationText({ ...common, kind: "VIDEO_CALL", meetingLink: "https://meet.example/abc", event: "rescheduled" });
  assert.ok(/has moved to Tue, Oct 7, 3:00 PM\. Join: https:\/\/meet.example\/abc/.test(moved), moved);
  const cancelled = bookingConfirmationText({ ...common, kind: "PHONE_CALL", event: "cancelled", rebookUrl: "https://x.test/book/a/b" });
  assert.ok(/has been cancelled\. Book again: https:\/\/x.test\/book\/a\/b/.test(cancelled), cancelled);
  const visit = bookingConfirmationText({ ...common, kind: "VISIT", serviceName: "Gutter cleaning", windowLabel: "Tue, Oct 7, 8:00 AM – 10:00 AM", address: "12 Oak St", event: "confirmed" });
  assert.ok(/Gutter cleaning visit with David Lessly is booked for Tue, Oct 7, 8:00 AM – 10:00 AM at 12 Oak St\. Reply STOP/.test(visit), visit);
}

// ── Web address ────────────────────────────────────────────────────────────
{
  assert.equal(slugify("Lessly Holdings, LLC"), "lessly-holdings-llc");
  assert.equal(slugify("  David Lessly "), "david-lessly");
  assert.equal(swapSlugInPath("/book/lessly-holdings/privacy", "lessly-holdings", "david-lessly"), "/book/david-lessly/privacy");
  assert.equal(swapSlugInPath("/portal/lessly-holdings", "lessly-holdings", "david-lessly"), "/portal/david-lessly");
  assert.equal(swapSlugInPath("/book/lessly-holdings-2/x", "lessly-holdings", "david-lessly"), "/book/lessly-holdings-2/x", "whole segment only");
  assert.ok(RESERVED_SLUGS.has("app") && RESERVED_SLUGS.has("help"));
}

console.log("test-reminder-copy: all checks passed");
