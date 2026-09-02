// Helper for the embed/payment verification: create (or clean up) a paid
// SERVICE booking type on the e2e harness company (Finix sandbox-approved).
//   npx tsx e2e/paid-type.mts create        → prints JSON { typeId, typeSlug, workItemId, companySlug }
//   npx tsx e2e/paid-type.mts cleanup <typeId> <workItemId>
import { readState } from "./env";
import { Api, runTag } from "./helpers/api";

const state = readState();
const api = Api.forOwnerA(state);
const [mode, typeId, workItemId] = process.argv.slice(2);

if (mode === "create") {
  await api.patch(`/api/app/team/${state.ownerA.userId}`, { bookable: true });
  const wi = await api.post("/api/app/work-items", {
    name: `${runTag} Paid Service`,
    type: "SERVICE",
    unitPrice: 100,
    priceDisplay: "FIXED",
    durationMinutes: 60,
  });
  const t = await api.post("/api/app/booking-types", { name: `${runTag} Paid Service`, kind: "SERVICE" });
  await api.patch(`/api/app/booking-types/${t.id}`, { services: [wi.id], paymentMode: "FULL", leadHours: 0, horizonDays: 14 });
  console.log(JSON.stringify({ typeId: t.id, typeSlug: t.slug, workItemId: wi.id, companySlug: state.companyASlug, baseUrl: state.baseUrl }));
} else if (mode === "cleanup") {
  if (typeId) await api.raw("DELETE", `/api/app/booking-types/${typeId}`);
  if (workItemId) await api.raw("DELETE", `/api/app/work-items/${workItemId}`);
  await api.raw("PATCH", `/api/app/team/${state.ownerA.userId}`, { bookable: false });
  console.log("cleaned");
} else {
  console.error("usage: create | cleanup <typeId> <workItemId>");
  process.exit(1);
}
