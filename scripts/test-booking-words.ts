// Unit checks for the video-room pool on a booking item (lib/booking-types.ts +
// lib/booking-runtime.ts nextMeetingLink) and the owner's after-booking words
// (lib/booking-intake.ts + the confirmation text) — run: npx tsx scripts/test-booking-words.ts
import assert from "node:assert/strict";
import { applyBookingTypePatch, defaultSettingsForKind, meetingLinkPool } from "../lib/booking-types";
import { defaultDoneWords, doneWords, sanitizeIntake, confirmationNote } from "../lib/booking-intake";
import { bookingConfirmationText } from "../lib/sms";
import { nextMeetingLink } from "../lib/booking-runtime";

const at = (iso: string) => new Date(iso);

// ── Meeting-link pool on the item ──────────────────────────────────────────
{
  const base = defaultSettingsForKind("VIDEO_CALL");
  assert.deepEqual(base.meetingLinks, [], "fresh video item: no rooms");
  assert.equal(base.meetingLink, null);

  // One per line from the editor: blanks and repeats drop, first mirrors to meetingLink
  const r = applyBookingTypePatch(base, { meetingLinks: "https://meet.google.com/aaa\n\n  https://zoom.us/j/1  \nhttps://meet.google.com/aaa\n" });
  assert.equal(r.error, undefined);
  assert.deepEqual(r.settings.meetingLinks, ["https://meet.google.com/aaa", "https://zoom.us/j/1"]);
  assert.equal(r.settings.meetingLink, "https://meet.google.com/aaa", "meetingLink mirrors the first room");

  // An array works the same (API callers)
  const arr = applyBookingTypePatch(base, { meetingLinks: ["https://a.example/1", "https://a.example/2"] });
  assert.deepEqual(arr.settings.meetingLinks, ["https://a.example/1", "https://a.example/2"]);

  // One bad URL refuses the whole save (nothing half-applied)
  const bad = applyBookingTypePatch(r.settings, { meetingLinks: "https://ok.example/1\nnot a url" });
  assert.match(bad.error ?? "", /full URLs/);
  assert.deepEqual(bad.settings.meetingLinks, r.settings.meetingLinks, "refused save keeps the old list");

  // Clearing the box clears both
  const cleared = applyBookingTypePatch(r.settings, { meetingLinks: "" });
  assert.deepEqual(cleared.settings.meetingLinks, []);
  assert.equal(cleared.settings.meetingLink, null);

  // An older client that only sends meetingLink keeps the list in step
  const single = applyBookingTypePatch(base, { meetingLink: "https://meet.google.com/zzz" });
  assert.deepEqual(single.settings.meetingLinks, ["https://meet.google.com/zzz"]);
  const singleOff = applyBookingTypePatch(single.settings, { meetingLink: "" });
  assert.deepEqual(singleOff.settings.meetingLinks, []);

  // Pool resolution: list wins, else the legacy single link, else nothing
  assert.deepEqual(meetingLinkPool({ meetingLink: "https://x/1", meetingLinks: [] }), ["https://x/1"], "legacy row: single link");
  assert.deepEqual(meetingLinkPool({ meetingLink: "https://x/1", meetingLinks: ["https://x/2", "https://x/3"] }), ["https://x/2", "https://x/3"]);
  assert.deepEqual(meetingLinkPool({ meetingLink: null, meetingLinks: [] }), []);
}

