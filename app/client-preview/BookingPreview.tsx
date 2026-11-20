import ForceLightTheme from "@/components/ForceLightTheme";
import {
  fixtureAppearance,
  fixtureBookingItems,
  fixtureBooked,
  fixtureBusinessProfile,
  fixtureCompany,
  fixtureHub,
  fixtureRequestItem,
  fixtureServiceItem,
  fixtureSlotDays,
  type FixtureBrand,
} from "@/lib/client-fixtures";
import { BookingFrame } from "@/app/book/[slug]/schedule/ScheduleFrame";
import ScheduleMenu from "@/app/book/[slug]/schedule/ScheduleMenu";
import EstimateMenu from "@/app/book/[slug]/estimate/EstimateMenu";
import { BusinessFooterView } from "@/app/book/[slug]/BusinessFooter";
import RequestForm from "@/app/book/[slug]/RequestForm";
import BookingStepper from "@/app/book/[slug]/schedule/[type]/BookingStepper";
import EmbedScheduleShell from "@/app/embed/[slug]/schedule/EmbedScheduleShell";
import PortalLogin from "@/app/portal/[slug]/PortalLogin";
import HubShell from "@/app/hub/[token]/HubShell";
import { HubFormHeader } from "@/app/hub/[token]/requests/new/HubRequestForm";
import { ClientSectionTitle } from "@/components/client/ClientFrame";

/**
 * Review frames for the booking page, its forms and the portal login, on
 * the fake Brightwire Electric (see ../page.tsx for the query). Every frame
 * is the real component with fixture data; forms render in preview mode
 * (nothing submits) and the stepper gets its open times handed in.
 *   doc   = book | form | stepper | embed | login | hubform
 *   state = stepper: services | time | details | done (default time)
 */
export const BOOKING_DOCS = ["book", "form", "stepper", "embed", "login", "hubform"] as const;
export type BookingDoc = (typeof BOOKING_DOCS)[number];

const SLUG = "brightwire-electric";

export default function BookingPreview({ doc, state, brand, logoUrl }: { doc: BookingDoc; state?: string; brand: FixtureBrand; logoUrl: string | null }) {
  const c = fixtureCompany(brand);
  const company = { ...c, logoUrl, slug: SLUG };
  const appearance = fixtureAppearance(brand);
  const profile = fixtureBusinessProfile(brand);

  if (doc === "login") {
    return (
      <>
        <ForceLightTheme />
        <PortalLogin
          company={{ name: c.name, slug: SLUG, logoUrl, phone: "4695550142", email: c.email, brandColor: c.brandColor, brandColorSecondary: c.brandColorSecondary, documentColor: c.documentColor }}
          requestHref={`/client-preview?doc=book&brand=${brand}`}
        />
      </>
    );
  }

  if (doc === "book") {
    const items = fixtureBookingItems();
    return (
      <>
        <ForceLightTheme />
        <BookingFrame company={company} appearance={appearance} subtitle="Pick what you'd like to book" footer={<BusinessFooterView profile={profile} slug={SLUG} variant="full" />}>
          <ScheduleMenu companySlug={SLUG} types={items} appearance={appearance} hrefBase="/client-preview" />
          <div className="mt-8">
            <ClientSectionTitle className="mb-3">Instant estimates</ClientSectionTitle>
            <EstimateMenu companySlug={SLUG} tools={[{ id: "e1", slug: "ev-charger", heading: "EV charger estimate", description: "Answer five questions for a price range.", showPrice: "range" }]} appearance={appearance} hrefBase="/client-preview" />
          </div>
        </BookingFrame>
      </>
    );
  }

  if (doc === "form" || doc === "embed") {
    const it = fixtureRequestItem();
    const form = <RequestForm companySlug={SLUG} item={it} appearance={appearance} showHeader={doc === "embed"} preview businessName={c.name} offerSms />;
    if (doc === "embed") {
      return (
        <>
          <ForceLightTheme />
          <div className="mx-auto max-w-xl">
            <EmbedScheduleShell appearance={appearance}>{form}</EmbedScheduleShell>
          </div>
        </>
      );
    }
    return (
      <>
        <ForceLightTheme />
        <BookingFrame company={company} appearance={appearance} title={it.heading} subtitle={it.description} footer={<BusinessFooterView profile={profile} slug={SLUG} variant="slim" />}>
          {form}
        </BookingFrame>
      </>
    );
  }

  if (doc === "hubform") {
    const hub = fixtureHub("open", brand);
    const it = fixtureRequestItem();
    return (
      <>
        <ForceLightTheme />
        <HubShell company={{ ...hub.company, logoUrl }} firstName={hub.firstName} base={hub.data.base} unreadMessages={hub.unread} currentPath={`${hub.data.base}/requests`}>
          <HubFormHeader base="/client-preview?doc=hub" title={it.heading} description={it.description} />
          <RequestForm
            companySlug={SLUG}
            item={it}
            appearance={{ ...appearance }}
            preview
            hub={{ token: "preview", contact: { firstName: "Maria", lastName: "Hernandez", email: "maria.hernandez@example.com", phone: "(214) 555-0171", address: "88 Cedar Ln, Allen, TX 75013" } }}
            businessName={c.name}
            offerSms
          />
        </HubShell>
      </>
    );
  }

  // doc === "stepper"
  const days = fixtureSlotDays();
  const services = state === "services";
  const type = services ? fixtureServiceItem() : fixtureBookingItems()[0];
  const lastStep = services ? 0 : state === "details" ? 1 : 0;
  return (
    <>
      <ForceLightTheme />
      <BookingFrame company={company} appearance={appearance} title={type.heading} subtitle={type.description} wide footer={<BusinessFooterView profile={profile} slug={SLUG} variant="slim" />}>
        <BookingStepper
          companySlug={SLUG}
          type={type}
          company={{ name: c.name, timezone: "America/Chicago", phone: c.phone, email: c.email, menuHref: "/client-preview?doc=book", offerSms: true }}
          appearance={appearance}
          preview
          demo={{
            days,
            step: lastStep,
            slotStart: state === "services" ? undefined : days[0].slots[2].start,
            booked: state === "done" ? fixtureBooked(days) : undefined,
          }}
        />
      </BookingFrame>
    </>
  );
}
