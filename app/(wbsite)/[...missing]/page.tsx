import { notFound } from "next/navigation";

/**
 * Any address nothing else answers lands here and 404s inside the site
 * layout, so a mistyped workbenchfsm.com URL gets the site's header, footer
 * and mascot (app/(wbsite)/not-found.tsx) instead of the customer-link card.
 * The app has its own catch-all (app/platform/[...missing]).
 */
export default function MissingPage() {
  notFound();
}
