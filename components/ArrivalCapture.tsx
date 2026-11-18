"use client";

import { useEffect } from "react";
import { getArrival, listenForArrival } from "@/lib/arrival-client";

/**
 * Mounted once on every public form surface (the /book and /embed layouts).
 * In an embed it listens for what the business's website says about how the
 * visitor arrived; on a hosted page it reads the address and referrer on the
 * first page of the visit, before a menu click drops the tags. Renders
 * nothing. See lib/arrival-client.ts.
 */
export default function ArrivalCapture() {
  useEffect(() => {
    const stop = listenForArrival();
    getArrival();
    return stop;
  }, []);
  return null;
}
