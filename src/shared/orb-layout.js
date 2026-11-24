/**
 * Orb layout — the ring of pointed leaves (an icon above its label) that fans out around the floating orb.
 *
 * Pure geometry shared by the content script (applies it) and the tests.
 * The leaves form a half ring opening upwards. When the orb has been dragged near an
 * edge, the ring turns (down, sideways, or into a narrower arc in a corner) so
 * every leaf stays inside the window.
 *
 * Angles are in degrees, counter-clockwise from the right: 0 = right, 90 = up.
 * Offsets are in screen pixels (x to the right, y downwards) from the orb's centre.
 */

export const ORB = Object.freeze({
  inner: 34,        // radius of the empty hole around the orb
  minOuter: 112,    // smallest outer radius of the ring
  maxOuter: 170,    // largest outer radius of the ring
  minChord: 44,     // width a leaf should have where its label sits, so a short label fits
  gap: 3,           // clear space between neighbouring leaves, in px
  margin: 8,        // minimum distance from the ring's outer edge to the window edge
  step: 5,          // resolution of the search for room, in degrees
  centroid: 0.6,    // where the icon (above) and label (below) sit between the inner and outer edge (0 = inner, 1 = outer)
  tip: 18,          // how far a leaf's pointed tip rises above its shoulders, in px
  labelDrop: 8,     // how far the label sits nearer the orb than the anchor point (the icon sits above it)
});

/** Most environments the orb shows as leaves; with more, the Env leaf opens the dropdown picker instead. */
export const MAX_ENV_LEAVES = 6;

/**
 * The orb's fixed leaves, left to right: seven slots, so the environment switcher ('env') is always in the middle.
 * JCR needs Developer Mode; without it, Copy path takes its place so the ring keeps its shape.
 * @param {boolean} showJcr  Developer Mode allows the JCR inspector.
 * @returns {string[]} toolbar item ids, plus 'env' for the environment switcher
 */
export function orbLeafOrder(showJcr) {
  return ['edit', 'view', 'live', 'env', showJcr ? 'jcr' : 'copy', 'props', 'sites'];
}

/**
 * The leaves while the environments are open: the switcher stays in the middle with the environments on
 * both sides of it. With an odd number of environments the extra one goes to the right.
 * @template T
 * @param {T[]} envs
 * @returns {(T|null)[]} the environments with `null` where the switcher goes
 */
export function envFanOrder(envs) {
  const mid = Math.floor(envs.length / 2);
  return [...envs.slice(0, mid), null, ...envs.slice(mid)];
}

