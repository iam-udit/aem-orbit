import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORB, MAX_ENV_LEAVES, envFanOrder, fanOuterRadius, orbLeafOrder, planFan, ringBounds, wedgePath } from '../src/shared/orb-layout.js';

const VW = 1280;
const VH = 800;
const rad = (d) => (d * Math.PI) / 180;

/** Angles (degrees) covered by the ring, sampled along its outer edge. */
const edgePoints = (plan, cx, cy) => {
  const pts = [];
  const lo = plan.center - plan.span / 2;
  for (let a = lo; a <= plan.center + plan.span / 2 + 1e-9; a += 2) {
    pts.push({ x: cx + plan.outer * Math.cos(rad(a)), y: cy - plan.outer * Math.sin(rad(a)) });
  }
  return pts;
};
const insideWindow = (plan, cx, cy, vw = VW, vh = VH) =>
  edgePoints(plan, cx, cy).every((p) => p.x >= 0 && p.x <= vw && p.y >= 0 && p.y <= vh);

/** Width of a leaf where its label sits (a little nearer the orb than the anchor). */
const leafWidth = (plan, count) => 2 * (Math.hypot(plan.items[0].x, plan.items[0].y) - ORB.labelDrop) * Math.sin(rad(plan.span / count / 2));

test('no leaves gives an empty fan', () => {
  assert.deepEqual(planFan(0, 600, 400, VW, VH).items, []);
});

test('in open space the leaves form a half ring pointing up, left to right', () => {
  const plan = planFan(6, 640, 600, VW, VH);
  assert.equal(plan.items.length, 6);
  assert.equal(plan.span, 180);
  assert.equal(plan.center, 90);
  assert.ok(plan.items.every((p) => p.y < 0), 'every leaf sits above the orb');
  const xs = plan.items.map((p) => p.x);
  assert.deepEqual(xs, [...xs].sort((a, b) => a - b), 'first leaf is leftmost');
  assert.ok(Math.abs(xs[0] + xs[5]) < 1, 'the ring is centred over the orb');
});

test('every label anchor is the same distance from the orb, between the inner and outer edge', () => {
  const plan = planFan(5, 640, 600, VW, VH);
  const d0 = Math.hypot(plan.items[0].x, plan.items[0].y);
  assert.ok(d0 > plan.inner && d0 < plan.outer);
  for (const p of plan.items) assert.ok(Math.abs(Math.hypot(p.x, p.y) - d0) < 0.5);
});

test('leaves are wide enough for a short label, for every count the bar allows', () => {
  for (let n = 1; n <= 7; n++) {
    const plan = planFan(n, 640, 600, VW, VH);
    assert.ok(plan.outer <= ORB.maxOuter, `${n} leaves: ring too big`);
    if (n >= 3) assert.ok(leafWidth(plan, n) >= ORB.minChord - 1, `${n} leaves: too narrow (${leafWidth(plan, n).toFixed(1)}px)`);
  }
});

test('the ring grows with the leaf count but stays within its limits', () => {
  assert.equal(fanOuterRadius(1), ORB.minOuter);
  assert.ok(fanOuterRadius(7) >= fanOuterRadius(4));
  assert.ok(fanOuterRadius(7) <= ORB.maxOuter);
  assert.ok(fanOuterRadius(6, 90) >= fanOuterRadius(6, 180), 'a narrower arc needs a bigger ring');
});

