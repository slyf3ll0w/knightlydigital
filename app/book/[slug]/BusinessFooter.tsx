import Link from "next/link";
import { loadBusinessProfile, aboutLine, profileAddress } from "@/lib/business-profile";
import { fmtPhone } from "@/lib/format";

/**
 * Bottom of the hosted booking pages. Two sizes:
 *
 * - "full" — the business's home page (/book/<slug> and /book/<slug>/about).
 *   That page is the website on its texting registration, and carriers
 *   reject a brand whose home page lacks an About, address, phone and email
 *   (Telnyx TELNYX_FAILED, Lessly Holdings 2026-09-24).
 * - "slim" — every form and legal page: one quiet line with the name and the
 *   About / Privacy / Text terms links. The consent checkbox already links
 *   privacy + terms, which is all a form needs; a description block under
 *   every form read as clutter (David, 2026-09-25).
 */
export default async function BusinessFooter({ slug, dark = false, variant = "slim" }: { slug: string; dark?: boolean; variant?: "full" | "slim" }) {
  const p = await loadBusinessProfile(slug);
  if (!p) return null;
  const muted = dark ? "text-gray-400" : "text-gray-500";
  const strong = dark ? "text-gray-100" : "text-gray-900";
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

  if (variant === "slim") {
    return (
      <footer className={`mt-8 text-center text-[12px] ${muted}`}>
        <span className={`font-medium ${dark ? "text-gray-300" : "text-gray-600"}`}>{p.name}</span>
        <span aria-hidden> · </span>
        <Link href={`/book/${slug}/about`} className={link}>
          About
        </Link>
        <span aria-hidden> · </span>
        {legal}
      </footer>
    );
  }

  const address = profileAddress(p);
  // The owner's own words already say what they do; the service list is the fallback description.
  const showServices = !p.about?.trim() && p.services.length > 0;
  return (
    <footer className={`mt-10 rounded-lg border p-5 text-[13px] leading-relaxed ${rule} ${dark ? "bg-white/5" : "bg-white"} ${muted}`}>
      <p className={`text-sm font-semibold ${strong}`}>About {p.name}</p>
      <p className="mt-1.5">{aboutLine(p)}</p>
      {showServices && <p className="mt-1.5">Services: {p.services.join(", ")}</p>}
      <address className={`mt-4 grid gap-0.5 border-t pt-4 not-italic ${rule}`}>
        {address && <span>{address}</span>}
        {p.phone && (
          <a href={`tel:${p.phone}`} className={link}>
            {fmtPhone(p.phone)}
          </a>
        )}
        {p.email && (
          <a href={`mailto:${p.email}`} className={link}>
            {p.email}
          </a>
        )}
        {p.website && (
          <a href={p.website} target="_blank" rel="noreferrer" className={link}>
            {p.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </a>
        )}
      </address>
      <p className="mt-4 text-[12px]">{legal}</p>
    </footer>
  );
}
