import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /** Login identity — one per email; owns 1+ company memberships (User rows). */
      accountId: string | null;
      role: string;
      companyId: string | null;
      companyName: string | null;
    } & DefaultSession["user"];
  }
  interface User {
    accountId?: string | null;
    role?: string;
    companyId?: string | null;
    companyName?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    accountId?: string | null;
    role?: string;
    companyId?: string | null;
    companyName?: string | null;
  }
}
