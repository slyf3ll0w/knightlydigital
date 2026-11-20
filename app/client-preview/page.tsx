import { notFound } from "next/navigation";
import "@/app/client.css";
import ForceLightTheme from "@/components/ForceLightTheme";
import { getActor } from "@/lib/permissions";
import { FIXTURE_THEMES, FIXTURE_THEME_PHOTOS, fixtureBalance, fixtureHub, fixtureInvoice, fixtureQuote, fixtureThemeContext, type FixtureBrand } from "@/lib/client-fixtures";
import { parseClientTheme, portalSectionOrder, resolveTheme, type ResolvedClientTheme, type ThemeProblem } from "@/lib/client-theme-spec";
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
 *   theme = fixture:<name> (lib/client-fixtures.ts FIXTURE_THEMES: green-photo |
 *           warm-orange | minimal-mono): the page-designer theme on the portal,
 *           login, booking page and forms (quote + invoice never read a theme)
 *   themeSpec = a theme spec as JSON (checked by parseClientTheme against
 *           Brightwire; photo ids fx_crew / fx_yard; problems listed at the foot)
 * Demo mode: Approve / Pay succeed locally so the stamp moment can be seen.
 * Signed-in only outside development — it shows nothing real either way.
 */
const FIXTURE_LOGO = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="48" viewBox="0 0 160 48"><path d="M14 4 L4 28 H14 L10 44 L28 18 H17 L22 4 Z" fill="#F59E0B"/><text x="36" y="31" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="#0A1428">Brightwire</text></svg>')}`;

export const metadata = { title: "Client page preview — WorkBench", robots: { index: false, follow: false } };

export default async function ClientPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string; state?: string; brand?: string; logo?: string; theme?: string; themeSpec?: string }>;
}) {
  if (process.env.NODE_ENV === "production" && !(await getActor())) notFound();
  const sp = await searchParams;
  const brand = (["default", "navy", "orange", "yellow", "black"].includes(sp.brand ?? "") ? sp.brand : "navy") as FixtureBrand;
  const { theme, problems } = previewTheme(sp, brand);
  const notes = problems.length ? <ThemeProblems problems={problems} /> : null;
  if ((BOOKING_DOCS as readonly string[]).includes(sp.doc ?? "")) {
    return (
      <>
        <BookingPreview doc={sp.doc as BookingDoc} state={sp.state} brand={brand} logoUrl={sp.logo === "1" ? FIXTURE_LOGO : null} theme={theme} />
        {notes}
      </>
    );
  }
  if (sp.doc === "hub") {
    const hub = fixtureHub(sp.state === "clear" ? "clear" : "open", brand);
    // logo=1: a stand-in mark, to see the band with a logo tile
    const company = sp.logo === "1" ? { ...hub.company, logoUrl: FIXTURE_LOGO } : hub.company;
    return (
      <>
        <ForceLightTheme />
        <HubShell company={company} firstName={hub.firstName} base={hub.data.base} unreadMessages={hub.unread} currentPath={hub.data.base} theme={theme}>
          <HubHome d={hub.data} sections={theme && !theme.isDefault ? portalSectionOrder(theme) : undefined} />
        </HubShell>
        {notes}
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

/**
 * The page-designer theme for this preview: a fixture by name or a spec passed
 * as JSON, checked against Brightwire like a real company's would be. No
 * theme = null = today's look. (Phase 2 adds draft tokens: ?theme=<token>.)
 */
function previewTheme(sp: { theme?: string; themeSpec?: string }, brand: FixtureBrand): { theme: ResolvedClientTheme | null; problems: ThemeProblem[] } {
  let raw: unknown = null;
  if (sp.theme?.startsWith("fixture:")) {
    const name = sp.theme.slice("fixture:".length);
    raw = FIXTURE_THEMES[name] ?? null;
    if (!raw) return { theme: null, problems: [{ path: "theme", message: `No fixture theme named ${name}. Fixtures: ${Object.keys(FIXTURE_THEMES).join(", ")}` }] };
  } else if (sp.themeSpec) {
    raw = sp.themeSpec;
  }
  if (raw === null) return { theme: null, problems: [] };
  const parsed = parseClientTheme(raw, fixtureThemeContext(brand));
  return { theme: resolveTheme(parsed.theme, { imageUrl: (id) => FIXTURE_THEME_PHOTOS[id] ?? null }), problems: parsed.problems };
}

/** What the checker refused, listed under the page (review frames only). */
function ThemeProblems({ problems }: { problems: ThemeProblem[] }) {
  return (
    <div data-theme-problems className="mx-auto my-6 max-w-2xl rounded-lg bg-red-50 px-4 py-3 text-[13px] text-red-800">
      <p className="font-semibold">Theme problems ({problems.length})</p>
      <ul className="mt-1 list-disc pl-5">
        {problems.map((p, i) => (
          <li key={i}>{p.message}</li>
        ))}
      </ul>
    </div>
  );
}
