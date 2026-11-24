/**
 * Home's line under the greeting (David 2026-11-24, "less repetitive"): the
 * shape of the day in plain words, said a little differently each visit,
 * plus a heads-up when a holiday is close. Built only from today's real
 * schedule; nothing invented.
 */

const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type DayShapeInput = {
  /** jobs + appointments on today's calendar */
  stops: number;
  jobs: number;
  /** "9:00a" style labels; null when everything is "anytime" */
  firstTime: string | null;
  lastTime: string | null;
  /** every stop with a time is behind us */
  allDone: boolean;
  /** what's waiting in Needs you */
  waiting: number;
};

export function dayShapeLine(d: DayShapeInput): string {
  const jobsWord = (n: number) => (n === 1 ? "job" : "jobs");
  const stopsWord = (n: number) => (n === 1 ? "stop" : "stops");
  if (d.stops === 0) {
    return pick([
      "Nothing on the books today.",
      d.waiting > 0 ? "A clear day: a good one to work through what's waiting." : "A clear day on the calendar.",
      d.waiting > 0 ? `No jobs today, and ${d.waiting} ${d.waiting === 1 ? "thing needs" : "things need"} you below.` : "No jobs today. Enjoy the quiet.",
    ]);
  }
  if (d.allDone) {
    return pick([
      `Today's work is done: ${d.stops} ${stopsWord(d.stops)} finished.`,
      `All ${d.stops} ${stopsWord(d.stops)} wrapped up for today.`,
    ]);
  }
  const first = d.firstTime ? `, first at ${d.firstTime}` : "";
  if (d.stops <= 2) {
    return pick([
      `A light day: ${d.stops} ${stopsWord(d.stops)}${first}.`,
      `Easy one today, just ${d.stops} ${d.jobs === d.stops ? jobsWord(d.stops) : stopsWord(d.stops)}${first}.`,
    ]);
  }
  if (d.stops <= 5) {
    return pick([
      `A steady day: ${d.stops} ${stopsWord(d.stops)}${first}.`,
      d.lastTime ? `${d.stops} ${stopsWord(d.stops)} today, the last at ${d.lastTime}.` : `${d.stops} ${stopsWord(d.stops)} on today's calendar.`,
    ]);
  }
  return pick([
    `Big day: ${d.stops} ${stopsWord(d.stops)}${first}.`,
    `Full calendar today, ${d.stops} ${stopsWord(d.stops)}.`,
  ]);
}

// ── US holidays a field-service business plans around ──
function nthWeekday(y: number, m: number, weekday: number, n: number) {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
}
function lastWeekday(y: number, m: number, weekday: number) {
  const last = new Date(Date.UTC(y, m, 0));
  return last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7);
}
function holidaysOf(y: number): { name: string; m: number; d: number }[] {
  return [
    { name: "New Year's Day", m: 1, d: 1 },
    { name: "Memorial Day", m: 5, d: lastWeekday(y, 5, 1) },
    { name: "the Fourth of July", m: 7, d: 4 },
    { name: "Labor Day", m: 9, d: nthWeekday(y, 9, 1, 1) },
    { name: "Thanksgiving", m: 11, d: nthWeekday(y, 11, 4, 4) },
    { name: "Christmas Eve", m: 12, d: 24 },
    { name: "Christmas", m: 12, d: 25 },
  ];
}

/** "Thanksgiving is Thursday." within the coming week; a greeting on the day. */
export function holidayLine(local: { y: number; m: number; d: number }): string | null {
  const today = Date.UTC(local.y, local.m - 1, local.d);
  for (const y of [local.y, local.y + 1]) {
    for (const h of holidaysOf(y)) {
      const at = Date.UTC(y, h.m - 1, h.d);
      const daysAway = Math.round((at - today) / 86_400_000);
      if (daysAway === 0) return h.name.startsWith("the ") ? `Happy ${h.name.slice(4)}.` : `Happy ${h.name}.`;
      if (daysAway === 1) return `${capital(h.name)} is tomorrow. Worth a look at the schedule.`;
      if (daysAway > 1 && daysAway <= 6) return `${capital(h.name)} is ${WEEKDAYS[new Date(at).getUTCDay()]}.`;
    }
  }
  return null;
}
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The time of day the band follows. */
export function daypartOf(hour: number): "morning" | "day" | "evening" | "night" {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "day";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}
