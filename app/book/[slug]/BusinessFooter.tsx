import Link from "next/link";
import { loadBusinessProfile, aboutLine, profileAddress } from "@/lib/business-profile";
import { fmtPhone } from "@/lib/format";

/**
 * Bottom of the hosted booking pages. Two sizes:
 *
 * - "full" — the business's home page (/book/<slug>) and /book/<slug>/about.
 *   Carries the business details (one-line description, address, phone,
 *   email, website) when the company turned that on in Settings → Booking &
 *   forms → Look, or while a texting registration is under review and the
 *   company gave no website of its own: that page is then the website on
 *   the filing, and carriers reject a brand whose site lacks an About,
 *   address, phone and email (Telnyx TELNYX_FAILED, Lessly Holdings
 *   2026-09-24). The /about page always shows them. Otherwise the home page
 *   gets the same quiet legal line as everything else — David found the
 *   boxed "About" block and its link an eyesore (2026-10-02).
 * - "slim" — every form and legal page: just Privacy · Text terms. The
 *   consent checkbox already links both, which is all a form needs.
 */
export default async function BusinessFooter({ slug, dark = false, variant = "slim" }: { slug: string; dark?: boolean; variant?: "full" | "slim" | "about" }) {
  const p = await loadBusinessProfile(slug);
  if (!p) return null;
  const muted = dark ? "text-gray-400" : "text-gray-500";
  const rule = dark ? "border-white/10" : "border-gray-200";
  const link = "underline-offset-2 hover:underline";

  const legal = (
    <>
      <Link href={`/book/${slug}/privacy`} className={link}>
        Privacy
      </Link>
      <span aria-hidden> · </span>
      <Link href={`/book/${slug}/sms-terms`} className={link}>
        Text terms
      </Link>
    </>
  );

  const showDetails = variant === "about" || (variant === "full" && p.showDetails);
  if (!showDetails) {
    return <footer className={`mt-8 text-center text-[12px] ${muted}`}>{legal}</footer>;
  }

  const address = profileAddress(p);
  const contact = [
    address,
    p.phone ? (
      <a key="tel" href={`tel:${p.phone}`} className={link}>
        {fmtPhone(p.phone)}
      </a>
    ) : null,
    p.email ? (
      <a key="mail" href={`mailto:${p.email}`} className={link}>
        {p.email}
      </a>
    ) : null,
    p.website ? (
      <a key="web" href={p.website} target="_blank" rel="noreferrer" className={link}>
        {p.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
      </a>
    ) : null,
  ].filter(Boolean);

  return (
    <footer className={`mt-10 border-t pt-5 text-center text-[13px] leading-relaxed ${rule} ${muted}`}>
      <p>{aboutLine(p)}</p>
      {contact.length > 0 && (
        <address className="mt-2 not-italic">
          {contact.map((c, i) => (
            <span key={i}>
              {i > 0 && <span aria-hidden> · </span>}
              {c}
            </span>
          ))}
        </address>
      )}
      <p className="mt-3 text-[12px]">{legal}</p>
    </footer>
  );
}
