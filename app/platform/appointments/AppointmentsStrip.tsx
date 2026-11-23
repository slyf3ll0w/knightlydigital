import Link from "next/link";
import Monogram from "@/components/Monogram";
import { Picture, PicLink } from "@/components/ListBands";

/**
 * Appointments picture (heavy pilot round 6): the next two weeks as a strip
 * of days, each carrying the faces of the clients booked on it. A busy
 * Tuesday looks busy; an empty week looks empty. Each face opens its
 * appointment. Up to three faces per day, then "+n".
 */

export type StripAppt = { id: string; name: string; title: string; time: string; tentative: boolean };
export type StripDay = { key: string; dow: string; date: string; month: string | null; today: boolean; weekend: boolean; href: string; appts: StripAppt[] };

const SHOW = 3;

export default function AppointmentsStrip({
  days,
  next,
  toApprove,
  toClose,
}: {
  days: StripDay[];
  next: { href: string; label: string } | null;
  toApprove: { count: number; href: string };
  toClose: { count: number; href: string };
}) {
  const total = days.reduce((s, d) => s + d.appts.length, 0);
  return (
    <Picture
      className="appt-pic"
      title={
        total === 0 ? (
          "Nothing booked in the next two weeks"
        ) : (
          <>
            <b>{total}</b> {total === 1 ? "appointment" : "appointments"} in the next two weeks
          </>
        )
      }
      aside={
        <>
          {next && <PicLink href={next.href}>Next: {next.label}</PicLink>}
          {toApprove.count > 0 && (
            <PicLink href={toApprove.href} alert="warn">
              {toApprove.count} to approve
            </PicLink>
          )}
          {toClose.count > 0 && (
            <PicLink href={toClose.href} alert="warn">
              {toClose.count} gone by, not closed out
            </PicLink>
          )}
        </>
      }
    >
      <div className="appt-strip" role="list">
        {days.map((d, i) => {
          const extra = d.appts.length - SHOW;
          return (
            <div
              key={d.key}
              role="listitem"
              className="appt-day"
              data-today={d.today || undefined}
              data-weekend={d.weekend || undefined}
              data-week2={i >= 7 || undefined}
              style={{ ["--d" as string]: i }}
            >
              <Link prefetch={false} href={d.href} className="appt-day-head" aria-label={`${d.dow} ${d.date}: ${d.appts.length} booked. Open the day on the schedule`}>
                <span className="appt-day-dow">{d.dow}</span>
                <span className="appt-day-date">{d.date}</span>
                {d.month && <span className="appt-day-month">{d.month}</span>}
              </Link>
              <div className="appt-day-faces">
                {d.appts.length === 0 && <span className="appt-day-empty" aria-hidden />}
                {d.appts.slice(0, SHOW).map((a) => (
                  <Link
                    key={a.id}
                    prefetch={false}
                    href={`/app/appointments/${a.id}`}
                    className="appt-face"
                    data-tentative={a.tentative || undefined}
                    title={`${a.time} · ${a.name} · ${a.title}${a.tentative ? " (to approve)" : ""}`}
                    aria-label={`${a.time}, ${a.name}, ${a.title}${a.tentative ? ", to approve" : ""}`}
                  >
                    <Monogram name={a.name} size={30} />
                  </Link>
                ))}
                {extra > 0 && (
                  <Link prefetch={false} href={d.href} className="appt-face-more" aria-label={`${extra} more on ${d.dow} ${d.date}`}>
                    +{extra}
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Picture>
  );
}
