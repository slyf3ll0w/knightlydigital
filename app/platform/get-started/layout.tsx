import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import ForceLightTheme from "@/components/ForceLightTheme";

// Onboarding is always light — never inherit the device's dark preference.
export default async function GetStartedLayout({ children }: { children: React.ReactNode }) {
  // Same trap as /app/register: the form picks attach mode ("open your
  // business on this login") off the client session, and a session whose
  // user was deleted from the superadmin console hides the name/email/
  // password fields the server will then demand. Clear the dead cookie
  // instead of rendering a form that can never submit.
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    const exists = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true },
    });
    if (!exists) redirect("/api/app/session-reset");
  }
  return (
    <>
      <ForceLightTheme />
      {/* Outside the AppShell (signed out): .ds switches on Lexend + the design tokens */}
      <div className="ds">{children}</div>
    </>
  );
}
