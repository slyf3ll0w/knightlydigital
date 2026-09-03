import { notFound } from "next/navigation";
import { loadBookingItem, type LoadedItem } from "@/lib/booking-public";
import { bookingPaymentConfig } from "@/lib/booking-payment-config";
import { decodePrefill } from "@/lib/booking-prefill";
import type { AppearanceOverrides } from "./schedule/shell";
import ScheduleFrame from "./schedule/ScheduleFrame";
import BookingStepper from "./schedule/[type]/BookingStepper";
import RequestForm from "./RequestForm";
import EmbedScheduleShell from "@/app/embed/[slug]/schedule/EmbedScheduleShell";
import EmbedAutoResize from "@/app/embed/[slug]/EmbedAutoResize";

const APP_URL = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";

export type ItemSearchParams = AppearanceOverrides & { prefill?: string; preview?: string; service?: string };

/**
 * One item, hosted or embedded: the stepper when the customer picks a time,
 * the one-step request form when the business follows up. Also renders the
 * company's booking page when it shows a single item (so /book/[slug] is
 * that item, not a one-row menu).
 */
export default async function ItemView({
  companySlug,
  itemSlug,
  embed = false,
  searchParams = {},
  loaded,
}: {
  companySlug: string;
  itemSlug: string;
  embed?: boolean;
  searchParams?: ItemSearchParams;
  /** Already loaded by the caller (the single-item booking page) */
  loaded?: LoadedItem;
}) {
  const item = loaded ?? (await loadBookingItem(companySlug, itemSlug, { preview: searchParams.preview === "1", overrides: searchParams }));
  if (!item) notFound();
  const { company, type, pub, appearance, previewing, menuCount } = item;
  const scheduled = pub.mode === "SCHEDULE";
  const base = embed ? `/embed/${companySlug}` : `/book/${companySlug}`;
  const menuHref = menuCount > 1 ? base : "";
  const previewNote = previewing && (
    <div className={`mb-4 rounded border px-3 py-2 text-center text-xs ${appearance.dark ? "border-white/15 text-gray-400" : "border-gray-200 bg-white text-gray-500"}`}>
      Preview — this is what customers see{type.isActive ? "" : " once it's turned on"}. Nothing submits from here.
    </div>
  );

  const body = scheduled ? (
    <BookingStepper
      companySlug={companySlug}
      type={pub}
      company={{ name: company.name, timezone: company.timezone, phone: company.phone, email: company.email, menuHref }}
      appearance={appearance}
      payment={bookingPaymentConfig(type, company)}
      hostedUrl={`${APP_URL}/book/${companySlug}/${pub.slug}`}
      prefill={embed ? null : decodePrefill(searchParams.prefill)}
      embed={embed}
      preview={previewing}
    />
  ) : (
    <RequestForm
      companySlug={companySlug}
      item={pub}
      appearance={appearance}
      showHeader={embed}
      initialService={typeof searchParams.service === "string" ? searchParams.service.slice(0, 120) : ""}
      preview={previewing}
    />
  );

  if (embed) {
    return (
      <EmbedScheduleShell appearance={appearance}>
        <EmbedAutoResize slug={`${companySlug}/${pub.slug}`} />
        {previewNote}
        {body}
      </EmbedScheduleShell>
    );
  }
  return (
    <ScheduleFrame company={company} appearance={appearance} title={pub.heading} subtitle={pub.description ?? company.name} wide={scheduled}>
      {previewNote}
      {body}
    </ScheduleFrame>
  );
}
