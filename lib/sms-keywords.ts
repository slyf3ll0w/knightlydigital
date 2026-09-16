/**
 * Inbound-SMS keyword classification (CTIA opt-out / opt-in words).
 *
 * Only a text that IS the keyword counts — "STOP", "stop.", " Unsubscribe ".
 * A sentence that merely starts with one ("Cancel Friday's visit please",
 * "Stop by after 3") is a real message and lands in the client's thread.
 * The earlier prefix match with cancel/end/quit/yes opted people out for
 * asking to cancel a visit, and swallowed "Yes, that works" replies.
 */
export type SmsKeyword = "STOP" | "START" | "HELP" | null;

// cancel/end/quit are CTIA opt-out words Telnyx honors at its edge; as a
// WHOLE body they must flip smsOptOut too, or the app keeps trying to text
// someone the carrier already blocks. Whole-body anchoring is what keeps
// "Cancel Friday's visit" a normal message.
const STOP_RE = /^\s*(stop|stopall|unsubscribe|cancel|end|quit)\s*[.!]*\s*$/i;
const START_RE = /^\s*(start|unstop)\s*[.!]*\s*$/i;
const HELP_RE = /^\s*(help|info)\s*[.!?]*\s*$/i;

export function classifySmsKeyword(text: string): SmsKeyword {
  if (STOP_RE.test(text)) return "STOP";
  if (START_RE.test(text)) return "START";
  if (HELP_RE.test(text)) return "HELP";
  return null;
}
