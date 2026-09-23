import { headers } from "next/headers";
import LoginForm from "./LoginForm";
import { socialSignInFor } from "@/lib/sign-in-options";

/**
 * Server half of the login page: decides which sign-in methods this visitor
 * gets (env + user agent, lib/sign-in-options.ts) and hands the answer to
 * the client form as one prop — same pattern as /apply and /invite. Google
 * and Apple each take one of two routes: the OAuth redirect on the web, or
 * the native sheet in the apps.
 */
export default async function AppLoginPage() {
  const ua = (await headers()).get("user-agent");
  return <LoginForm social={socialSignInFor(ua)} />;
}
