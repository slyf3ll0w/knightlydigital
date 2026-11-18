import { notFound } from "next/navigation";

/**
 * Keeps a mistyped /app address inside the app's own 404
 * (app/platform/not-found.tsx); without it the site's catch-all
 * (app/(wbsite)/[...missing]) would answer with the marketing page.
 */
export default function MissingAppPage() {
  notFound();
}
