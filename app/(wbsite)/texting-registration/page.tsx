import type { Metadata } from "next";
import Link from "next/link";
import { AtSign, Building2, CheckCircle2, Clock4, FileText, ShieldCheck, Smartphone, User } from "lucide-react";
import WBCta from "@/components/wb/WBCta";
import { REGISTRATION_CHECKLIST } from "@/lib/business-line-shared";

export const metadata: Metadata = {
  title: "Registering for texting — WorkBench",
  description:
    "What a business needs before it registers its number for texting, why US carriers ask for it, and what happens after you submit. The same rules apply to every software product.",
};

/* Public companion to the in-app registration form (Settings → Phone &
   texting). The checklist itself comes from REGISTRATION_CHECKLIST so the two
   never drift; this page adds the why, the email how-to, and the timeline. The
   form, the rejection email and the "Full guide" link all point here. */

const ORANGE = "#F86A0A";
const BLUE = "#0B57D8";

const REJECTIONS: { reason: string; fix: string }[] = [
  {
    reason: "Legal name doesn't match the EIN",
    fix: "Copy it from your IRS letter (CP575 or 147C), including “LLC”, “Inc.” or “Corp.” — not the name on your truck.",
  },
  {
    reason: "Address doesn't match IRS records",
    fix: "Use the address on the same letter. If you've moved since, file IRS Form 8822-B first or register with the old address.",
  },
  {
    reason: "Personal, free or group email",
    fix: "Use a named person at your own domain: maria@yourcompany.com. Not Gmail, Outlook or Yahoo, and not info@, contact@ or sales@.",
  },
  {
    reason: "EIN not found",
    fix: "Nine digits, first two from the IRS prefix list. New EINs can take a few weeks to appear in the registry's copy of the IRS database.",
  },
  {
    reason: "Website doesn't load or doesn't mention the business",
    fix: "Leave it blank (it's optional) or give a site that loads and shows your business name.",
  },
];

