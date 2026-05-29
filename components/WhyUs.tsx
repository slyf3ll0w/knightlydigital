const stats = [
  { value: "21+", label: "Cities Served Across DFW" },
  { value: "3", label: "Core Digital Services" },
  { value: "100%", label: "Texas-Based Team" },
  { value: "0", label: "Cookie-Cutter Solutions" },
];

const reasons = [
  {
    title: "DFW-First Mindset",
    body: "We're not a national agency farming out your account. We're based in Allen and every strategy we build is informed by the local DFW market.",
  },
  {
    title: "Ownership, Not Delegation",
    body: "Your account gets a dedicated point of contact — someone who knows your business, answers your calls, and takes responsibility for results.",
  },
  {
    title: "Built to Scale With You",
    body: "Whether you're a startup in McKinney or an established brand in Fort Worth, our services grow alongside your business without rebuilding from scratch.",
  },
  {
    title: "Transparent Reporting",
    body: "You always know exactly what's happening with your campaigns and software. Plain-English reports, no vanity metrics, no spin.",
  },
];

export function WhyUs() {
  return (
    <section className="bg-primary text-primary-foreground">
      {/* Stats bar */}
      <div className="border-b border-primary-foreground/10">
        <div className="max-w-7xl mx-auto px-5 grid grid-cols-2 lg:grid-cols-4 divide-x divide-primary-foreground/10">
          {stats.map((s) => (
            <div key={s.label} className="py-10 px-8 text-center">
              <p className="text-5xl font-black tracking-tight text-accent mb-2">{s.value}</p>
              <p className="text-xs tracking-wider uppercase text-primary-foreground/60">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Why section */}
      <div className="max-w-7xl mx-auto px-5 py-20">
        <div className="grid lg:grid-cols-2 gap-16 items-start">
          <div>
            <p className="text-xs tracking-[0.25em] font-bold uppercase text-accent/70 mb-4">
              Why Knightly Digital
            </p>
            <h2 className="text-4xl lg:text-5xl font-black uppercase leading-tight">
              No Agencies.<br />
              <span className="text-primary-foreground/50">No Middlemen.</span><br />
              Just Results.
            </h2>
            <div className="mt-8 h-1 w-16 bg-accent" />
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            {reasons.map((r) => (
              <div key={r.title} className="border-l-2 border-accent/40 pl-5">
                <h3 className="font-bold text-base uppercase tracking-wide mb-2">{r.title}</h3>
                <p className="text-sm text-primary-foreground/65 leading-relaxed">{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
