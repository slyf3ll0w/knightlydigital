import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { brandHeader, brandAccent, shade, textOn } from "@/lib/branding";
import { companyMeta } from "@/lib/client-meta";
import ForceLightTheme from "@/components/ForceLightTheme";
import ViewBeacon from "@/components/ViewBeacon";
import ReplyBox from "./ReplyBox";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const message = await prisma.clientMessage.findUnique({
    where: { publicToken: token },
    select: { subject: true, company: { select: { name: true, logoUrl: true } } },
  });
  return companyMeta(message?.company, message?.subject);
}

/**
 * Public message page — where a one-off client email's body actually lives
 * (the email itself only carries the subject + a Read Message button, so this
 * page's view beacon is the open signal). Same branded-header treatment as
 * the hub/quote pages.
 */
export default async function PublicMessagePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Explicit select — serialized into public HTML, client-facing fields ONLY
  const message = await prisma.clientMessage.findUnique({
    where: { publicToken: token },
    select: {
      subject: true,
      body: true,
      createdAt: true,
      contact: { select: { firstName: true } },
      company: {
        select: {
          name: true,
          email: true,
          phone: true,
          logoUrl: true,
          brandColor: true,
          documentColor: true,
          brandColorSecondary: true,
        },
      },
    },
  });
  if (!message) notFound();

  const headerBg = brandHeader(message.company);
  const headerText = textOn(headerBg);
  const accent = brandAccent(message.company);
  const sentDate = message.createdAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="app-ui min-h-screen bg-paper">
      {/* Client-facing: always light, never the operator's dark theme */}
      <ForceLightTheme />
      <ViewBeacon kind="message" token={token} />

      <header
        className="relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${headerBg} 0%, ${shade(headerBg, 0.3)} 100%)`,
        }}
      >
        <div className="relative max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            {message.company.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={message.company.logoUrl}
                alt={`${message.company.name} logo`}
                className="h-12 w-auto max-w-[180px] rounded-md bg-white object-contain p-1 shrink-0"
              />
            ) : null}
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: headerText }}>
                {message.company.name}
              </p>
              <p className="text-xs" style={{ color: headerText, opacity: 0.65 }}>
                Message · {sentDate}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="card-ledger overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <h1 className="text-xl font-bold text-gray-900">{message.subject}</h1>
            <p className="text-xs text-gray-500 mt-1">
              To {message.contact.firstName} · from {message.company.name}
            </p>
          </div>
          <div className="px-6 py-5">
            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
              {message.body}
            </p>
          </div>
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
            <ReplyBox
              email={message.company.email}
              phone={message.company.phone}
              subject={message.subject}
              companyName={message.company.name}
              accent={accent}
              accentText={textOn(accent)}
            />
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Sent by {message.company.name} · Powered by WorkBench
        </p>
      </main>
    </div>
  );
}
