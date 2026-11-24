#!/usr/bin/env node
/**
 * @file Generates the PNG icons (the AEM-style spiral on a rounded tile) for active and disabled states.
 * Writes icons/icon16.png, icon32.png, icon48.png, icon128.png (Active)
 * and icons/icon-disabled16.png, icon-disabled32.png, icon-disabled48.png, icon-disabled128.png (Disabled).
 *
 * The spiral comes from src/shared/spiral.js, the same curves as the toolbar, popup, Settings logo and the orb.
 * Uses supersampled rendering with optical sizing for crispness at 16px to 128px.
 * Zero external dependencies (pure Node.js Buffer + zlib).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Super-sampling factor for buttery-smooth antialiasing
const SS = 4;

/**
 * Distance from point (px, py) to the closed polyline `pts` ([[x, y], ...]).
 */
function distanceToClosedPath(px, py, pts) {
  let best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [x1, y1] = pts[j];
    const [x2, y2] = pts[i];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
    const d = Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    if (d < best) best = d;
  }
  return best;
}

/**
 * Distance from point (x, y) to a rounded rectangle of (w, h) with radius r.
 */
function roundedRectDistance(x, y, w, h, r) {
  const cx = Math.max(r, Math.min(x, w - r));
  const cy = Math.max(r, Math.min(y, h - r));
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (x >= r && x <= w - r && y >= r && y <= h - r) return 0;
  if ((x < r || x > w - r) && (y < r || y > h - r)) return dist - r;
  return 0;
}

/**
 * Render icon buffer at target size (size x size).
 * @param {number} size - Output pixel dimension (16, 32, 48, 128)
 * @param {boolean} disabled - True for disabled/greyscale state
 */
