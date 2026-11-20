import { AnimateIn } from "@/components/AnimateIn";
import WBVsImport from "./WBVsImport";

/**
 * "Switch in an afternoon" — the three steps of moving over from another
 * platform beside a coded client-list import. Shared by /vs/* and
 * /alternatives/*; the steps say only what the import really does
 * (spreadsheet in; the price book is rebuilt by hand or with Atlas).
 */
export default function WBVsSwitch({ from, bg = "bg-[#F5F7FA]" }: { from: string; bg?: string }) {
  const steps = [
    {
      title: "Open the account",
      body: "The sign-up takes a few minutes and the account opens today. Connect Square when you are ready to take payments; everything else works before that.",
    },
    {
      title: "Bring the clients",
      body: `Export your client list from ${from} as a spreadsheet and import it. Rebuild the price book by hand, or tell Atlas what you charge.`,
    },
    {
      title: "Start the next job here",
      body: `Finish open invoices in ${from}; they stay there as records. New quotes, jobs and invoices start in WorkBench.`,
    },
  ];
  return (
    <section className={bg}>
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 sm:px-8 sm:py-28 lg:grid-cols-[1fr_440px]">
        <div>
          <AnimateIn>
            <h2 className="text-[2.2rem] leading-[1.05] sm:text-[3.2rem]">
              Switch in <span className="text-[#F86A0A]">an afternoon.</span>
            </h2>
          </AnimateIn>
          <AnimateIn className="wb-stagger mt-10 grid gap-7">
            {steps.map((s, i) => (
              <div key={s.title} className="flex gap-5">
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-[#0A1428] text-[17px] font-black text-[#FF8B33]">{i + 1}</span>
                <div>
                  <h3 className="text-[18px] font-black text-[#0A1428]">{s.title}</h3>
                  <p className="mt-1 max-w-lg text-[16.5px] leading-relaxed text-gray-600">{s.body}</p>
                </div>
              </div>
            ))}
          </AnimateIn>
        </div>
        <AnimateIn delay={120}>
          <WBVsImport from={from} />
        </AnimateIn>
      </div>
    </section>
  );
}
