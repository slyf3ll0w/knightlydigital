// npm run check:arrows — every arrow head in components/ds/arrows.ts must
// leave its shaft cleanly: the tip sits on the shaft's last point and both
// barbs stay clear of the shaft (no head ever retraces the tail again).
import fs from "node:fs";
const src = fs.readFileSync(new URL("../components/ds/arrows.ts", import.meta.url), "utf8");
const entries = [...src.matchAll(/(\w+): \{\s*body: "([^"]+)",\s*head: "([^"]+)"/g)].map((m) => ({ name: m[1], body: m[2], head: m[3] }));
if (entries.length === 0) throw new Error("no arrows found in components/ds/arrows.ts");
const num = (s) => s.trim().split(/[\s,]+/).map(Number);
const cubic = (p0, c1, c2, p3, t) => { const m = 1 - t; return [m*m*m*p0[0] + 3*m*m*t*c1[0] + 3*m*t*t*c2[0] + t*t*t*p3[0], m*m*m*p0[1] + 3*m*m*t*c1[1] + 3*m*t*t*c2[1] + t*t*t*p3[1]]; };
let failed = 0;
for (const a of entries) {
  const start = num(a.body.match(/^M([^C]+)/)[1]);
  const segs = [...a.body.matchAll(/C\s*([^C]+)/g)].map((m) => num(m[1]));
  const pts = []; let p0 = start; let last;
  for (const s of segs) { const c1 = [s[0], s[1]], c2 = [s[2], s[3]], p3 = [s[4], s[5]]; for (let t = 0; t <= 1.0001; t += 0.01) pts.push(cubic(p0, c1, c2, p3, t)); last = { c2, p3 }; p0 = p3; }
  const tip = last.p3;
  const [b1x, b1y, tx, ty, b2x, b2y] = num(a.head.replace(/[ML]/g, " "));
  const problems = [];
  if (Math.hypot(tx - tip[0], ty - tip[1]) > 0.6) problems.push(`tip (${tx},${ty}) is off the shaft end (${tip})`);
  const dir = [tip[0] - last.c2[0], tip[1] - last.c2[1]]; const L = Math.hypot(...dir); const back = [-dir[0] / L, -dir[1] / L];
  for (const [bx, by, label] of [[b1x, b1y, "barb 1"], [b2x, b2y, "barb 2"]]) {
    const v = [bx - tx, by - ty]; const vl = Math.hypot(...v);
    const angle = (Math.acos((v[0] * back[0] + v[1] * back[1]) / vl) * 180) / Math.PI;
    if (angle < 22) problems.push(`${label} runs along the shaft (${angle.toFixed(0)}° off)`);
    let worst = 99;
    for (let s = 0.6; s <= 1; s += 0.05) { const q = [tx + v[0] * s, ty + v[1] * s]; for (const p of pts) if (Math.hypot(p[0] - tip[0], p[1] - tip[1]) > 8) worst = Math.min(worst, Math.hypot(p[0] - q[0], p[1] - q[1])); }
    if (worst < 2.8) problems.push(`${label} sits ${worst.toFixed(1)}px from the shaft (stroke is 2.6)`);
  }
  if (problems.length) { failed++; console.log(`FAIL ${a.name}: ${problems.join("; ")}`); } else console.log(`  ok ${a.name}`);
}
if (failed) { console.error(`${failed} arrow(s) would draw over themselves`); process.exit(1); }
console.log("check-arrows: every head clears its shaft");
