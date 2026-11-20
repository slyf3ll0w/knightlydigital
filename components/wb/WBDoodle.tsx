/**
 * A faint, cartoony hand-drawn drawing behind a section (home direction
 * preview, David 2026-11-19: "a subtle background in each section; start
 * with a cartoony handdrawn Free" — liked, then: Atlas, the job section and
 * pricing get their own). Drawn as marker strokes. Two looks:
 *  - "hollow": a wide ink stroke with a narrower paper-colored stroke on top,
 *    so the shapes read as outlined bubble letters (needs a solid `paper`
 *    color: the section's background);
 *  - "line": a single marker line (works on gradients, e.g. the blue band).
 * Decorative only; sits under the section's content.
 */

type Doodle = { viewBox: string; mode: "hollow" | "line"; strokes: string[]; thin?: string[] };

const DOODLES: Record<string, Doodle> = {
  /** "Free" in bubble letters, a swoosh and sparks (the free section). */
  free: {
    viewBox: "0 0 560 280",
    mode: "hollow",
    strokes: [
      "M58 58 C 54 120, 60 180, 56 236",
      "M58 60 C 108 52, 148 54, 182 48",
      "M58 146 C 96 142, 120 144, 146 139",
      "M214 136 C 214 170, 216 204, 213 236",
      "M215 166 C 228 134, 252 124, 284 132",
      "M318 186 C 356 190, 386 180, 384 158 C 382 128, 336 120, 320 148 C 304 178, 318 228, 356 234 C 376 236, 390 228, 400 216",
      "M430 186 C 468 190, 498 180, 496 158 C 494 128, 448 120, 432 148 C 416 178, 430 228, 468 234 C 488 236, 502 228, 512 216",
    ],
    thin: ["M70 262 C 200 248, 360 246, 520 254", "M520 70 L540 50", "M528 96 L556 92", "M506 52 L510 24"],
  },
  /** A clipboard with a checklist ticked off (the job section; round 2 —
   *  David didn't like "Done!" or the price tag). */
  clipboard: {
    viewBox: "0 0 360 440",
    mode: "hollow",
    strokes: [
      "M60 72 L300 70 C 316 70, 324 80, 324 96 L322 398 C 322 414, 312 422, 298 422 L66 424 C 50 424, 42 414, 42 400 L40 96 C 40 80, 48 72, 60 72",
      "M132 50 L230 48 C 240 48, 246 56, 246 66 L244 98 L118 100 L116 68 C 116 58, 122 50, 132 50",
    ],
    thin: [
      "M86 170 L108 194 L148 144",
      "M178 172 L282 168",
      "M86 252 L108 276 L148 226",
      "M178 254 L282 250",
      "M90 332 L134 330 L134 372 L92 374 L90 332",
      "M178 336 L262 332",
    ],
  },
  /** A cartoony piggy bank with a coin dropping in (pricing; round 2). */
  piggy: {
    viewBox: "0 0 520 380",
    mode: "hollow",
    strokes: [
      "M140 140 C 200 90, 340 90, 390 150 C 430 196, 420 270, 360 300 C 300 330, 190 330, 140 290 C 96 256, 92 180, 140 140",
      "M392 182 C 430 172, 448 196, 442 222 C 436 246, 406 250, 396 236",
      "M200 114 C 194 80, 226 70, 248 98",
      "M178 306 L174 352",
      "M234 320 L232 360",
      "M318 318 L320 358",
      "M360 298 L366 340",
      "M270 26 C 292 26, 302 44, 298 60 C 294 78, 262 80, 254 64 C 246 46, 252 26, 270 26",
    ],
    thin: [
      "M98 212 C 70 202, 76 176, 96 184 C 112 190, 98 214, 80 224",
      "M238 116 L302 112",
      "M368 172 L370 178",
      "M418 204 L418 212",
      "M244 20 L232 4",
      "M300 18 L314 4",
    ],
  },
  /** A speech bubble with a microphone and sound waves (the assistant
   *  section; round 3 — the compass and piggy read as "weird"). */
  voice: {
    viewBox: "0 0 460 360",
    mode: "line",
    strokes: [
      "M96 30 L364 30 C 386 30, 400 44, 400 66 L400 226 C 400 248, 386 262, 364 262 L182 262 L112 326 L124 262 L96 262 C 74 262, 60 248, 60 226 L60 66 C 60 44, 74 30, 96 30",
      "M232 70 C 246 70, 254 80, 254 94 L254 156 C 254 170, 246 180, 232 180 C 218 180, 210 170, 210 156 L210 94 C 210 80, 218 70, 232 70",
      "M188 148 C 190 200, 274 200, 276 148",
      "M232 194 L232 222",
      "M208 224 L256 224",
      "M318 112 C 334 132, 334 162, 318 182",
      "M346 94 C 372 126, 372 168, 346 200",
      "M146 112 C 130 132, 130 162, 146 182",
      "M118 94 C 92 126, 92 168, 118 200",
    ],
  },
  /** Two stacks of coins with a $ on top (pricing; round 3). */
  coins: {
    viewBox: "0 0 460 300",
    mode: "hollow",
    strokes: [
      "M80 92 C 80 70, 240 70, 240 92 C 240 114, 80 114, 80 92",
      "M80 92 L80 232 C 80 256, 240 256, 240 232 L240 92",
      "M270 162 C 270 142, 410 142, 410 162 C 410 182, 270 182, 270 162",
      "M270 162 L270 236 C 270 258, 410 258, 410 236 L410 162",
    ],
    thin: [
      "M80 128 C 80 150, 240 150, 240 128",
      "M80 164 C 80 186, 240 186, 240 164",
      "M80 200 C 80 222, 240 222, 240 200",
      "M270 198 C 270 218, 410 218, 410 198",
      "M176 80 C 166 74, 146 76, 148 86 C 150 96, 174 94, 174 104 C 174 114, 152 114, 144 108",
      "M160 70 L160 120",
      "M430 70 L450 50",
      "M436 98 L460 94",
    ],
  },
  /** The assistant's compass with sound waves coming off it (line, for the blue band). */
  atlas: {
    viewBox: "0 0 500 400",
    mode: "line",
    strokes: [
      "M200 40 C 300 38, 362 110, 360 200 C 358 292, 290 362, 200 360 C 108 358, 40 290, 42 200 C 44 108, 104 42, 200 40",
      "M166 250 L272 124 L234 238 L166 250",
      "M200 54 L200 84",
      "M200 318 L200 346",
      "M56 200 L86 200",
      "M316 200 L344 200",
      "M396 150 C 416 180, 416 222, 396 252",
      "M430 116 C 466 168, 466 236, 430 288",
      "M464 84 C 512 160, 512 244, 464 320",
    ],
  },
};

export type DoodleName = keyof typeof DOODLES;

export default function WBDoodle({
  word = "free",
  paper = "#FFFFFF",
  ink = "#0A1428",
  opacity = 0.07,
  className = "",
}: {
  word?: DoodleName;
  /** The section's background color (the hollow inside "hollow" shapes). */
  paper?: string;
  ink?: string;
  opacity?: number;
  className?: string;
}) {
  const d = DOODLES[word];
  return (
    <svg viewBox={d.viewBox} fill="none" aria-hidden className={`pointer-events-none absolute select-none ${className}`} style={{ opacity }}>
      <g strokeLinecap="round" strokeLinejoin="round">
        {d.mode === "hollow" ? (
          <>
            {d.strokes.map((p) => (
              <path key={`o-${p}`} d={p} stroke={ink} strokeWidth={46} />
            ))}
            {d.strokes.map((p) => (
              <path key={`i-${p}`} d={p} stroke={paper} strokeWidth={30} />
            ))}
          </>
        ) : (
          d.strokes.map((p) => <path key={p} d={p} stroke={ink} strokeWidth={14} />)
        )}
        {d.thin?.map((p) => (
          <path key={p} d={p} stroke={ink} strokeWidth={10} />
        ))}
      </g>
    </svg>
  );
}
