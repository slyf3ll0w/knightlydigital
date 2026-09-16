import { headers } from "next/headers";
import LoginForm from "./LoginForm";
import { googleNativeClientIdFor, googleSignInAvailableFor } from "@/lib/sign-in-options";

/**
 * Server half of the login page: decides which sign-in methods this visitor
 * gets (env + user agent, lib/sign-in-options.ts) and hands the answer to
 * the client form as props — same pattern as /apply and /invite. Google
 * takes one of two routes: the OAuth redirect on the web, or the native
 * account sheet in the Android app (a non-null client id selects it). The
 * iOS shell gets neither until Sign in with Apple ships.
 */
export default async function AppLoginPage() {
  const ua = (await headers()).get("user-agent");
  return (
    <LoginForm
      googleEnabled={googleSignInAvailableFor(ua)}
      googleNativeClientId={googleNativeClientIdFor(ua)}
    />
  );
}
