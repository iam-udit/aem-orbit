/**
 * @file The AEM-style spiral of the logo and the orb: two interlaced closed strands with 8 lobes.
 * @module shared/spiral
 *
 * `sign` +1 bulges at top / bottom / left / right (the thin strand), -1 at the diagonals (the thick strand).
 * The orb draws it in a 44 × 44 box; the logo tiles (toolbar, popup, Settings) and the PNG icons use the 24 × 24 box below.
 */

/** Radius of the strands' mean circle and the size of the lobes, in the 24 × 24 logo box. */
export const LOGO_SPIRAL = { r: 8.6, amp: 1.5, thin: 1.1, thick: 2.1 };

/** @returns {[number, number][]} `n` points of one strand, centred on (cx, cy). */
export function spiralPoints(sign, cx, cy, r, amp, n = 120) {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * 2 * Math.PI;
    const rad = r + sign * amp * Math.cos(4 * t);
    return [cx + rad * Math.sin(t), cy - rad * Math.cos(t)];
  });
}

/** SVG path data (closed) of one strand. */
export function spiralPath(sign, cx, cy, r, amp, n = 120) {
  const pts = spiralPoints(sign, cx, cy, r, amp, n).map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`);
  return `M${pts.join(' L')}Z`;
}

/** The two strands, white, to put inside a `viewBox="0 0 24 24"` <svg> (toolbar, popup and Settings logos). */
export function logoSpiralPaths() {
  const { r, amp, thin, thick } = LOGO_SPIRAL;
  const d = (sign) => spiralPath(sign, 12, 12, r, amp);
  return `<path d="${d(1)}" fill="none" stroke="#FFFFFF" stroke-opacity="0.85" stroke-width="${thin}" stroke-linejoin="round"/>`
    + `<path d="${d(-1)}" fill="none" stroke="#FFFFFF" stroke-width="${thick}" stroke-linejoin="round"/>`;
}
