import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spiralPoints, spiralPath, logoSpiralPaths, LOGO_SPIRAL } from '../src/shared/spiral.js';

test('spiralPath: the orb spiral keeps its shape (thick strand starts at the top, 10px above the centre)', () => {
  const d = spiralPath(-1, 22, 22, 12.2, 2.2);
  assert.ok(d.startsWith('M22.00 12.00 L'));
  assert.ok(d.endsWith('Z'));
  assert.equal(d.split(' L').length, 120);
});

test('spiralPoints: thin strand bulges at the top, thick one at the diagonals', () => {
  const thin  = spiralPoints(1, 0, 0, 10, 2, 120);
  const thick = spiralPoints(-1, 0, 0, 10, 2, 120);
  assert.ok(Math.abs(thin[0][1] + 12) < 1e-9);     // top: 12 above the centre
  assert.ok(Math.abs(thick[0][1] + 8) < 1e-9);     // top: 8 above the centre (a dip)
  const diag = thick[15];                          // 45°: t = π/4 → cos(4t) = -1 → radius 12
  assert.ok(Math.abs(Math.hypot(diag[0], diag[1]) - 12) < 1e-9);
});

test('logoSpiralPaths: two white strands that fit inside the 24 × 24 box with their stroke', () => {
  const svg = logoSpiralPaths();
  assert.equal((svg.match(/<path /g) || []).length, 2);
  assert.ok(!svg.includes('NaN'));
  const { r, amp, thick } = LOGO_SPIRAL;
  assert.ok(12 + r + amp + thick / 2 <= 24);
});
