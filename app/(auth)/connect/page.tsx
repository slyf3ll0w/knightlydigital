import { redirect } from "next/navigation";
import Link from "next/link";
import { CircleAlert, Link2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { loginUrlReturningTo } from "@/lib/login-return";
import { connectBlock, redirectAllowed, resolveClient } from "@/lib/connector/oauth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connect an app · WorkBench", robots: { index: false } };

/**
 * "Allow this app to use your WorkBench account?" — where an AI app (Claude,
 * ChatGPT) sends a person to connect (docs/plans/workbench-connector-2026-11-17.md).
 * This is the connector's OAuth authorization endpoint.
 *
 * Outside /app on purpose: the phone apps claim /app/* links, and this page
 * has to open in the browser the AI app started from.
 *
 * Order matters. The app and the address it will send the person back to
 * are checked FIRST and a bad one stops here with a message — we never
 * redirect to an address we have not verified. Only then is the person asked
 * to sign in. The app's name is whatever it calls itself, so the page shows
 * the web address it returns to as well; that part cannot be faked.
 */
type Params = { response_type?: string; client_id?: string; redirect_uri?: string; code_challenge?: string; code_challenge_method?: string; state?: string; scope?: string; resource?: string };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="card-ledger w-full max-w-md p-8 shadow-sm">{children}</div>
    </div>
  );
}

function Problem({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <div className="text-center">
        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-amber-100">
          <CircleAlert className="text-amber-600" size={22} />
        </div>
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        <p className="mt-2 text-sm text-gray-600">{body}</p>
        <Link href="/app/dashboard" className="mt-6 inline-flex items-center justify-center rounded-[10px] bg-green-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-600">
          Open WorkBench
        </Link>
      </div>
    </Shell>
  );
}

export default async function ConnectPage({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const client = await resolveClient(p.client_id);
  if (!client || !p.redirect_uri || !redirectAllowed(client, p.redirect_uri)) {
    return <Problem title="This connection link isn't valid" body="The app that sent you here didn't identify itself properly. Nothing was connected. Start again from the app, and if it keeps happening, tell us which app it was." />;
  }
  if (p.response_type !== "code" || p.code_challenge_method !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(p.code_challenge ?? "")) {
    return <Problem title="This app can't connect yet" body="It didn't ask in the secure way WorkBench requires. Nothing was connected." />;
  }

  const actor = await getActor();
  if (!actor) {
    const qs = new URLSearchParams(Object.entries(p).filter((e): e is [string, string] => typeof e[1] === "string")).toString();
    redirect(loginUrlReturningTo(`/connect?${qs}`));
  }
  const member = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { role: true, isActive: true, companyId: true, company: { select: { name: true, suspendedAt: true, connectorsOff: true, salesSeePayments: true } } },
  });
  const block = connectBlock(member);
  if (block === "role") return <Problem title="Ask an owner or admin" body="Only owners and admins can connect an AI app to WorkBench for now." />;
  if (block === "off") return <Problem title="Connected apps are turned off" body="The owner of this WorkBench account has turned off connections to outside apps. They can turn it back on in Settings → Connected apps." />;
  if (block) return <Problem title="This account can't connect apps" body="Sign in to an active WorkBench account and try again." />;

  const returnsTo = new URL(p.redirect_uri).host;
  const company = member?.company?.name ?? "your company";
  return (
    <Shell>
      <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4 bg-green-100">
        <Link2 className="text-green-600" size={22} />
      </div>
      <h1 className="text-lg font-semibold text-gray-900">Let {client.name} use WorkBench?</h1>
      <p className="mt-1 text-sm text-gray-600">
        Signed in as <span className="font-medium text-gray-900">{actor.name}</span> at <span className="font-medium text-gray-900">{company}</span>. After you choose, you go back to <span className="font-medium text-gray-900">{returnsTo}</span>.
      </p>

      <div className="mt-5 space-y-4 text-sm text-gray-700">
        <div>
          <p className="font-medium text-gray-900">It will be able to</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Read what you can see in WorkBench: clients, schedule, quotes, invoices, payments and reports.</li>
            <li>Prepare work for you, like a quote, a job or an email to a client.</li>
          </ul>
        </div>
        <div>
          <p className="font-medium text-gray-900">It will not be able to</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Save, send, charge or delete anything. What it prepares waits in WorkBench until you approve it there.</li>
          </ul>
        </div>
        <p className="rounded-[10px] bg-amber-50 px-3 py-2 text-amber-900">
          What it reads leaves WorkBench and goes to the company that makes {client.name}, including your clients&apos; names and details. Only connect apps you trust.
        </p>
      </div>

      <form method="post" action="/api/oauth/authorize" className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
        <input type="hidden" name="client_id" value={client.clientId} />
        <input type="hidden" name="redirect_uri" value={p.redirect_uri} />
        <input type="hidden" name="code_challenge" value={p.code_challenge} />
        <input type="hidden" name="state" value={p.state ?? ""} />
        <button type="submit" name="decision" value="allow" className="btn-primary h-10 flex-1 justify-center">
          Allow
        </button>
        <button type="submit" name="decision" value="deny" className="btn-secondary h-10 flex-1 justify-center">
          Cancel
        </button>
      </form>
      <p className="mt-4 text-xs text-gray-500">You can disconnect it any time in Settings → Connected apps.</p>
    </Shell>
  );
}
