/**
 * Form primitives — the input recipe that ~40 call sites hand-typed
 * (`border-gray-300 rounded-lg text-sm focus:ring-green-500 …`), as
 * components. Green focus classes are intentional: the light-mode bridge
 * maps green→tenant accent, and the dark bridge restyles gray borders, so
 * these stay theme- and brand-correct without carrying vars themselves.
 *
 * No width in the base — call sites keep their own `w-full`/`w-24` etc.
 * via className, so migration preserves layout exactly.
 */

const base =
  "rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500";

/**
 * The same recipe as a class string, full width, for the raw <input>/<select>
 * call sites that haven't moved to the components yet. Fifteen files used to
 * each declare their own `inputCls` (two byte-identical, the rest drifting
 * by a padding step or a ring width); they all import this one now.
 */
export const inputCls = `w-full ${base}`;
/** Same recipe, intrinsic width — for inputs that sit inline in a row. */
export const inputClsAuto = base;

export function Input({
  className = "",
  ...props
}: React.ComponentProps<"input">) {
  return <input {...props} className={`${base} ${className}`} />;
}

export function Textarea({
  className = "",
  ...props
}: React.ComponentProps<"textarea">) {
  return <textarea {...props} className={`${base} ${className}`} />;
}

export function Select({
  className = "",
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select {...props} className={`${base} ${className}`}>
      {children}
    </select>
  );
}
