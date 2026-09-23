"use client";

import { signOut } from "next-auth/react";
import { rememberVoipToken, rememberedVoipToken } from "@/lib/native-voip";

/**
 * Sign out from inside the app. On the iPhone the device's VoIP token is
 * dropped first: a phone that is signed out must not keep ringing for the
 * business line (the push would show a call nobody can answer).
 */
export async function appSignOut(callbackUrl = "/app/login"): Promise<void> {
  const token = rememberedVoipToken();
  if (token) {
    await fetch("/api/app/push", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: token }),
      keepalive: true,
    }).catch(() => {});
    rememberVoipToken(null);
  }
  await signOut({ callbackUrl });
}
