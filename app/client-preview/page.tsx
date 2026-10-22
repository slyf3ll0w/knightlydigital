import { notFound } from "next/navigation";
import "@/app/client.css";
import ForceLightTheme from "@/components/ForceLightTheme";
import { getActor } from "@/lib/permissions";
import { fixtureBalance, fixtureInvoice, fixtureQuote, type FixtureBrand } from "@/lib/client-fixtures";
import QuoteAcceptPage from "@/app/quote/[token]/QuoteAcceptPage";
import PayPage from "@/app/pay/[token]/PayPage";

/**
 * One client-facing surface on the fake Brightwire Electric account, for
 * review: the frames on /app/design/client point here. Query:
 *   doc   = quote | invoice
 *   state = quote: open | approved | expired | withdrawn
 *           invoice: open | paid | partial | withdrawn
 *   brand = default | navy | yellow | black
 * Demo mode: Approve / Pay succeed locally so the stamp moment can be seen.
 * Signed-in only outside development — it shows nothing real either way.
 */
export const metadata = { title: "Client page preview — WorkBench", robots: { index: false, follow: false } };

export default async function ClientPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string; state?: string; brand?: string }>;
}) {
  if (process.env.NODE_ENV === "production" && !(await getActor())) notFound();
  const sp = await searchParams;
  const brand = (["default", "navy", "yellow", "black"].includes(sp.brand ?? "") ? sp.brand : "navy") as FixtureBrand;
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
