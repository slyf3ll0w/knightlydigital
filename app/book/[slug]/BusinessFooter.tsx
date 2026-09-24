import Link from "next/link";
import { loadBusinessProfile, aboutLine, profileAddress } from "@/lib/business-profile";
import { fmtPhone } from "@/lib/format";

/**
 * Bottom of every hosted booking page: who the business is, what it does,
 * how to reach it, and its own privacy + text terms. /book/<slug> is the
 * website on the business's texting registration, and carriers reject a
 * brand whose site lacks address, phone, email, an About and its services
 * (Telnyx TELNYX_FAILED, Lessly Holdings 2026-09-24).
 */
export default async function BusinessFooter({ slug, dark = false }: { slug: string; dark?: boolean }) {
  const p = await loadBusinessProfile(slug);
  if (!p) return null;
  const address = profileAddress(p);
  const muted = dark ? "text-gray-400" : "text-gray-500";
  const strong = dark ? "text-gray-200" : "text-gray-800";
  const rule = dark ? "border-white/10" : "border-gray-200";
  return (
    <footer className={`mt-10 border-t pt-6 text-[13px] leading-relaxed ${rule} ${muted}`}>
      <p className={`font-semibold ${strong}`}>About {p.name}</p>
      <p className="mt-1">{aboutLine(p)}</p>
      {p.services.length > 0 && (
        <p className="mt-2">
          <span className={`font-medium ${strong}`}>Services: </span>
          {p.services.join(" · ")}
        </p>
      )}
      <address className="mt-3 not-italic">
        <span className={`block font-medium ${strong}`}>{p.name}</span>
        {address && <span className="block">{address}</span>}
        {p.phone && (
          <a href={`tel:${p.phone}`} className="block underline-offset-2 hover:underline">
            {fmtPhone(p.phone)}
          </a>
        )}
        {p.email && (
          <a href={`mailto:${p.email}`} className="block underline-offset-2 hover:underline">
            {p.email}
          </a>
        )}
        {p.website && (
          <a href={p.website} target="_blank" rel="noreferrer" className="block underline-offset-2 hover:underline">
            {p.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </a>
        )}
      </address>
      <p className="mt-3">
        <Link href={`/book/${slug}/privacy`} className="underline underline-offset-2">
          Privacy Policy
        </Link>
        {" · "}
        <Link href={`/book/${slug}/sms-terms`} className="underline underline-offset-2">
          Text Message Terms
        </Link>
      </p>
    </footer>
  );
}
