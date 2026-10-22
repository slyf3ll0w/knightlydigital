import { requirePageActor } from "@/lib/permissions";
import { DsPage, PageHeader, SectionTitle } from "@/components/ds";
import ClientGallery from "./ClientGallery";

/**
 * /app/design/client — the Client Kit gallery: every page a CLIENT of a
 * business sees, rendered on the fake Brightwire Electric account at phone
 * and desk widths, in several brands. Unlisted; the place to review a
 * client-facing change before it ships. Rules: docs/design-system.md →
 * "Client pages". The frames load /client-preview (fixtures, demo mode —
 * Approve and Pay play the stamp moment without a server).
 */
export const metadata = { title: "Client pages — WorkBench" };

export default async function ClientDesignPage() {
  await requirePageActor();
  return (
    <DsPage>
      <PageHeader
        eyebrow="Client Kit"
        title="What your clients see"
        info="These are the pages a client opens from an email or a text: the estimate they approve and the invoice they pay. They are rendered here on a made-up company, Brightwire Electric, so you can judge the look at phone and desk widths and in a few brand colors. Approve and Pay work on these previews without charging anyone."
      />
      <div className="mt-8">
        <SectionTitle info="Pick a document, a state and a brand. The same page renders at phone width (390) and desk width (900).">
          Estimate and invoice
        </SectionTitle>
        <ClientGallery />
      </div>
    </DsPage>
  );
}
