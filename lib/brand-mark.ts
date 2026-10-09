/**
 * The WorkBench mark as vector geometry — the W, the bench top, the two
 * orange legs — in a 1000×1000 box, redrawn clean and symmetric from
 * David's official app icon (2026-10-09). Everything that draws the mark
 * (the launch animation, the store icon/splash generator, favicons) reads
 * these so they can never drift apart. Corners get their rounding from a
 * same-colour stroke with round joins (see markRound).
 */

/** The blue of the official icon square (lighter than the UI accent #0B57D8). */
export const MARK_BLUE = "#0065FC";
export const MARK_ORANGE = "#F86808";
export const MARK_WHITE = "#FFFFFF";

type Pt = readonly [number, number];
const pts = (list: Pt[]) => list.map(([x, y]) => `${x},${y}`).join(" ");

/** The W: outer strokes and the centre peak, one outline. */
export const MARK_W = pts([
  [95, 205], [250, 205], [365, 420], [475, 268], [525, 268], [635, 420], [750, 205],
  [905, 205], [710, 575], [605, 575], [500, 437], [395, 575], [290, 575],
]);

/** The bench top with its centre notch, ends flared outward. */
export const MARK_BAR = pts([
  [165, 598], [393, 598], [433, 640], [567, 640], [607, 598], [835, 598],
  [862, 673], [640, 673], [610, 699], [390, 699], [360, 673], [138, 673],
]);

export const MARK_LEG_LEFT = pts([[180, 697], [315, 697], [242, 833], [110, 833]]);
export const MARK_LEG_RIGHT = pts([[685, 697], [820, 697], [890, 833], [758, 833]]);

/** Stroke width that rounds the corners the way the icon's are rounded. */
export const MARK_ROUND = 14;

/** Standalone SVG document of the mark on its blue square (asset generation). */
export function markSvg({ square = true }: { square?: boolean } = {}): string {
  const shape = (points: string, fill: string, cls: string) =>
    `<polygon class="${cls}" points="${points}" fill="${fill}" stroke="${fill}" stroke-width="${MARK_ROUND}" stroke-linejoin="round"/>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">`,
    square ? `<rect width="1000" height="1000" fill="${MARK_BLUE}"/>` : "",
    shape(MARK_W, MARK_WHITE, "w"),
    shape(MARK_BAR, MARK_WHITE, "bar"),
    shape(MARK_LEG_LEFT, MARK_ORANGE, "leg"),
    shape(MARK_LEG_RIGHT, MARK_ORANGE, "leg"),
    `</svg>`,
  ].join("");
}