const rad = (deg) => (deg * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const round1 = (n) => Math.round(n * 10) / 10;

/** Angular distance from `center` to straight up, 0–180. */
function awayFromUp(center) {
  const d = Math.abs(center - 90) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Outer radius at which `count` leaves spread over `span` degrees are wide enough.
 * @param {number} count
 * @param {number} [span=180]
 * @returns {number}
 */
export function fanOuterRadius(count, span = 180) {
  if (count <= 1 || span <= 0) return ORB.minOuter;
  const delta = rad(Math.min(span / count, 180));
  const mid = ORB.minChord / (2 * Math.sin(delta / 2));
  return Math.min(ORB.maxOuter, Math.max(ORB.minOuter, Math.ceil(2 * mid - ORB.inner)));
}

function fits(angle, outer, cx, cy, vw, vh) {
  const m = ORB.margin;
  const x = cx + outer * Math.cos(rad(angle));
  const y = cy - outer * Math.sin(rad(angle));
  return x >= m && x <= vw - m && y >= m && y <= vh - m;
}

/**
 * Find the arc of angles that has room: a full half ring pointing up, otherwise one pointing
 * straight right, left or down (a clean sideways ring along a window edge, never a tilted one),
 * then any other whole half ring, otherwise the longest stretch of free angles.
 * @returns {{center: number, span: number}}
 */
function bestWindow(outer, cx, cy, vw, vh) {
  const n = Math.round(360 / ORB.step);
  const angleAt = (i) => ((i % n) + n) % n * ORB.step;
  const ok = Array.from({ length: n }, (_, i) => fits(angleAt(i), outer, cx, cy, vw, vh));
  const half = Math.round(90 / ORB.step);

  // A whole half ring: up first, then straight right / left / down, then whatever else fits (closest to up first).
  const axes = [90, 0, 180, 270].map((a) => Math.round(a / ORB.step));
  const rest = Array.from({ length: n }, (_, i) => i)
    .filter((i) => !axes.includes(i))
    .sort((a, b) => awayFromUp(angleAt(a)) - awayFromUp(angleAt(b)));
  const centers = [...axes, ...rest];
  for (const c of centers) {
    let all = true;
    for (let k = -half; k <= half && all; k++) all = ok[((c + k) % n + n) % n];
    if (all) return { center: angleAt(c), span: 180 };
  }

  // Otherwise the longest free stretch (a corner leaves a quarter ring or a bit more).
  let best = null;
  for (let i = 0; i < n; i++) {
    if (!ok[i] || ok[(i - 1 + n) % n]) continue;      // only start at the beginning of a stretch
    let len = 0;
    while (len < n && ok[(i + len) % n]) len++;
    const span = (len - 1) * ORB.step;
    const center = (angleAt(i) + span / 2) % 360;
    if (!best || span > best.span || (span === best.span && awayFromUp(center) < awayFromUp(best.center))) best = { center, span };
  }
  // No room anywhere (a tiny window): fall back to the upward half ring and accept clipping.
  return best && best.span >= 30 ? best : { center: 90, span: 180 };
}

/**
 * Corners of one leaf, relative to the orb's centre (x right, y down): a base that curves around the
 * orb, straight sides along the radial lines, and a pointed tip on the outer edge (like a sun ray).
 */
function leafShape(inner, outer, hi, lo, gapDeg) {
  const a1 = hi - gapDeg / 2;
  const a2 = lo + gapDeg / 2;
  const mid = (a1 + a2) / 2;
  const shoulder = outer - Math.min(ORB.tip, (outer - inner) * 0.3);
  const pt = (r, a) => [r * Math.cos(rad(a)), -r * Math.sin(rad(a))];
  return {
    a1, a2,
    corners: [pt(inner, a1), pt(shoulder, a1), pt(outer, mid), pt(shoulder, a2), pt(inner, a2)],
  };
}

/**
 * Smallest box around one leaf, in px from the orb's centre (x right, y down).
 * @returns {{left: number, top: number, width: number, height: number}}
 */
export function wedgeBox(inner, outer, hi, lo, gapDeg = 0) {
  const { a1, a2, corners } = leafShape(inner, outer, hi, lo, gapDeg);
  const pts = [...corners];
  for (let a = a2; a < a1; a += 1) pts.push([inner * Math.cos(rad(a)), -inner * Math.sin(rad(a))]);   // the curved base
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  const left = Math.floor(Math.min(...xs));
  const top = Math.floor(Math.min(...ys));
  return { left, top, width: Math.ceil(Math.max(...xs)) - left, height: Math.ceil(Math.max(...ys)) - top };
}

/**
 * CSS `clip-path: path(...)` for one leaf. Coordinates are relative to the leaf's own box
 * (see `wedgeBox`), so the element can be just as large as the leaf.
 * @param {number} inner  Radius of the base (the curve around the orb).
 * @param {number} outer  Radius of the tip.
 * @param {number} hi     Larger angle of the leaf (its left edge for an upward ring).
 * @param {number} lo     Smaller angle of the leaf.
 * @param {number} [gapDeg=0] Angle taken off the leaf so neighbours do not touch.
 * @param {{left: number, top: number}} [box] Origin of the path; defaults to a box centred on the orb with side 2 × outer.
 * @returns {string}
 */
export function wedgePath(inner, outer, hi, lo, gapDeg = 0, box = { left: -outer, top: -outer }) {
  const { a1, a2, corners } = leafShape(inner, outer, hi, lo, gapDeg);
  const q = ([x, y]) => `${round1(x - box.left)} ${round1(y - box.top)}`;
  const large = a1 - a2 > 180 ? 1 : 0;
  const [base1, sh1, tip, sh2, base2] = corners;
  return `path('M ${q(base1)} L ${q(sh1)} L ${q(tip)} L ${q(sh2)} L ${q(base2)} A ${inner} ${inner} 0 ${large} 0 ${q(base1)} Z')`;
}

/**
 * Smallest box that holds the orb's centre and the ring's outer edge. Menus and panels opened
 * from a leaf use it to sit beyond the ring instead of on top of it.
 * @param {{outer: number, center: number, span: number}} plan
 * @param {number} cx  Orb centre, viewport x.
 * @param {number} cy  Orb centre, viewport y.
 * @returns {{left: number, top: number, right: number, bottom: number}}
 */
export function ringBounds(plan, cx, cy) {
  const lo = plan.center - plan.span / 2;
  const angles = [lo, plan.center + plan.span / 2];
  for (let a = lo; a < plan.center + plan.span / 2; a += ORB.step) angles.push(a);
  const xs = [cx];
  const ys = [cy];
  for (const a of angles) {
    xs.push(cx + plan.outer * Math.cos(rad(a)));
    ys.push(cy - plan.outer * Math.sin(rad(a)));
  }
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

/**
 * Where each of `count` leaves goes.
 *
 * @param {number} count  Number of leaves.
 * @param {number} cx     Orb centre, viewport x.
 * @param {number} cy     Orb centre, viewport y.
 * @param {number} vw     Viewport width.
 * @param {number} vh     Viewport height.
 * @returns {{inner: number, outer: number, center: number, span: number, compact: boolean,
 *            items: {x: number, y: number, a: number, box: object, path: string}[]}}
 *   compact: the leaves are too narrow for a label (icon only).
 *   x/y: offset of the point where a leaf's icon and label sit, from the orb's centre.
 *   a: the leaf's middle angle. box: the leaf element's box, in px from the orb's centre.
 *   path: its `clip-path`, relative to that box.
 */
export function planFan(count, cx, cy, vw, vh) {
  const inner = ORB.inner;
  if (!(count >= 1)) return { inner, outer: ORB.minOuter, center: 90, span: 180, compact: false, items: [] };
  let outer = fanOuterRadius(count, 180);
  let win = bestWindow(outer, cx, cy, vw, vh);
  // A narrower arc needs a bigger ring to keep the leaves wide enough; that can shrink the arc again.
  for (let i = 0; i < 4; i++) {
    const need = fanOuterRadius(count, win.span);
    if (need <= outer) break;
    outer = need;
    win = bestWindow(outer, cx, cy, vw, vh);
  }

  const delta = win.span / count;
  const gapDeg = deg(ORB.gap / ((inner + outer) / 2));
  const rc = inner + (outer - inner) * ORB.centroid;
  // The label sits below the icon, towards the orb, where the leaf is wider. In a corner the arc is
  // narrow and the ring cannot grow any more: leaves then get an icon only (the name shows beside it on hover).
  const compact = count > 1 && 2 * (rc - ORB.labelDrop) * Math.sin(rad(delta / 2)) < ORB.minChord - 0.5;
  // Keep left-to-right order when the ring points down, and top-to-bottom when it points left.
  const down = Math.sin(rad(win.center)) < -1e-9;
  const left = Math.cos(rad(win.center)) < -0.9;
  const items = Array.from({ length: count }, (_, i) => {
    const slot = down || left ? count - 1 - i : i;
    const hi = win.center + win.span / 2 - slot * delta;
    const a = hi - delta / 2;
    const g = count > 1 ? gapDeg : 0;
    const box = wedgeBox(inner, outer, hi, hi - delta, g);
    return {
      x: round1(rc * Math.cos(rad(a))),
      y: round1(-rc * Math.sin(rad(a))),
      a,
      box,
      path: wedgePath(inner, outer, hi, hi - delta, g, box),
    };
  });
  return { inner, outer, center: win.center, span: win.span, compact, items };
}
