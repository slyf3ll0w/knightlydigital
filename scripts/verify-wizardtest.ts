/**
 * One-off: print the setup-wizard-applied state of a company by slug.
 * DATABASE_URL=<public proxy url> npx tsx scripts/verify-wizardtest.ts <slug>
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const slug = process.argv[2] ?? "berrett-pest-control";

async function main() {
  const c = await prisma.company.findUnique({
    where: { slug },
    select: {
      id: true, name: true, phone: true, address: true, city: true, state: true, zip: true,
      website: true, brandColor: true, logoUrl: true, logoMime: true, timezone: true,
      serviceZips: true, arrivalWindowMinutes: true, businessHours: true, setupWizardAt: true,
    },
  });
  if (!c) throw new Error("company not found");
  const logoBytes = await prisma.company.findUnique({ where: { slug }, select: { logoData: true } });
  const [services, contracts, fields, forms] = await Promise.all([
    prisma.workItem.count({ where: { companyId: c.id, type: "SERVICE", isActive: true } }),
    prisma.contractTemplate.count({ where: { companyId: c.id } }),
    prisma.contactFieldDef.count({ where: { companyId: c.id, isActive: true } }),
    prisma.webForm.findMany({ where: { companyId: c.id }, select: { type: true, config: true } }),
  ]);
  console.log(JSON.stringify({
    ...c,
    businessHours: c.businessHours ? "set" : null,
    logoDataBytes: logoBytes?.logoData?.length ?? 0,
    counts: { services, contracts, contactFields: fields },
    bookingForm: forms.map((f) => {
      const cfg = f.config as Record<string, unknown> | null;
      const services = Array.isArray(cfg?.services) ? cfg.services.length : 0;
      const custom = Array.isArray(cfg?.customFields) ? cfg.customFields.length : 0;
      const self = (cfg?.selfSchedule as Record<string, unknown> | undefined)?.enabled;
      return { type: f.type, services, customFields: custom, selfSchedule: self };
    }),
  }, null, 2));
}

main().finally(() => prisma.$disconnect());
