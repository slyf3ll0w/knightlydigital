// Runtime dark-theme guard, shared by the app and console contrast specs:
// walk the DOM, take each text node's computed color, composite the
// ancestors' background colors (alpha-aware) down to the canvas, and compute
// the WCAG contrast ratio. Anything under 2.0:1 is a bug (real text sits at
// 4.5+; disabled/placeholder ink is ~2.5–3). Runs inside page.evaluate, so it
// must stay self-contained (no imports, no closures over Node values).

export type ContrastHit = { text: string; fg: string; bg: string; ratio: number; cls: string; tag: string };

export function auditPage(): { mode: string | undefined; hits: ContrastHit[] } {
  type Rgb = { r: number; g: number; b: number; a: number };
  const parse = (c: string | null): Rgb | null => {
    if (!c) return null;
    let m = c.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    m = c.match(/color\(srgb\s+([^)]+)\)/);
    if (m) {
      const p = m[1].replace("/", " ").split(/\s+/).filter(Boolean).map(Number);
      return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 };
    }
    return null;
  };
  const lum = ({ r, g, b }: Rgb) => {
    const f = (v: number) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const blend = (top: Rgb, under: Rgb): Rgb => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1,
  });
  const dark = document.documentElement.dataset.mode === "dark";
  // null = the background can't be known from CSS colors alone (a gradient
  // or image paints it — avatar and monogram discs, the hero), so the node is skipped.
  const bgOf = (el: Element): Rgb | null => {
    const layers: Rgb[] = [];
    let e: Element | null = el;
    while (e) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 0.98) break;
      }
      e = e.parentElement;
    }
    let out: Rgb = dark ? { r: 14, g: 19, b: 29, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) out = blend(layers[i], out);
    return out;
  };
  const hits: ContrastHit[] = [];
  const seen = new Set<string>();
  const check = (el: Element, text: string) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const fg0 = parse(cs.color);
    if (!fg0) return;
    const bg = bgOf(el);
    if (!bg) return;
    const fg = fg0.a < 1 ? blend(fg0, bg) : fg0;
    const l1 = lum(fg);
    const l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    if (ratio >= 2) return;
    const cls = (el.getAttribute("class") || "").slice(0, 120);
    const key = cls + "|" + text;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ text: text.slice(0, 40), fg: cs.color, bg: `rgb(${bg.r | 0},${bg.g | 0},${bg.b | 0})`, ratio: Math.round(ratio * 100) / 100, cls, tag: el.tagName });
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = (n.textContent || "").trim();
    if (t.length >= 2 && n.parentElement) check(n.parentElement, t);
  }
  for (const el of Array.from(document.querySelectorAll("input:not([type=hidden]), textarea, select"))) {
    const field = el as HTMLInputElement;
    check(el, `[field ${(field.value || field.placeholder || "").slice(0, 16)}]`);
  }
  return { mode: document.documentElement.dataset.mode, hits };
}
