/**
 * The savings estimate (lib/wb-savings.ts): fee math, cheapest-plan
 * selection, WorkBench's own costs from lib/plans, the worked examples, and
 * the freshness of the competitor list prices — they must have been
 * re-read from the vendors' pricing pages within the last year.
 *   npx tsx scripts/test-wb-savings.ts
 */
import { EXTRA_SEAT_CENTS, INCLUDED_SEATS, PLANS, PROCESSING_RATES } from "../lib/plans";
import { BENCHMARK, COMPETITORS, EXAMPLE_SHOPS, SAVINGS_AS_OF, cheapestPlan, daysSince, estimate, processingCents, workbenchSoftware } from "../lib/wb-savings";

let failed = 0;
function check(ok: boolean, msg: string) {
  if (!ok) {
    failed++;
    console.error(`✗ ${msg}`);
  }
}

// Freshness: competitor prices are read by hand, so they must carry a recent date.
check(/^\d{4}-\d{2}-\d{2}$/.test(SAVINGS_AS_OF), "SAVINGS_AS_OF must be YYYY-MM-DD");
const age = daysSince(SAVINGS_AS_OF);
check(age >= 0 && age <= 365, `competitor prices in lib/wb-savings.ts were read ${age} days ago — re-check the vendors' pricing pages and update SAVINGS_AS_OF`);

// Fee math: 2.9% + 30¢ on $10,000 in $100 payments = $290 + 100 × $0.30 = $320.
check(processingCents(1_000_000, 10_000, 290, 30) === 32_000, "processingCents: $10k at 2.9% + 30¢ in $100 tickets should be $320");
check(processingCents(0, 10_000, 290, 30) === 0, "processingCents: no volume, no fee");
check(processingCents(1_000_000, 0, 290, 30) === 29_000, "processingCents: no ticket size → percentage only");

// WorkBench's own costs come from lib/plans.
check(workbenchSoftware(INCLUDED_SEATS).cents === 0, "included seats are free");
check(workbenchSoftware(INCLUDED_SEATS + 1).cents === EXTRA_SEAT_CENTS, "one extra seat costs EXTRA_SEAT_CENTS");
const proBreakEven = Math.ceil(PLANS.SHOP.monthlyCents / EXTRA_SEAT_CENTS) + INCLUDED_SEATS;
check(workbenchSoftware(proBreakEven).cents <= PLANS.SHOP.monthlyCents, "software cost never exceeds the Pro price");
check(workbenchSoftware(proBreakEven + 5).label.startsWith(PLANS.SHOP.name), "a big team is priced at Pro");

// Cheapest published plan that covers the team.
for (const c of COMPETITORS) {
  check(c.plans.length > 0 && c.sourceUrl.startsWith("https://"), `${c.name}: plans + source url`);
  for (const p of c.plans) check(p.monthlyCents > 0 && p.usersIncluded > 0, `${c.name} ${p.name}: positive price and seats`);
  const one = cheapestPlan(c, 1);
  const five = cheapestPlan(c, 5);
  const twenty = cheapestPlan(c, 20);
  check(one.monthlyCents <= five.monthlyCents && five.monthlyCents <= twenty.monthlyCents, `${c.name}: cost never falls as the team grows`);
  check(one.monthlyCents === Math.min(...c.plans.filter((p) => p.usersIncluded >= 1).map((p) => p.monthlyCents)), `${c.name}: one person gets the cheapest plan`);
}
const jobber = COMPETITORS.find((c) => c.id === "jobber")!;
check(cheapestPlan(jobber, 2).label.includes("extra"), "Jobber for 2 people: Connect + 1 extra seat (Core is one user only)");

// The estimate itself.
const e = estimate({ users: 3, monthlyVolumeCents: 20_000_00, avgTicketCents: 350_00, model: "company" });
const wbRate = PROCESSING_RATES.companyPaid;
check(e.workbench.processingCents === processingCents(20_000_00, 350_00, wbRate.cardBps, wbRate.cardFixedCents), "WorkBench processing uses the company-paid rate from lib/plans");
check(e.benchmarkProcessingCents === processingCents(20_000_00, 350_00, BENCHMARK.cardBps, BENCHMARK.cardFixedCents), "benchmark processing uses BENCHMARK");
check(e.workbench.softwareCents === EXTRA_SEAT_CENTS, "3 people on Core = 1 extra seat");
for (const c of e.competitors) {
  check(c.totalCents === c.softwareCents + c.processingCents, `${c.name}: total adds up`);
  check(c.savingsYearCents === (c.totalCents - e.workbench.totalCents) * 12, `${c.name}: yearly savings = monthly gap × 12`);
  check(c.savingsYearCents > 0, `${c.name}: a 3-person shop keeps money on WorkBench`);
}
const client = estimate({ users: 3, monthlyVolumeCents: 20_000_00, avgTicketCents: 350_00, model: "client" });
check(client.workbench.processingCents === 0, "client-pays model: WorkBench processing is $0 to the business");
check(client.competitors[0].savingsYearCents > e.competitors[0].savingsYearCents, "client-pays model keeps more");

// Worked examples never show a negative number.
for (const s of EXAMPLE_SHOPS) {
  const ex = estimate({ ...s, model: "company" });
  for (const c of ex.competitors) check(c.savingsYearCents > 0, `example "${s.label}" vs ${c.name} should be positive`);
}

if (failed) {
  console.error(`\n${failed} savings check(s) failed`);
  process.exit(1);
}
console.log(`✓ savings estimate: fee math, plan selection, ${COMPETITORS.length} competitors priced as of ${SAVINGS_AS_OF} (${age} days ago), ${EXAMPLE_SHOPS.length} examples positive`);