export default function TextingRegistrationPage() {
  const business = REGISTRATION_CHECKLIST.PRIVATE_PROFIT;
  const sole = REGISTRATION_CHECKLIST.SOLE_PROPRIETOR;
  return (
    <>
      <section className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
          <p className="text-[12.5px] font-bold uppercase tracking-[0.14em]" style={{ color: ORANGE }}>
            Texting
          </p>
          <h1 className="mt-3 max-w-2xl text-4xl font-extrabold leading-[1.1] sm:text-5xl">
            What you&apos;ll need to turn on texting.
          </h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-gray-600">
            US carriers require every business that texts from software to register once, under its own legal name,
            before its messages are delivered. It is the same rule for every product — Jobber, Housecall Pro, and
            WorkBench included. Gather three things first and the form takes about ten minutes; the carriers then
            usually approve in one to three business days.
          </p>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-gray-600">
            Calls and voicemail on your number work from day one. Texting from it switches on by itself when the
            registration clears, and we tell you the moment it does.
          </p>
        </div>
      </section>

      <section className="bg-[#F5F7FA]">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
          <h2 className="text-2xl font-extrabold sm:text-3xl">Pick your lane</h2>
          <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-gray-600">
            The registry treats a business with a tax ID and a one-person operation differently. Choose the one that
            describes you; the form asks the same question.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <Lane
              icon={<Building2 className="h-5 w-5" style={{ color: BLUE }} strokeWidth={2} />}
              iconBg="bg-blue-50"
              title="Registered business (has an EIN)"
              sub="LLC, corporation or partnership. Verified against IRS records — instantly when everything matches."
              items={business}
            />
            <Lane
              icon={<User className="h-5 w-5" style={{ color: ORANGE }} strokeWidth={2} />}
              iconBg="bg-orange-50"
              title="Sole proprietor (no EIN)"
              sub="The fast lane. You register as a person and verify with a PIN texted to your phone, usually within minutes."
              items={sole}
            />
          </div>
        </div>
      </section>

      <section className="border-y border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
          <h2 className="text-2xl font-extrabold sm:text-3xl">Why the rules are this strict</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <Why
              icon={<ShieldCheck className="h-5 w-5" style={{ color: BLUE }} strokeWidth={2} />}
              title="It's how carriers stop spam"
              body="Since 2023, AT&T, T-Mobile and Verizon only deliver software-sent texts from a number tied to a verified business. Registered numbers get through; unregistered ones are filtered or blocked."
            />
            <Why
              icon={<FileText className="h-5 w-5" style={{ color: BLUE }} strokeWidth={2} />}
              title="The EIN is matched letter for letter"
              body="The registry compares your legal name and address to the IRS record for that EIN. It doesn't know your DBA or that you moved — so the IRS letter, not memory, is the source."
            />
            <Why
              icon={<AtSign className="h-5 w-5" style={{ color: BLUE }} strokeWidth={2} />}
              title="A real person, at the real business"
              body="Carriers want someone they can reach if a complaint comes in. A Gmail address or a shared info@ box doesn't prove anyone works there, so both are refused automatically."
            />
          </div>
        </div>
      </section>

      <section id="email" className="bg-[#F5F7FA]">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
          <h2 className="text-2xl font-extrabold sm:text-3xl">No company email yet? Three ways, ten minutes.</h2>
          <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-gray-600">
            The address has to be at your own domain and named for a person — <strong>maria@yourcompany.com</strong>, not
            info@. It can forward to the inbox you already read; nobody expects you to check a second one.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <Step
              n="1"
              title="Forward from your web domain (free)"
              body="If you own a domain for your website, your registrar — GoDaddy, Squarespace, Namecheap, Wix, IONOS — almost always includes email forwarding. Look for “Email forwarding” or “Forwarding” in the domain settings, create your-name@yourdomain.com, and point it at your current inbox."
            />
            <Step
              n="2"
              title="Cloudflare Email Routing (free)"
              body="If your domain's DNS is on Cloudflare, Email → Email Routing sets up a forwarding address in a few clicks. Sending from it isn't required for the registration; receiving is what matters."
            />
            <Step
              n="3"
              title="Google Workspace or Microsoft 365 (about $7 a month)"
              body="A real mailbox at your domain, with calendar and storage. Worth it once you have staff. If you have no domain at all, buy one first — around $12 a year — and use option 1 or 2 with it."
            />
          </div>
          <p className="mt-6 max-w-2xl text-[14px] leading-relaxed text-gray-600">
            Give the new address a few minutes to start receiving before you file, then send yourself a test.
          </p>
        </div>
      </section>

      <section className="border-y border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
          <h2 className="text-2xl font-extrabold sm:text-3xl">What happens after you submit</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-4">
            <Timeline
              icon={<CheckCircle2 className="h-5 w-5" style={{ color: BLUE }} strokeWidth={2} />}
              when="Right away"
              title="Your business is verified"
              body="An EIN that matches IRS records verifies on the spot. A sole proprietor gets a PIN by text and enters it in WorkBench."
            />
            <Timeline
              icon={<Clock4 className="h-5 w-5" style={{ color: BLUE }} strokeWidth={2} />}
              when="1–3 business days"
              title="Carriers review the application"
              body="The registry sends your registration to the carriers. This part can't be rushed by anyone, whichever software you use. Occasionally it takes up to seven."
            />
            <Timeline
              icon={<Smartphone className="h-5 w-5" style={{ color: BLUE }} strokeWidth={2} />}
              when="The moment it clears"
              title="You're told, and texting turns on"
              body="Owners get a notification and an email. Reminders, quote and invoice links and replies start going out from your number, in your name."
            />
            <Timeline
              icon={<FileText className="h-5 w-5" style={{ color: ORANGE }} strokeWidth={2} />}
              when="If something's off"
              title="You're told exactly what"
              body="A notification and an email carry the registry's own reason and a Fix and resubmit button. Corrected details are re-filed right away — no waiting on us."
            />
          </ol>
        </div>
      </section>

      <section className="bg-[#F5F7FA]">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
          <h2 className="text-2xl font-extrabold sm:text-3xl">If it comes back: the five usual reasons</h2>
          <div className="mt-8 overflow-hidden rounded-md border border-gray-200 bg-white">
            <table className="w-full text-left text-[14px]">
              <thead className="bg-gray-50 text-[12.5px] font-bold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3">The registry says</th>
                  <th className="px-5 py-3">The fix</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {REJECTIONS.map((r) => (
                  <tr key={r.reason} className="align-top">
                    <td className="px-5 py-4 font-bold text-gray-900">{r.reason}</td>
                    <td className="px-5 py-4 leading-relaxed text-gray-600">{r.fix}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-6 max-w-2xl text-[14px] leading-relaxed text-gray-600">
            Stuck on any of them?{" "}
            <Link href="/contact" className="font-bold underline" style={{ color: BLUE }}>
              Call or email us
            </Link>{" "}
            and we&apos;ll go through the form with you.
          </p>
        </div>
      </section>

      <WBCta
        title="Ready to register?"
        body="Open Settings → Phone & texting in WorkBench with your IRS letter and a work email handy. Ten minutes, once."
        secondary={{ label: "Talk to a person first", href: "/contact" }}
      />
    </>
  );
}

function Lane({
  icon,
  iconBg,
  title,
  sub,
  items,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  sub: string;
  items: { title: string; detail: string; why: string }[];
}) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-7">
      <div className={`flex h-11 w-11 items-center justify-center rounded-md ${iconBg}`}>{icon}</div>
      <h3 className="mt-5 text-xl font-extrabold text-gray-900">{title}</h3>
      <p className="mt-2 text-[14px] leading-relaxed text-gray-600">{sub}</p>
      <ol className="mt-6 space-y-4">
        {items.map((it, i) => (
          <li key={it.title} className="flex gap-3">
            <span
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
              style={{ background: BLUE }}
            >
              {i + 1}
            </span>
            <div>
              <p className="text-[15px] font-bold text-gray-900">{it.title}</p>
              <p className="mt-0.5 text-[14px] leading-relaxed text-gray-600">{it.detail}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-gray-500">
                <span className="font-bold text-gray-600">Why:</span> {it.why}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Why({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-7">
      <div className="flex h-11 w-11 items-center justify-center rounded-md bg-blue-50">{icon}</div>
      <h3 className="mt-5 text-[17px] font-extrabold text-gray-900">{title}</h3>
      <p className="mt-2 text-[14px] leading-relaxed text-gray-600">{body}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-7">
      <span
        className="flex h-9 w-9 items-center justify-center rounded-md text-[15px] font-extrabold text-white"
        style={{ background: ORANGE }}
      >
        {n}
      </span>
      <h3 className="mt-5 text-[17px] font-extrabold text-gray-900">{title}</h3>
      <p className="mt-2 text-[14px] leading-relaxed text-gray-600">{body}</p>
    </div>
  );
}

function Timeline({ icon, when, title, body }: { icon: React.ReactNode; when: string; title: string; body: string }) {
  return (
    <li className="rounded-md border border-gray-200 bg-white p-7">
      <div className="flex h-11 w-11 items-center justify-center rounded-md bg-gray-50">{icon}</div>
      <p className="mt-5 text-[12.5px] font-bold uppercase tracking-wide text-gray-500">{when}</p>
      <h3 className="mt-1 text-[17px] font-extrabold text-gray-900">{title}</h3>
      <p className="mt-2 text-[14px] leading-relaxed text-gray-600">{body}</p>
    </li>
  );
}
