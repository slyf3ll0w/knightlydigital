import Link from "next/link";
import Monogram from "@/components/Monogram";
import { Picture, PicLink } from "@/components/ListBands";
import { money } from "@/lib/statuses";

/**
 * Clients page picture (2026-11-23): the book growing month by month. Each
 * of the last 12 months is a column; the clients added that month stand in
 * it as their own monogram circles (newest on top), so a busy month is a
 * tall stack and a quiet one is a bare tick. Shaped by the client list
 * itself, like the Jobs week — not a number card. Styles: app/ds-clients.css.
 */

export type BookPerson = { id: string; name: string };
export type BookMonth = { label: string; long: string; count: number; people: BookPerson[]; now: boolean };

const SHOW = 4;

export default function ClientBook({
  total,
  months,
  owed,
}: {
  total: number;
  months: BookMonth[];
  /** null = this person can't see money */
  owed: { clients: number; amount: number; href: string } | null;
}) {
  const added = months.reduce((n, m) => n + m.count, 0);
  const thisMonth = months[months.length - 1]?.count ?? 0;
  return (
    <Picture
      className="ds-cbook-pic"
      title={
        total === 0 ? (
          "No clients yet"
        ) : (
          <>
            <b>{total.toLocaleString("en-US")}</b> {total === 1 ? "client" : "clients"}
            <span className="ds-pic-quiet">
              {" "}
              · {added === 0 ? "none added this year" : `${added} added in the last 12 months`}
              {thisMonth > 0 ? `, ${thisMonth} this month` : ""}
            </span>
          </>
        )
      }
      aside={
        owed && owed.clients > 0 ? (
          <PicLink href={owed.href} alert="bad">
            {owed.clients} {owed.clients === 1 ? "owes" : "owe"} you {money(owed.amount)}
          </PicLink>
        ) : undefined
      }
    >
      <ol className="ds-cbook" aria-label="Clients added per month, last 12 months">
        {months.map((m, k) => {
          const more = m.count - Math.min(SHOW, m.people.length);
          return (
            <li
              key={m.long}
              className={`ds-cbook-month ${m.now ? "is-now" : ""} ${m.count === 0 ? "is-empty" : ""}`}
              style={{ "--k": k } as React.CSSProperties}
              title={`${m.long}: ${m.count} ${m.count === 1 ? "client" : "clients"} added`}
            >
              <span className="ds-cbook-count">{m.count > 0 ? m.count : ""}</span>
              <span className="ds-cbook-stack">
                {more > 0 && <span className="ds-cbook-more">+{more}</span>}
                {m.people.slice(0, SHOW).map((p, j) => (
                  <Link
                    key={p.id}
                    prefetch={false}
                    href={`/app/contacts/${p.id}`}
                    className="ds-cbook-person"
                    title={p.name}
                    aria-label={p.name}
                    style={{ "--j": j } as React.CSSProperties}
                  >
                    <Monogram name={p.name} size={30} />
                  </Link>
                ))}
              </span>
              <span className="ds-cbook-tick" aria-hidden />
              <span className="ds-cbook-label">{m.label}</span>
            </li>
          );
        })}
      </ol>
    </Picture>
  );
}
