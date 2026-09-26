// npm run check:theme — the dark-theme guard, source side.
//
// Dark mode in the app is a bridge (app/globals.css) that remaps the light
// Tailwind palette inside .app-ui, plus the .ds tokens in app/ds.css. Text
// only ends up black-on-black when a screen reaches for a color the bridge
// never sees: a raw hex, `text-black`, a palette the bridge doesn't remap,
// or an inline `color:`. This script fails the build on any of those in the
// themed app tree, with the file:line, so the mistake can't ship again. The
// runtime half is e2e/specs/theme-contrast.spec.ts (measures every page in
// both themes on staging).
//
// Forced-light surfaces (client pages, auth pages, PDFs, the marketing site)
// are out of scope — see SKIP below.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOTS = ["app/platform", "components"];
const SKIP = [
  /^components[\\/]wb[\\/]/, // marketing site
  /^components[\\/](paper-doc|Header|Footer|MarketingWrapper|HubPricing|LeadForm|ApplyForm|InviteSignupForm|PublicEstimateForm|ForceLightTheme|NativeShell|TurnstileWidget)\.tsx$/,
  /^app[\\/]platform[\\/](login|register|activate|forgot-password|get-started|suspended|verify-email)[\\/]/, // forced light
];

// Text colors the dark bridge / ds tokens never remap. Each one renders
// near-black on the dark canvas.
const RULES = [
  { re: /\btext-black\b/g, why: "text-black stays black in dark mode — use text-gray-900 (bridged) or text-[color:var(--ds-ink)]" },
  { re: /\btext-gray-950\b/g, why: "text-gray-950 isn't bridged — use text-gray-900" },
  { re: /\btext-(slate|zinc|neutral|stone)-(6|7|8|9)00\b/g, why: "only the gray-* family is bridged for dark mode — use text-gray-* or a --ds-* token" },
  { re: /\btext-(blue|sky|indigo|violet|purple|fuchsia|pink|rose|orange|yellow|lime|emerald|teal|cyan)-(8|9)00\b/g, why: "this shade has no dark override — use the 700 shade (bridged) or a --ds-* token" },
  { re: /\btext-\[#[0-9a-fA-F]{3,8}\]/g, why: "a raw hex text color never changes with the theme — use a --ds-* token (text-[color:var(--ds-ink)])" },
  { re: /\bcolor:\s*["'`]#(0|1|2)[0-9a-fA-F]{5}\b/g, why: "an inline near-black color: never changes with the theme — use var(--ds-ink) / var(--ds-ink-2)" },
  { re: /\bcolor:\s*["'`](black|#000)\b/g, why: "inline black text never changes with the theme" },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts|css)$/.test(name)) out.push(p);
  }
  return out;
}

const files = ROOTS.flatMap((r) => walk(r)).filter((f) => !SKIP.some((s) => s.test(relative(".", f))));
const findings = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const lines = src.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/theme-ok/.test(line)) return; // explicit opt-out with a reason in the comment
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      const m = rule.re.exec(line);
      if (m) findings.push({ file: relative(".", f).split(sep).join("/"), line: i + 1, hit: m[0], why: rule.why });
    }
  });
}

if (findings.length) {
  console.error(`check-theme: ${findings.length} color(s) that would break dark mode\n`);
  for (const x of findings) console.error(`  ${x.file}:${x.line}  ${x.hit}\n      ${x.why}`);
  console.error("\nUse a bridged gray/green/red/amber shade or a --ds-* token. If a color really must stay fixed, add `// theme-ok: <why>` on the line.");
  process.exit(1);
}
console.log(`check-theme: ${files.length} files clean`);
