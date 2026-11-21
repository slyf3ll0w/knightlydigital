/**
 * Earlier replies are sent back to the model with a "[Behind this reply: …]"
 * note (the tool calls behind them), so it can resolve "it" and "that one".
 * The model sometimes copies the habit and ends its own reply with such a
 * note (ticket #ia3q5e: the user saw it in the chat). The note is ours to
 * add, never the model's to write, so anything from the marker on is cut.
 */
const MARK = /\s*\[Behind this reply:/i;

export function stripRecapEcho(text: string): string {
  const at = text.search(MARK);
  return at < 0 ? text : text.slice(0, at).trimEnd();
}