// ── Rotation: round robin that skips rooms already in use ──────────────────
// (async: nextMeetingLink awaits its fake transaction; run last, see the end)
const rotation = async () => {
  type Appt ={ meetingLink: string | null; scheduledAt: Date; scheduledEnd: Date | null; id?: string };
  const makeTx = (opts: { cursor: number; appointments: Appt[] }) => {
    const state = { cursor: opts.cursor, updates: [] as number[] };
    const tx = {
      appointment: {
        findMany: async (q: { where: { scheduledAt: { lt: Date; gt: Date }; meetingLink: { in: string[] }; id?: { not: string } } }) =>
          opts.appointments.filter(
            (a) =>
              a.scheduledAt < q.where.scheduledAt.lt &&
              a.scheduledAt > q.where.scheduledAt.gt &&
              q.where.meetingLink.in.includes(a.meetingLink ?? "") &&
              (!q.where.id || a.id !== q.where.id.not)
          ),
      },
      bookingType: {
        findUnique: async () => ({ meetingLinkCursor: state.cursor }),
        update: async (q: { data: { meetingLinkCursor: number } }) => {
          state.cursor = q.data.meetingLinkCursor;
          state.updates.push(q.data.meetingLinkCursor);
          return {};
        },
      },
    };
    return { tx: tx as never, state };
  };
  const type = (links: string[]) =>
    ({ id: "bt1", companyId: "c1", kind: "VIDEO_CALL", durationMinutes: 30, meetingLink: links[0] ?? null, meetingLinks: links }) as never;
  const start = at("2026-10-22T15:00:00Z");

  // No rooms → null; one room → that room, no cursor write
  {
    const { tx, state } = makeTx({ cursor: 0, appointments: [] });
    assert.equal(await nextMeetingLink(tx, type([]), start), null);
    assert.equal(await nextMeetingLink(tx, type(["https://x/only"]), start), "https://x/only");
    assert.deepEqual(state.updates, [], "a single room never touches the cursor");
  }
  // Three rooms, nothing booked: A, B, C, A …
  {
    const { tx, state } = makeTx({ cursor: 0, appointments: [] });
    const t = type(["https://x/a", "https://x/b", "https://x/c"]);
    assert.equal(await nextMeetingLink(tx, t, start), "https://x/a");
    assert.equal(await nextMeetingLink(tx, t, start), "https://x/b");
    assert.equal(await nextMeetingLink(tx, t, start), "https://x/c");
    assert.equal(await nextMeetingLink(tx, t, start), "https://x/a", "wraps around");
    assert.deepEqual(state.updates, [1, 2, 0, 1]);
  }
  // Cursor says B next, but B is busy 14:45–15:15 → C; cursor moves past C
  {
    const busy: Appt[] = [{ meetingLink: "https://x/b", scheduledAt: at("2026-10-22T14:45:00Z"), scheduledEnd: at("2026-10-22T15:15:00Z") }];
    const { tx, state } = makeTx({ cursor: 1, appointments: busy });
    const t = type(["https://x/a", "https://x/b", "https://x/c"]);
    assert.equal(await nextMeetingLink(tx, t, start), "https://x/c", "skips the room in use");
    assert.deepEqual(state.updates, [0]);
  }
  // A room whose call ended before this slot starts is free again
  {
    const done: Appt[] = [{ meetingLink: "https://x/b", scheduledAt: at("2026-10-22T14:00:00Z"), scheduledEnd: at("2026-10-22T14:30:00Z") }];
    const { tx } = makeTx({ cursor: 1, appointments: done });
    assert.equal(await nextMeetingLink(tx, type(["https://x/a", "https://x/b"]), start), "https://x/b");
  }
  // No scheduledEnd on the older row: judged by the item's duration
  {
    const open: Appt[] = [{ meetingLink: "https://x/a", scheduledAt: at("2026-10-22T14:45:00Z"), scheduledEnd: null }];
    const { tx } = makeTx({ cursor: 0, appointments: open });
    assert.equal(await nextMeetingLink(tx, type(["https://x/a", "https://x/b"]), start), "https://x/b");
  }
  // Every room busy → the cursor's own pick (a room beats no room)
  {
    const all: Appt[] = ["https://x/a", "https://x/b"].map((l) => ({ meetingLink: l, scheduledAt: start, scheduledEnd: at("2026-10-22T15:30:00Z") }));
    const { tx } = makeTx({ cursor: 1, appointments: all });
    assert.equal(await nextMeetingLink(tx, type(["https://x/a", "https://x/b"]), start), "https://x/b");
  }
  // Rescheduling: the booking's own old row doesn't count as "in use"
  {
    const mine: Appt[] = [{ id: "ap1", meetingLink: "https://x/a", scheduledAt: start, scheduledEnd: at("2026-10-22T15:30:00Z") }];
    const { tx } = makeTx({ cursor: 0, appointments: mine });
    assert.equal(await nextMeetingLink(tx, type(["https://x/a", "https://x/b"]), start, { excludeAppointmentId: "ap1" }), "https://x/a");
  }
};

