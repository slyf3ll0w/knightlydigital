const stats = [
  { value: "DFW", label: "Home Market — Dallas-Fort Worth" },
  { value: "A+", label: "Client Retention Record" },
  { value: "100%", label: "Dedicated Account Management" },
  { value: "0", label: "Cookie-Cutter Strategies" },
];

const reasons = [
  {
    title: "Strategy Before Execution",
    body: "Every engagement starts with understanding your market, your customers, and where the actual opportunity is — not just plugging you into a template.",
  },
  {
    title: "Dedicated Account Ownership",
    body: "Your account has one owner on our end — someone who knows your business, answers your calls, and is accountable for results month over month.",
  },
  {
    title: "Built to Scale With You",
    body: "Whether you're a regional operator or a growth-stage company, our services are structured to expand as your ambitions do — no starting over.",
  },
  {
    title: "Radical Transparency",
    body: "You always know exactly what's happening. Plain-English reporting, direct access to your team, and zero tolerance for vanity metrics.",
  },
];

export function WhyUs() {
  return (
    <section className="bg-primary text-primary-foreground">
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

      <div className="max-w-7xl mx-auto px-5 py-20">
        <div className="grid lg:grid-cols-2 gap-16 items-start">
          <div>
            <p className="text-xs tracking-[0.25em] font-bold uppercase text-accent/70 mb-4">
              Why Streamflare
            </p>
            <h2 className="text-4xl lg:text-5xl font-black uppercase leading-tight">
              Precision.<br />
              <span className="text-primary-foreground/50">Accountability.</span><br />
              Results.
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
