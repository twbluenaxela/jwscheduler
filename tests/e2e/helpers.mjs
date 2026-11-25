// Shared plumbing for the PDF/print e2e suites.
//
// Each suite boots one `next dev`, drives the fixture route with Playwright, then
// inspects the downloaded bytes. The server lifecycle, the artifact directory and
// the tiny PDF scanner live here so the three suites cannot drift apart (a PDF
// page counter that disagrees with another test's is worse than no test).

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');
export const ARTIFACTS = path.join(HERE, 'artifacts');

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

export async function waitForServer(url, attempts = 120) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return;
    } catch {
      // Server not up yet, or still compiling the route.
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Server did not answer 200 at ${url}`);
}

// Boots `next dev` on a free port and waits until `fixturePath` answers 200.
// Base URL can be pre-seeded with BASE_URL to test an already-running server.
// `localhost`, not 127.0.0.1: Next dev blocks cross-origin dev resources for a
// bare IP host, and the blocked HMR client leaves the page unhydrated.
export async function startDevServer(fixturePath, baseUrl = process.env.BASE_URL ?? '') {
  if (!baseUrl) {
    const port = await freePort();
    baseUrl = `http://localhost:${port}`;
    const server = spawn('npx', ['next', 'dev', '-p', String(port)], {
      cwd: ROOT,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    });
    const stop = () => {
      if (!server.pid) return;
      try {
        process.kill(-server.pid, 'SIGTERM');
      } catch {
        // Already gone.
      }
    };
    await waitForServer(`${baseUrl}${fixturePath}`);
    return { baseUrl, stop };
  }
  await waitForServer(`${baseUrl}${fixturePath}`);
  return { baseUrl, stop: () => {} };
}

export function ensureArtifacts() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  return ARTIFACTS;
}

/* ===================== PDF scanning ===================== */

