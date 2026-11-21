"use client";

import type { ReactNode } from "react";
import { useCallEndedHere } from "@/lib/softphone-client";

/**
 * A row the server still reads as ringing / on the line. When the call was
 * on THIS tab's softphone and just ended, the hang-up webhook that closes
 * the row is a second or two behind; show the finished row at once instead
 * of "On the line" (ticket #7iyuu2). CallsLive swaps in the real row as soon
 * as it lands. Both rows are rendered by the server; this only picks one.
 */
export default function CallRowSettling({ callId, live, ended }: { callId: string; live: ReactNode; ended: ReactNode }) {
  return <>{useCallEndedHere(callId) ? ended : live}</>;
}
