import { squareFetch, squareIdempotencyKey, type SquareMoney } from "@/lib/square";
import type { SquareSubscriptionLike } from "@/lib/plan-subscriptions";

/**
 * The Square calls plan billing makes against WORKBENCH'S OWN Square account
 * (lib/plan-billing.ts) — Subscriptions, Invoices and the Catalog. Every
 * call carries the platform's own access token (SQUARE_BILLING_ACCESS_TOKEN),
 * never a seller's. Same transport as the seller-side client (lib/square.ts
 * squareFetch), so the API version, error shape and timeouts match.
 *
 * References: developer.squareup.com/reference/square/subscriptions-api,
 * …/catalog-api, …/invoices-api.
 */

export interface SquareSubscription extends SquareSubscriptionLike {
  location_id?: string;
  invoice_ids?: string[];
  timezone?: string;
  source?: { name?: string };
  actions?: { id: string; type: string; effective_date?: string; new_plan_variation_id?: string }[];
  phases?: { uid?: string; ordinal?: number; plan_phase_uid?: string }[];
  created_at?: string;
  version?: number;
}

export async function createSquareSubscription(params: {
  token: string;
  idempotencyKey: string;
  locationId: string;
  planVariationId: string;
  customerId: string;
  cardId: string;
  /** IANA zone the billing day is reckoned in (the company's). */
  timezone?: string | null;
  source?: string;
}): Promise<SquareSubscription> {
  const r = await squareFetch<{ subscription: SquareSubscription }>("/v2/subscriptions", {
    auth: { bearer: params.token },
    body: {
      idempotency_key: squareIdempotencyKey(params.idempotencyKey),
      location_id: params.locationId,
      plan_variation_id: params.planVariationId,
      customer_id: params.customerId,
      card_id: params.cardId,
      ...(params.timezone ? { timezone: params.timezone } : {}),
      source: { name: params.source ?? "WorkBench" },
    },
    timeoutMs: 25_000,
  });
  return r.subscription;
}

export async function retrieveSquareSubscription(token: string, id: string): Promise<SquareSubscription> {
  const r = await squareFetch<{ subscription: SquareSubscription }>(
    `/v2/subscriptions/${encodeURIComponent(id)}?include=actions`,
    { auth: { bearer: token } }
  );
  return r.subscription;
}

/** Schedules the cancel for the end of the current billing period. */
export async function cancelSquareSubscription(token: string, id: string): Promise<SquareSubscription> {
  const r = await squareFetch<{ subscription: SquareSubscription }>(
    `/v2/subscriptions/${encodeURIComponent(id)}/cancel`,
    { auth: { bearer: token }, method: "POST", body: {} }
  );
  return r.subscription;
}

/** Calls off a scheduled cancel (clears canceled_date). */
export async function resumeSquareSubscription(token: string, id: string): Promise<SquareSubscription> {
  const r = await squareFetch<{ subscription: SquareSubscription }>(`/v2/subscriptions/${encodeURIComponent(id)}`, {
    auth: { bearer: token },
    method: "PUT",
    body: { subscription: {}, fields_to_clear: ["canceled_date"] },
  });
  return r.subscription;
}

/** Point the subscription at another card on file (same customer). */
export async function updateSquareSubscriptionCard(token: string, id: string, cardId: string): Promise<SquareSubscription> {
  const r = await squareFetch<{ subscription: SquareSubscription }>(`/v2/subscriptions/${encodeURIComponent(id)}`, {
    auth: { bearer: token },
    method: "PUT",
    body: { subscription: { card_id: cardId } },
  });
  return r.subscription;
}

/** Move the subscription to another plan variation; Square prorates the change. */
export async function swapSquareSubscriptionPlan(
  token: string,
  id: string,
  newPlanVariationId: string
): Promise<SquareSubscription> {
  const r = await squareFetch<{ subscription: SquareSubscription }>(
    `/v2/subscriptions/${encodeURIComponent(id)}/swap-plan`,
    { auth: { bearer: token }, method: "POST", body: { new_plan_variation_id: newPlanVariationId } }
  );
  return r.subscription;
}