// ── After-booking words ────────────────────────────────────────────────────
{
  const d = sanitizeIntake(null, "VIDEO_CALL", "SCHEDULE");
  assert.deepEqual(d.done, { heading: "", body: "", note: "" }, "null column = no custom words");
  assert.equal(confirmationNote({ intake: null, kind: "VIDEO_CALL", mode: "SCHEDULE" }), null);

  const saved = sanitizeIntake({ done: { heading: "  See you soon ", body: 42, note: "Park out back.\nBring your bill." } }, "VIDEO_CALL", "SCHEDULE");
  assert.equal(saved.done.heading, "See you soon", "trimmed");
  assert.equal(saved.done.body, "", "non-strings read as blank");
  assert.equal(saved.done.note, "Park out back.\nBring your bill.", "newlines kept for the screen and email");
  assert.equal(sanitizeIntake({ done: { note: "x".repeat(500) } }, "IN_PERSON", "SCHEDULE").done.note.length, 300, "note capped");
  assert.equal(confirmationNote({ intake: { done: { note: " hi " } }, kind: "IN_PERSON", mode: "SCHEDULE" }), "hi");

  // Defaults follow the kind, mode and whether it's held for approval
  assert.deepEqual(defaultDoneWords({ kind: "VIDEO_CALL", mode: "SCHEDULE", confirmation: "INSTANT" }), {
    heading: "You're booked!",
    body: "A confirmation with calendar invite is on its way to your inbox.",
  });
  assert.equal(defaultDoneWords({ kind: "PHONE_CALL", mode: "SCHEDULE", confirmation: "APPROVAL" }).heading, "You're penciled in!");
  assert.equal(defaultDoneWords({ kind: "MESSAGE", mode: "REQUEST", confirmation: "INSTANT" }).heading, "Message sent");
  assert.equal(defaultDoneWords({ kind: "SERVICE", mode: "REQUEST", confirmation: "INSTANT", quoteMode: "send" }).body, "Your quote is on its way — check your email.");
  assert.equal(defaultDoneWords({ kind: "IN_PERSON", mode: "REQUEST", confirmation: "INSTANT" }).body, "We'll be in touch within 1 business day to set a time.");

  // The owner's words win field by field; a blank field keeps its default
  const w = doneWords({ done: { heading: "All set, partner!", body: "", note: "" }, quoteMode: "draft" }, { kind: "VIDEO_CALL", mode: "SCHEDULE", confirmation: "INSTANT" });
  assert.equal(w.heading, "All set, partner!");
  assert.equal(w.body, "A confirmation with calendar invite is on its way to your inbox.");
  assert.equal(w.note, null, "blank note = nothing to show");
  const w2 = doneWords(saved, { kind: "VIDEO_CALL", mode: "SCHEDULE", confirmation: "APPROVAL" });
  assert.equal(w2.heading, "See you soon", "custom heading applies to approval items too");
  assert.equal(w2.body, "We'll confirm shortly — watch your inbox.");
  assert.equal(w2.note, "Park out back.\nBring your bill.");
}

// ── The note in the confirmation text ──────────────────────────────────────
{
  const base = { companyName: "Acme", firstName: "Sam", serviceName: "Discovery call", kind: "VIDEO_CALL" as const, windowLabel: "Thu Oct 22, 10:00 AM", meetingLink: "https://x/a" };
  const plain = bookingConfirmationText({ ...base, event: "confirmed" });
  const noted = bookingConfirmationText({ ...base, event: "confirmed", note: "Have your  utility bill\nhandy. " });
  assert.ok(plain.includes("Join: https://x/a"), "video link still sent");
  assert.ok(!plain.includes("utility"), "no note by default");
  assert.ok(noted.includes("Join: https://x/a Have your utility bill handy. "), "note follows the link, whitespace collapsed to one line");
  assert.ok(bookingConfirmationText({ ...base, event: "received", note: "Park out back." }).includes("We'll confirm shortly. Park out back."));
  assert.ok(bookingConfirmationText({ ...base, event: "rescheduled", note: "Park out back." }).includes("Park out back."));
  const cancelled = bookingConfirmationText({ ...base, event: "cancelled", note: "Park out back." });
  assert.ok(!cancelled.includes("Park out back."), "a cancellation carries no arrival note");
}

rotation()
  .then(() => console.log("booking words + room rotation: all checks passed"))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
