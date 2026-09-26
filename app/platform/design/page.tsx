import { CalendarDays, CheckCircle2, ChevronRight, CreditCard, MapPin, Plus, Send } from "lucide-react";
import { requirePageActor } from "@/lib/permissions";
import { ActionLink, Button, Card, Chip, DsPage, Hint, InfoTip, ListRow, PageHeader, SectionTitle, Stat } from "@/components/ds";

/**
 * /app/design — the design-system gallery: every piece of the kit, in THIS
 * company's two brand colors, light or dark with the app. Unlisted (not in
 * the nav); the reference for building or restyling any page. Rules:
 * docs/design-system.md.
 */
export const metadata = { title: "Design system — WorkBench" };

function Swatch({ name, varName, note }: { name: string; varName: string; note: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-11 w-11 shrink-0 rounded-xl" style={{ background: `var(${varName})`, boxShadow: "var(--ds-shadow-1)" }} />
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold">{name}</span>
        <span className="ds-small block">{note}</span>
      </span>
    </div>
  );
}

export default async function DesignSystemPage() {
  await requirePageActor();
  return (
    <DsPage>
      <PageHeader
        eyebrow="WorkBench design system"
        title="One look for the whole app"
        info="Every piece here follows your company's two brand colors (Settings → Branding). Primary drives the app; secondary is the occasional highlight. Green, amber and red always mean good, heads-up and problem."
        actions={
          <>
            <Button variant="outline" icon={CalendarDays}>Secondary action</Button>
            <Button icon={Plus}>Primary action</Button>
          </>
        }
      />

      <div className="mt-10 grid gap-10">
        <section>
          <SectionTitle info="Pages never use a raw color. These tokens come from your brand colors and are adjusted just enough to stay readable in light and dark mode.">
            Color
          </SectionTitle>
          <Card className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <Swatch name="Primary" varName="--ds-primary" note="Buttons, active, links, hero" />
            <Swatch name="Secondary" varName="--ds-secondary" note="Sparing highlights" />
            <Swatch name="Good" varName="--ds-good" note="Paid, done, on the clock" />
            <Swatch name="Problem" varName="--ds-bad" note="Past due, failed" />
          </Card>
        </section>

        <section>
          <SectionTitle info="Lexend everywhere. Amounts stacked in a column use tabular figures so they line up.">Type</SectionTitle>
          <Card className="grid gap-3 p-6">
            <p className="ds-eyebrow">Eyebrow · Thursday, September 25</p>
            <p className="ds-title">Page title</p>
            <p className="ds-h2">Section title</p>
            <p className="ds-value">$12,480.00</p>
            <p className="ds-body">Body text for anything longer than a label. Short, plain, and specific.</p>
            <p className="ds-small">Small context line: 3 clients owe you</p>
            <p className="ds-num text-[14px]">$1,240.00 · $89.89 · $11,111.11 (column figures)</p>
          </Card>
        </section>

        <section>
          <SectionTitle>Buttons and tags</SectionTitle>
          <Card className="flex flex-wrap items-center gap-3 p-5">
            <Button icon={Send}>Send invoice</Button>
            <Button variant="soft">Soft</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button size="sm">Small</Button>
            <span className="mx-2 h-6 w-px bg-[color:var(--ds-line)]" />
            <Chip tone="primary">Scheduled</Chip>
            <Chip tone="secondary">Appointment</Chip>
            <Chip tone="good" icon={CheckCircle2}>Paid</Chip>
            <Chip tone="warn">Awaiting payment</Chip>
            <Chip tone="bad">Overdue</Chip>
            <Chip>Draft</Chip>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <Stat label="Collected" info="Explanations go in the (i), never as a line of subtext." value="$12,480.00" foot="this month" />
          <Stat label="Outstanding" tone="bad" value="$1,915.00" foot="3 clients owe you" />
          <div className="ds-hero p-5">
            <span className="ds-hero-pill">Up next</span>
            <p className="mt-4 text-[34px] font-semibold leading-none tracking-[-0.03em]">10:30a</p>
            <p className="mt-3 text-[17px] font-semibold">AC tune-up</p>
            <p className="mt-0.5 text-[13.5px] opacity-80">Maria Lopez · 412 Oak Hollow Ln</p>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div>
            <SectionTitle action={<ActionLink href="/app/schedule">Open schedule</ActionLink>}>List rows</SectionTitle>
            <Card className="ds-divide overflow-hidden">
              <ListRow
                href="#"
                lead={<span className="ds-count ds-count-bad">2</span>}
                title="Past-due invoices"
                sub="Send a reminder"
                trail={<span className="flex items-center gap-2"><Chip tone="bad">Overdue</Chip><ChevronRight size={16} className="text-[color:var(--ds-faint)]" /></span>}
              />
              <ListRow href="#" lead={<span className="ds-count">4</span>} title="New requests" sub="Review & send a quote" trail={<ChevronRight size={16} className="text-[color:var(--ds-faint)]" />} />
              <ListRow
                lead={<span className="ds-disc"><MapPin size={16} /></span>}
                title="Water heater install"
                sub="Peter Jones · 1:00p"
                trail={<span className="ds-num text-[13.5px] font-semibold">$1,850.00</span>}
              />
            </Card>
          </div>
          <div>
            <SectionTitle>Empty state</SectionTitle>
            <Card>
              <Hint title="No invoices yet." action={{ href: "#", label: "Create an invoice", icon: CreditCard }} />
            </Card>
          </div>
        </section>

        <section>
          <SectionTitle>Info bubble</SectionTitle>
          <Card className="flex items-center gap-2 p-5">
            <span className="text-[14.5px] font-medium">Hover it on a computer, tap it on a phone</span>
            <InfoTip>Any explanation a page needs lives here: what a number means, how a setting behaves, why something is locked.</InfoTip>
          </Card>
        </section>
      </div>
    </DsPage>
  );
}