export async function searchSquareSubscriptions(params: {
  token: string;
  customerIds?: string[];
  locationIds?: string[];
  cursor?: string;
}): Promise<{ subscriptions: SquareSubscription[]; cursor?: string }> {
  const r = await squareFetch<{ subscriptions?: SquareSubscription[]; cursor?: string }>("/v2/subscriptions/search", {
    auth: { bearer: params.token },
    body: {
      ...(params.cursor ? { cursor: params.cursor } : {}),
      query: {
        filter: {
          ...(params.customerIds?.length ? { customer_ids: params.customerIds } : {}),
          ...(params.locationIds?.length ? { location_ids: params.locationIds } : {}),
        },
      },
    },
  });
  return { subscriptions: r.subscriptions ?? [], cursor: r.cursor };
}

// ── Invoices (Square bills each subscription period through one) ──

export interface SquareInvoice {
  id: string;
  subscription_id?: string;
  status?: string; // DRAFT | UNPAID | SCHEDULED | PARTIALLY_PAID | PAID | PARTIALLY_REFUNDED | REFUNDED | CANCELED | FAILED | PAYMENT_PENDING
  payment_requests?: { total_completed_amount_money?: SquareMoney; due_date?: string }[];
  next_payment_amount_money?: SquareMoney;
  created_at?: string;
  updated_at?: string;
}

export async function retrieveSquareInvoice(token: string, id: string): Promise<SquareInvoice> {
  const r = await squareFetch<{ invoice: SquareInvoice }>(`/v2/invoices/${encodeURIComponent(id)}`, {
    auth: { bearer: token },
  });
  return r.invoice;
}

// ── Catalog (the plans themselves; scripts/square-billing-setup.ts) ──

export interface SquareCatalogObject {
  type: string;
  id: string;
  version?: number;
  is_deleted?: boolean;
  subscription_plan_data?: {
    name?: string;
    all_items?: boolean;
    subscription_plan_variations?: SquareCatalogObject[];
  };
  subscription_plan_variation_data?: {
    name?: string;
    subscription_plan_id?: string;
    phases?: {
      uid?: string;
      cadence?: string;
      ordinal?: number;
      pricing?: { type?: string; price_money?: SquareMoney };
    }[];
  };
}

export async function upsertSquareCatalogObject(
  token: string,
  idempotencyKey: string,
  object: SquareCatalogObject
): Promise<{ object: SquareCatalogObject; idMappings: { client_object_id: string; object_id: string }[] }> {
  const r = await squareFetch<{
    catalog_object: SquareCatalogObject;
    id_mappings?: { client_object_id: string; object_id: string }[];
  }>("/v2/catalog/object", {
    auth: { bearer: token },
    body: { idempotency_key: squareIdempotencyKey(idempotencyKey), object },
  });
  return { object: r.catalog_object, idMappings: r.id_mappings ?? [] };
}

export async function listSquareSubscriptionPlans(token: string): Promise<SquareCatalogObject[]> {
  const out: SquareCatalogObject[] = [];
  let cursor: string | undefined;
  do {
    const r = await squareFetch<{ objects?: SquareCatalogObject[]; cursor?: string }>("/v2/catalog/search", {
      auth: { bearer: token },
      body: { object_types: ["SUBSCRIPTION_PLAN"], include_related_objects: false, ...(cursor ? { cursor } : {}) },
    });
    out.push(...(r.objects ?? []));
    cursor = r.cursor;
  } while (cursor);
  return out;
}

export async function retrieveSquareCatalogObject(token: string, id: string): Promise<SquareCatalogObject> {
  const r = await squareFetch<{ object: SquareCatalogObject }>(`/v2/catalog/object/${encodeURIComponent(id)}`, {
    auth: { bearer: token },
  });
  return r.object;
}

// ── Customers of OUR account (who a Dashboard-made subscription belongs to) ──

export interface SquareBillingCustomer {
  id: string;
  reference_id?: string;
  email_address?: string;
  given_name?: string;
  family_name?: string;
  company_name?: string;
}

export async function retrieveSquareCustomer(token: string, customerId: string): Promise<SquareBillingCustomer> {
  const r = await squareFetch<{ customer: SquareBillingCustomer }>(`/v2/customers/${encodeURIComponent(customerId)}`, {
    auth: { bearer: token },
  });
  return r.customer;
}

/** Every customer of ours with exactly this email (Square keeps duplicates). */
export async function searchSquareCustomersByEmail(token: string, email: string): Promise<SquareBillingCustomer[]> {
  const r = await squareFetch<{ customers?: SquareBillingCustomer[] }>("/v2/customers/search", {
    auth: { bearer: token },
    body: { limit: 20, query: { filter: { email_address: { exact: email } } } },
  });
  return r.customers ?? [];
}
