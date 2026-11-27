/**
 * Does this key press send the message?
 *
 * At a desk, Enter sends and Shift+Enter starts a new line. On a phone or
 * tablet the on-screen keyboard's return key is how people start a new line
 * (and there is no Shift+Enter to reach for), so return must never send:
 * only the Send button does. Ticket #s3igcx: a text to a customer went out
 * half-written, from the return key on an iPhone.
 *
 * Also false while an IME is composing (Enter there picks a candidate).
 */
export function enterSends(e: { key: string; shiftKey: boolean; nativeEvent?: { isComposing?: boolean } }): boolean {
  if (e.key !== "Enter" || e.shiftKey) return false;
  if (e.nativeEvent?.isComposing) return false;
  return !touchKeyboard();
}

/** True when the device's main input is a finger (its keyboard is on screen). */
export function touchKeyboard(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(any-pointer: fine)").matches;
}
