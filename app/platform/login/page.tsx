import { headers } from "next/headers";
import LoginForm from "./LoginForm";
import { googleSignInAvailableFor } from "@/lib/sign-in-options";

/**
 * Server half of the login page: decides which sign-in methods this visitor
 * gets (env + user agent, lib/sign-in-options.ts) and hands the answer to
 * the client form as a prop — same pattern as /apply and /invite. Google is
 * a web-only redirect for now: hidden inside the native shell (its webview
 * can't run it) and until the env is configured.
 */
export default async function AppLoginPage() {
  const ua = (await headers()).get("user-agent");
  return <LoginForm googleEnabled={googleSignInAvailableFor(ua)} />;
}
