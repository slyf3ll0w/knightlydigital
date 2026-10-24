"use client";

import { primeLiveAudio } from "@/lib/live-voice-client";
import { requestMicrophone, type MicState } from "@/lib/voice-chat-client";

/**
 * Starting a conversation from OUTSIDE the chat (the Talk button in the
 * header, on Home, in the More sheet). iPhones only grant the microphone
 * and unlock audio inside the tap itself, and the drawer that hosts the
 * voice screen mounts a render later — so the tap calls launchVoice() right
 * away and the drawer picks the grant up with takeMicGrant().
 */
let pending: Promise<MicState> | null = null;

export function launchVoice(): void {
  primeLiveAudio();
  pending = requestMicrophone();
}

export function takeMicGrant(): Promise<MicState> | null {
  const p = pending;
  pending = null;
  return p;
}