test('each leaf has a clip-path inside its own box, and the box holds the label anchor', () => {
  const plan = planFan(6, 640, 600, VW, VH);
  for (const p of plan.items) {
    assert.match(p.path, /^path\('M [^']+ Z'\)$/);
    // A pointed leaf: base, shoulder, tip, shoulder, base, then the curved base back to the start.
    const m = p.path.match(/M (\S+) (\S+) L (\S+) (\S+) L (\S+) (\S+) L (\S+) (\S+) L (\S+) (\S+) A \S+ \S+ 0 [01] 0 (\S+) (\S+) Z/);
    assert.ok(m, 'path has the expected shape');
    const pts = [1, 3, 5, 7, 9].map((i) => [m[i], m[i + 1]].map(Number));
    assert.deepEqual([m[11], m[12]], [m[1], m[2]], 'the curved base closes on the first corner');
    assert.ok(pts.every(([x, y]) => x >= -1 && x <= p.box.width + 1 && y >= -1 && y <= p.box.height + 1), 'path stays in the box');
    assert.ok(p.x >= p.box.left && p.x <= p.box.left + p.box.width, 'anchor x is in the box');
    assert.ok(p.y >= p.box.top && p.y <= p.box.top + p.box.height, 'anchor y is in the box');
    assert.ok(p.box.width < plan.outer * 2 && p.box.height <= plan.outer + 1, 'the box is only the wedge, not the whole ring');
  }
});

test('wedgePath leaves a gap between neighbours', () => {
  const a = wedgePath(34, 112, 180, 150, 3);
  const b = wedgePath(34, 112, 180, 150, 0);
  assert.notEqual(a, b);
});

test('near the top edge the ring turns downwards and keeps left-to-right order', () => {
  const plan = planFan(6, 640, 30, VW, VH);
  assert.ok(insideWindow(plan, 640, 30));
  assert.ok(plan.items.every((p) => p.y > 0), 'every leaf sits below the orb');
  const xs = plan.items.map((p) => p.x);
  assert.deepEqual(xs, [...xs].sort((a, b) => a - b));
});

test('near the left edge the ring is a clean sideways half ring opening to the right', () => {
  const plan = planFan(7, 30, 400, VW, VH);
  assert.ok(insideWindow(plan, 30, 400));
  assert.equal(plan.center, 0);
  assert.equal(plan.span, 180);
  assert.ok(plan.items.every((p) => p.x > 0));
  const ys = plan.items.map((p) => p.y);
  assert.deepEqual(ys, [...ys].sort((a, b) => a - b), 'the order runs top to bottom');
});

test('near the right edge the ring is a clean sideways half ring opening to the left', () => {
  const plan = planFan(7, VW - 30, 400, VW, VH);
  assert.ok(insideWindow(plan, VW - 30, 400));
  assert.equal(plan.center, 180);
  assert.equal(plan.span, 180);
  assert.ok(plan.items.every((p) => p.x < 0));
  const ys = plan.items.map((p) => p.y);
  assert.deepEqual(ys, [...ys].sort((a, b) => a - b), 'the order runs top to bottom');
});

test('the ring only tilts when no straight half ring fits (a corner)', () => {
  for (const [cx, cy] of [[30, 400], [VW - 30, 400], [640, 30], [640, 400], [200, 400]]) {
    assert.ok([0, 90, 180, 270].includes(planFan(7, cx, cy, VW, VH).center), `tilted at ${cx},${cy}`);
  }
});

test('in the bottom-left corner the ring is a narrower arc pointing up and right', () => {
  const plan = planFan(6, 30, VH - 30, VW, VH);
  assert.ok(insideWindow(plan, 30, VH - 30));
  assert.ok(plan.span < 180);
  assert.ok(plan.items.every((p) => p.x > 0 && p.y < 0));
});

test('labels are kept in open space and dropped when a corner leaves the leaves too narrow', () => {
  assert.equal(planFan(6, 640, 600, VW, VH).compact, false);
  assert.equal(planFan(6, 30, VH - 30, VW, VH).compact, true);
  assert.equal(planFan(1, 30, VH - 30, VW, VH).compact, false, 'one leaf is never compact');
});

test('in the top-right corner the ring points down and left', () => {
  const plan = planFan(6, VW - 30, 30, VW, VH);
  assert.ok(insideWindow(plan, VW - 30, 30));
  assert.ok(plan.items.every((p) => p.x < 0 && p.y > 0));
});

test('five leaves (environment and four buttons) fit at every position of the window', () => {
  for (const cx of [30, 320, 640, 960, VW - 30]) {
    for (const cy of [30, 200, 400, 600, VH - 30]) {
      const plan = planFan(5, cx, cy, VW, VH);
      assert.ok(insideWindow(plan, cx, cy), `clipped at ${cx},${cy}`);
      assert.equal(plan.items.length, 5);
    }
  }
});

test('ringBounds covers the orb and the outer edge of the ring', () => {
  const plan = planFan(6, 640, 600, VW, VH);
  const b = ringBounds(plan, 640, 600);
  assert.ok(Math.abs(b.top - (600 - plan.outer)) < 1);
  assert.ok(Math.abs(b.left - (640 - plan.outer)) < 1);
  assert.ok(Math.abs(b.right - (640 + plan.outer)) < 1);
  assert.ok(b.bottom >= 600 && b.bottom <= 601);
});

test('a window too small for the ring still returns a plan', () => {
  const plan = planFan(6, 100, 100, 200, 200);
  assert.equal(plan.items.length, 6);
  assert.ok(plan.items.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && typeof p.path === 'string'));
});

test('the orb has seven fixed leaves with the environment switcher in the middle', () => {
  for (const jcr of [true, false]) {
    const order = orbLeafOrder(jcr);
    assert.equal(order.length, 7);
    assert.equal(order[3], 'env');
    assert.deepEqual(order.slice(0, 3), ['edit', 'view', 'live']);
    assert.deepEqual(order.slice(5), ['props', 'sites']);
  }
});

test('without Developer Mode the JCR leaf is replaced by Copy path', () => {
  assert.equal(orbLeafOrder(true)[4], 'jcr');
  assert.equal(orbLeafOrder(false)[4], 'copy');
  assert.ok(!orbLeafOrder(false).includes('jcr'));
});

test('the environments open on both sides of the switcher, with the extra one on the right', () => {
  assert.deepEqual(envFanOrder(['a', 'b']), ['a', null, 'b']);
  assert.deepEqual(envFanOrder(['a', 'b', 'c']), ['a', null, 'b', 'c']);
  assert.deepEqual(envFanOrder(['a', 'b', 'c', 'd']), ['a', 'b', null, 'c', 'd']);
  assert.equal(envFanOrder(['a', 'b', 'c', 'd', 'e', 'f']).length, 7);
  assert.equal(envFanOrder([]).length, 1);
  assert.ok(MAX_ENV_LEAVES + 1 <= 7, 'the environments and the switcher fit the 7-leaf ring');
});

test('seven leaves fit at every position of the window', () => {
  for (const cx of [30, 320, 640, 960, VW - 30]) {
    for (const cy of [30, 200, 400, 600, VH - 30]) {
      const plan = planFan(7, cx, cy, VW, VH);
      assert.ok(insideWindow(plan, cx, cy), `clipped at ${cx},${cy}`);
      assert.equal(plan.items.length, 7);
    }
  }
});

test('in open space seven leaves still have room for a label', () => {
  const plan = planFan(7, 640, 600, VW, VH);
  assert.equal(plan.compact, false);
  assert.ok(plan.outer <= ORB.maxOuter);
});
