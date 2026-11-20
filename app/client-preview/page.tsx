import { notFound } from "next/navigation";
import "@/app/client.css";
import ForceLightTheme from "@/components/ForceLightTheme";
import { getActor } from "@/lib/permissions";
import { fixtureBalance, fixtureHub, fixtureInvoice, fixtureQuote, type FixtureBrand } from "@/lib/client-fixtures";
import HubShell from "@/app/hub/[token]/HubShell";
import HubHome from "@/app/hub/[token]/HubHome";
import QuoteAcceptPage from "@/app/quote/[token]/QuoteAcceptPage";
import PayPage from "@/app/pay/[token]/PayPage";
import BookingPreview, { BOOKING_DOCS, type BookingDoc } from "./BookingPreview";

/**
 * One client-facing surface on the fake Brightwire Electric account, for
 * review: the frames on /app/design/client point here. Query:
 *   doc   = quote | invoice | hub, or the booking page / forms / portal
 *           login: book | form | stepper | embed | login | hubform
 *           (BookingPreview.tsx; stepper state = services | time | details | done)
 *   state = quote: open | approved | expired | withdrawn
 *           invoice: open | paid | partial | withdrawn
 *           hub: open | clear (the client portal home, Maria Hernandez)
 *   brand = default | navy | orange | yellow | black
 *   logo  = 1 (hub, booking and login: a stand-in logo mark)
 * Demo mode: Approve / Pay succeed locally so the stamp moment can be seen.
 * Signed-in only outside development — it shows nothing real either way.
 */
const FIXTURE_LOGO = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="48" viewBox="0 0 160 48"><path d="M14 4 L4 28 H14 L10 44 L28 18 H17 L22 4 Z" fill="#F59E0B"/><text x="36" y="31" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="#0A1428">Brightwire</text></svg>')}`;

export const metadata = { title: "Client page preview — WorkBench", robots: { index: false, follow: false } };

export default async function ClientPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string; state?: string; brand?: string; logo?: string }>;
}) {
  if (process.env.NODE_ENV === "production" && !(await getActor())) notFound();
  const sp = await searchParams;
  const brand = (["default", "navy", "orange", "yellow", "black"].includes(sp.brand ?? "") ? sp.brand : "navy") as FixtureBrand;
  if ((BOOKING_DOCS as readonly string[]).includes(sp.doc ?? "")) {
    return <BookingPreview doc={sp.doc as BookingDoc} state={sp.state} brand={brand} logoUrl={sp.logo === "1" ? FIXTURE_LOGO : null} />;
  }
  if (sp.doc === "hub") {
    const hub = fixtureHub(sp.state === "clear" ? "clear" : "open", brand);
    // logo=1: a stand-in mark, to see the band with a logo tile
    const company = sp.logo === "1" ? { ...hub.company, logoUrl: FIXTURE_LOGO } : hub.company;
    return (
      <>
        <ForceLightTheme />
        <HubShell company={company} firstName={hub.firstName} base={hub.data.base} unreadMessages={hub.unread} currentPath={hub.data.base}>
          <HubHome d={hub.data} />
        </HubShell>
      </>
    );
  }
  const doc = sp.doc === "invoice" ? "invoice" : "quote";

  if (doc === "invoice") {
    const state = (["open", "paid", "partial", "withdrawn"].includes(sp.state ?? "") ? sp.state : "open") as "open" | "paid" | "partial" | "withdrawn";
    const invoice = fixtureInvoice(state, brand);
    return (
      <>
        <ForceLightTheme />
        <PayPage invoice={invoice} balance={fixtureBalance(invoice)} pay={null} demo />
      </>
    );
  }
  const state = (["open", "approved", "expired", "withdrawn"].includes(sp.state ?? "") ? sp.state : "open") as "open" | "approved" | "expired" | "withdrawn";
  const quote = fixtureQuote(state, brand);
  return (
    <>
      <ForceLightTheme />
      <QuoteAcceptPage quote={quote} expired={state === "expired"} demo />
    </>
  );
}
