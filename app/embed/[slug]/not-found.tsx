import ForceLightTheme from "@/components/ForceLightTheme";

/**
 * A 404 inside an embed iframe: the site-wide page (app/not-found.tsx) is a
 * full-screen card about an expired link and tells the visitor to contact
 * "the business that sent it" — wrong on a business's own website, and its
 * min-h-screen makes the frame scroll. The frame says, briefly, that this
 * form isn't available (an item or estimate tool turned off or renamed, a
 * mistyped snippet) and leaves the host page to do the talking.
 */
export default function EmbedNotFound() {
  return (
    // theme-ok: a public surface, always light like every customer page
    <div className="embed-shell app-ui p-4" style={{ colorScheme: "light", fontFamily: "Lexend, system-ui, sans-serif" }}>
      <ForceLightTheme />
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
        <p className="text-sm font-semibold text-gray-900">This form isn&apos;t available right now.</p>
        <p className="mt-1 text-sm text-gray-500">Please contact us another way and we&apos;ll help you out.</p>
      </div>
    </div>
  );
}
