import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import ForceLightTheme from "@/components/ForceLightTheme";

// Onboarding is always light — never inherit the device's dark preference.
export default async function RegisterLayout({ children }: { children: React.ReactNode }) {
  // The page picks attach mode ("add another company") off the client
  // session. When that session's user was deleted from the superadmin
  // console, attach mode hides the name/email/password fields the server
  // will then demand — clear the dead cookie instead of rendering a form
  // that can never submit.
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
      {children}
    </>
  );
}
