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
  "rounded-[12px] border border-[color:var(--ds-line-strong,#D1D5DB)] bg-[color:var(--ds-surface,#fff)] px-3 py-2.5 text-sm text-[color:var(--ds-ink,#111827)] placeholder:text-[color:var(--ds-faint,#9CA3AF)] focus:border-[color:var(--ds-primary,#0B57D8)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary-soft,#0B57D81A)]";

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
