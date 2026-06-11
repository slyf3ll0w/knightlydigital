import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import AppShell from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  // No session: render without AppShell (login/register pages render standalone)
  // Middleware + individual pages handle auth redirects for protected routes.
  if (!session) return <>{children}</>;

  return (
    <AppShell
      userName={session.user.name}
      userEmail={session.user.email}
      companyName={session.user.companyName}
    >
      {children}
    </AppShell>
  );
}