function renderIconPixels(size, disabled, spiral) {
  const width = size;
  const height = size;
  const sw = width * SS;
  const sh = height * SS;

  // Optical adjustment: bolder strands on 16px/32px for crisp readability in the toolbar
  const isSmall = size <= 32;
  const unit = sw / 24;                       // supersampled pixels per unit of the 24 x 24 logo box
  const fit = 0.86;                           // the spiral fills this share of the logo box, so the tile keeps a margin
  const thinW  = (isSmall ? 1.7 : 1.3) * unit;
  const thickW = (isSmall ? 3.0 : 2.4) * unit;
  const toTile = ([x, y]) => [(12 + (x - 12) * fit) * unit, (12 + (y - 12) * fit) * unit];
  const thinPts  = spiral.spiralPoints(1,  12, 12, spiral.LOGO_SPIRAL.r, spiral.LOGO_SPIRAL.amp, 240).map(toTile);
  const thickPts = spiral.spiralPoints(-1, 12, 12, spiral.LOGO_SPIRAL.r, spiral.LOGO_SPIRAL.amp, 240).map(toTile);

  const cornerRadius = sw * 0.22; // Modern squircle radius
  const ssPixels = new Float32Array(sw * sh * 4);

  // Colors:
  // Active: Vibrant Adobe Red Gradient (#FA1800 top-left to #A8000A bottom-right)
  // Disabled: Slate Greyscale Gradient (#6E7781 top-left to #3D444D bottom-right)
  const gradStart = disabled ? [110, 119, 129] : [250, 24, 0];
  const gradEnd   = disabled ? [61, 68, 77]    : [168, 0, 10];

  for (let sy = 0; sy < sh; sy++) {
    const tY = sy / sh;
    for (let sx = 0; sx < sw; sx++) {
      const tX = sx / sw;
      const t = (tX * 0.6 + tY * 0.4);
      const idx = (sy * sw + sx) * 4;

      const d = roundedRectDistance(sx + 0.5, sy + 0.5, sw, sh, cornerRadius);
      if (d > 0.8) {
        ssPixels[idx + 3] = 0;
        continue;
      }

      // Base background color with smooth edge antialiasing
      const alphaEdge = d <= 0 ? 1 : Math.max(0, 1 - d);
      let r = gradStart[0] + (gradEnd[0] - gradStart[0]) * t;
      let g = gradStart[1] + (gradEnd[1] - gradStart[1]) * t;
      let b = gradStart[2] + (gradEnd[2] - gradStart[2]) * t;

      // Subtle top inner highlight line for depth
      if (sy < sh * 0.12 && d <= 0 && !disabled) {
        const hl = (1 - (sy / (sh * 0.12))) * 28;
        r = Math.min(255, r + hl);
        g = Math.min(255, g + hl);
        b = Math.min(255, b + hl);
      }

      // The spiral: the thick strand is solid, the thin one a little softer (as in the toolbar logo)
      const x = sx + 0.5;
      const y = sy + 0.5;
      const inThick = distanceToClosedPath(x, y, thickPts) <= thickW / 2;
      const inThin  = !inThick && distanceToClosedPath(x, y, thinPts) <= thinW / 2;

      if (inThick || inThin) {
        const symbolAlpha = disabled ? (inThick ? 0.6 : 0.5) : (inThick ? 1.0 : 0.85);
        r = r * (1 - symbolAlpha) + 255 * symbolAlpha;
        g = g * (1 - symbolAlpha) + 255 * symbolAlpha;
        b = b * (1 - symbolAlpha) + 255 * symbolAlpha;
      }

      ssPixels[idx]     = r;
      ssPixels[idx + 1] = g;
      ssPixels[idx + 2] = b;
      ssPixels[idx + 3] = alphaEdge * 255;
    }
  }

  // Downsample to target size
  const outPixels = Buffer.alloc(width * height * 4);
  const ssArea = SS * SS;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const sIdx = ((y * SS + dy) * sw + (x * SS + dx)) * 4;
          const a = ssPixels[sIdx + 3] / 255;
          rSum += ssPixels[sIdx] * a;
          gSum += ssPixels[sIdx + 1] * a;
          bSum += ssPixels[sIdx + 2] * a;
          aSum += ssPixels[sIdx + 3];
        }
      }

      const avgA = aSum / ssArea;
      const oIdx = (y * width + x) * 4;

      if (avgA > 0.001) {
        outPixels[oIdx]     = Math.round(rSum / (aSum / 255));
        outPixels[oIdx + 1] = Math.round(gSum / (aSum / 255));
        outPixels[oIdx + 2] = Math.round(bSum / (aSum / 255));
        outPixels[oIdx + 3] = Math.round(avgA);
      } else {
        outPixels[oIdx]     = 0;
        outPixels[oIdx + 1] = 0;
        outPixels[oIdx + 2] = 0;
        outPixels[oIdx + 3] = 0;
      }
    }
  }

  return outPixels;
}

// CRC-32 table for PNG chunk encoding
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.allocUnsafe(4);
  len.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crc = crc32(crcInput);
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([len, typeBytes, data, crcBuf]);
}

function writePng(filePath, size, disabled, spiral) {
  const pixels = renderIconPixels(size, disabled, spiral);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8]  = 8;  // bit depth
  ihdr[9]  = 6;  // color type: RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  // Build scanlines with filter byte 0 (None)
  const scanlines = Buffer.allocUnsafe(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    scanlines[y * (1 + size * 4)] = 0; // filter None
    pixels.copy(scanlines, y * (1 + size * 4) + 1, y * size * 4, (y + 1) * size * 4);
  }

  const compressed = zlib.deflateSync(scanlines, { level: 9 });

  const png = Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  fs.writeFileSync(filePath, png);
}

async function main() {
  const spiral = await import('./src/shared/spiral.js');
  const iconsDir = path.join(__dirname, 'icons');
  if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

  const sizes = [16, 32, 48, 128];

  // Generate active icons
  sizes.forEach((size) => {
    const filePath = path.join(iconsDir, `icon${size}.png`);
    writePng(filePath, size, false, spiral);
    console.log(`✓ Active icon: ${filePath}`);
  });

  // Generate disabled/inactive icons
  sizes.forEach((size) => {
    const filePath = path.join(iconsDir, `icon-disabled${size}.png`);
    writePng(filePath, size, true, spiral);
    console.log(`✓ Disabled icon: ${filePath}`);
  });
}

main();