export function countPdfPages(bytes) {
  return (Buffer.from(bytes).toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

export function pdfImageSizes(bytes) {
  const text = Buffer.from(bytes).toString('latin1');
  const sizes = [];
  const re = /\/Subtype\s*\/Image\s*\/Width\s+(\d+)\s*\/Height\s+(\d+)/g;
  let match = re.exec(text);
  while (match) {
    sizes.push({ width: Number(match[1]), height: Number(match[2]) });
    match = re.exec(text);
  }
  return sizes;
}

// Reads a downloaded PDF and checks the two things that break silently: the file
// is really a PDF, and it has the expected number of pages/images.
export function readPdf(filePath, { pages, images } = {}) {
  const bytes = fs.readFileSync(filePath);
  const name = path.basename(filePath);
  assert.equal(bytes.subarray(0, 5).toString('latin1'), '%PDF-', `${name} is not a PDF`);
  const pageCount = countPdfPages(bytes);
  const imageSizes = pdfImageSizes(bytes);
  if (pages != null) assert.equal(pageCount, pages, `${name}: expected ${pages} page(s), got ${pageCount}`);
  if (images != null) {
    assert.equal(imageSizes.length, images, `${name}: expected ${images} embedded image(s), got ${imageSizes.length}`);
  }
  return { bytes, pageCount, images: imageSizes };
}

// Each embedded image must be a screenshot of one node, so its aspect ratio has
// to match that node's on-screen ratio (within a couple of percent).
export function assertImageRatios(imageSizes, nodeSizes, label) {
  imageSizes.forEach((img, index) => {
    const ratio = img.width / img.height;
    const closest = Math.min(...nodeSizes.map((node) => {
      const nodeRatio = node.width / node.height;
      return Math.abs(nodeRatio - ratio) / nodeRatio;
    }));
    assert.ok(
      closest <= 0.02,
      `${label}: image ${index} aspect ratio is ${(closest * 100).toFixed(1)}% off a captured node`,
    );
  });
}

// Hides Next's dev-only overlay so it is never baked into an element screenshot.
export const HIDE_DEV_CHROME = 'nextjs-portal { display: none !important; }';

/* ===================== deterministic node capture ===================== */

// Screenshots of a print node must be exactly that node's box: its own title at
// the top and nothing from the sibling below it. Playwright's element
// screenshot cannot guarantee that here. A print node is usually taller than
// the viewport, so Chromium scrolls it into view and stitches several frames;
// the page above the stage may re-lay-out between the geometry read and the
// stitch (the 週末 fixture's 42 mobile cards each lose a text line box on the
// first non-zero scroll, shifting the whole stage up 42px), and the crop then
// follows the OLD box — the title falls off the top and the next chunk's title
// appears at the bottom. That is the phone-weekend-page-0.png bug.
//
// So: settle layout, force the lazy re-layout to happen while nothing is being
// measured, then take ONE full-page screenshot and crop it to the node's own
// page box. No element scrolling, no stitching, no clip/geometry drift.
export async function settleLayout(page) {
  await page.evaluate(async () => {
    await document.fonts?.ready;
    // Two frames: one for the style/layout flush, one for the paint it causes.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

// Puts an off-screen stage back into the document flow so it can be
// photographed, then settles the layout and warms up any lazy re-layout by
// scrolling to the stage and back. Returns nothing; the caller measures after.
export async function prepareStageForCapture(page, selector) {
  await page.addStyleTag({
    content: `${selector} { position: static !important; left: auto !important; top: auto !important; pointer-events: auto !important; }`,
  });
  await page.addStyleTag({ content: HIDE_DEV_CHROME });
  await settleLayout(page);
  await page.evaluate(async (sel) => {
    const node = document.querySelector(sel);
    if (!node) return;
    // Warm-up: first scroll past the stage is what triggers the one-time
    // re-layout (lazy webfont metrics). Do it before anything is measured.
    const target = node.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, Math.max(0, target - 24));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.scrollTo(0, 0);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, selector);
  await settleLayout(page);
}

// Captures `node` and writes `filePath`. Throws if the node moved while the
// screenshot was taken — the check the old element screenshot silently lacked.
export async function captureNodePng(page, node, filePath) {
  const boxOf = () => {
    const rect = node.getBoundingClientRect();
    return {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
    };
  };

  const before = await settleAndMeasure(page, boxOf);
  const bytes = await page.screenshot({
    fullPage: true,
    clip: { x: before.x, y: before.y, width: before.width, height: before.height },
  });
  const after = await settleAndMeasure(page, boxOf);

  assert.ok(
    Math.abs(after.y - before.y) < 1 && Math.abs(after.height - before.height) < 1,
    `${path.basename(filePath)}: the node moved during capture `
      + `(top ${before.y} → ${after.y}, height ${before.height} → ${after.height}); `
      + 'the screenshot is not exactly this node\'s box',
  );

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, bytes);
  return { ...before, bytes };
}

async function settleAndMeasure(page, boxOf) {
  await settleLayout(page);
  return page.evaluate(boxOf);
}

/* ===================== PNG pixel checks ===================== */

// Minimal PNG reader (8-bit, non-interlaced) so a test can assert what is
// actually in the picture — e.g. that the first 40px of a page capture is the
// title band and not the table's dark header row.
export function decodePng(bytes) {
  const buffer = Buffer.from(bytes);
  assert.equal(buffer.readUInt32BE(0), 0x89504e47, 'not a PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      assert.equal(data[12], 0, 'interlaced PNGs are not supported');
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  assert.equal(depth, 8, `unsupported PNG bit depth ${depth}`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let cursor = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor];
    cursor += 1;
    const line = raw.subarray(cursor, cursor + stride);
    cursor += stride;
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = prev[x];
      const upLeft = x >= channels ? prev[x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value += pa <= pb && pa <= pc ? left : (pb <= pc ? up : upLeft);
      }
      row[x] = value & 0xff;
    }
  }
  return {
    width,
    height,
    luma(x, y) {
      const i = (y * width + x) * channels;
      return 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
    },
    rowMeanLuma(y) {
      let sum = 0;
      for (let x = 0; x < width; x += 1) sum += this.luma(x, y);
      return sum / width;
    },
  };
}

// The bug in one assertion: in a correct page capture the first band of the
// image is the white title block (title text is dark, but only a few strokes —
// the row MEAN stays bright). When the capture is offset by a title height the
// table's dark header row slides into the top and the row mean collapses.
// `maxDarkRows` allows one antialiasing row.
export function assertCleanTopBand(image, { band = 40, minRowMean = 140, maxDarkRows = 2 } = {}) {
  const dark = [];
  for (let y = 0; y < Math.min(band, image.height); y += 1) {
    const mean = image.rowMeanLuma(y);
    if (mean < minRowMean) dark.push(`${y}:${mean.toFixed(0)}`);
  }
  assert.ok(
    dark.length <= maxDarkRows,
    `top ${band}px of the capture is not the title band — dark rows at ${dark.join(', ')} `
      + '(the crop is offset; a header row from this or a sibling chunk leaked in)',
  );
}

// Reads the width out of a JPEG's SOF marker, so a JPG export can be checked
// without an image decoder (the sheet is captured at 2× the stage width).
export function jpegWidth(bytes) {
  const buffer = Buffer.from(bytes);
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error('not a JPEG');
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    // SOF0..SOF15, excluding DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return buffer.readUInt16BE(offset + 7);
    }
    const length = buffer.readUInt16BE(offset + 2);
    offset += 2 + length;
  }
  throw new Error('no JPEG SOF marker');
}
