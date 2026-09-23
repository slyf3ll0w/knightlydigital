import type { DefaultSession } from "next-auth";

/** How a session was minted — "password" for pre-upgrade sessions. */
export type SignInMethod = "password" | "google" | "apple";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /** Login identity — one per email; owns 1+ company memberships (User rows). */
      accountId: string | null;
      role: string;
      companyId: string | null;
      companyName: string | null;
      /** ms epoch the session was minted; 0 for pre-upgrade sessions. */
      authAt: number;
      /** How this session was minted — "password" for pre-upgrade sessions. */
      signInMethod: SignInMethod;
    } & DefaultSession["user"];
  }
  interface User {
    accountId?: string | null;
    role?: string;
    companyId?: string | null;
    companyName?: string | null;
    authAt?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    accountId?: string | null;
    role?: string;
    companyId?: string | null;
    companyName?: string | null;
    authAt?: number;
    signInMethod?: SignInMethod;
  }
}
