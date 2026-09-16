import test from 'node:test';
import assert from 'node:assert/strict';

import {
  A4_PT,
  DEFAULT_LAYOUT,
  GAP,
  MARGIN,
  MAX_BOXES,
  MAX_COLS,
  MAX_ROWS,
  NOTICE_H,
  addBox,
  normalizeLayout,
  pageCount,
  paginate,
  placeCells,
  removeBox,
  setCount,
} from './pdfLayout.mjs';

const normal = (id) => ({ id, date: `9月 ${id}日` });
const cancelled = (id) => ({ id, date: `9月 ${id}日`, type: 'suspended', label: '國際大會' });

/* ===================== the layout invariants ===================== */

test('the default is two stacked full-width boxes', () => {
  assert.deepEqual(normalizeLayout(DEFAULT_LAYOUT), { rows: 2, cols: 1, count: 2 });
});

test('normalizeLayout never exceeds four boxes', () => {
  for (let rows = 1; rows <= 6; rows += 1) {
    for (let cols = 1; cols <= 6; cols += 1) {
      const l = normalizeLayout({ rows, cols, count: 99 });
      assert.ok(l.rows * l.cols <= MAX_BOXES, `${rows}×${cols} → ${l.rows}×${l.cols}`);
      assert.ok(l.count >= 1 && l.count <= l.rows * l.cols);
    }
  }
});

test('normalizeLayout copes with junk', () => {
  assert.deepEqual(normalizeLayout(undefined), { rows: 2, cols: 1, count: 2 });
  assert.deepEqual(normalizeLayout({ rows: 0, cols: 0, count: 0 }), { rows: 1, cols: 1, count: 1 });
  assert.deepEqual(normalizeLayout({ rows: -3, cols: NaN, count: 2.6 }), { rows: 1, cols: 1, count: 1 });
});

test('the + button prefers stacked rows until a second column is forced', () => {
  // A full-width card is far more readable than a half-width one on A4 portrait,
  // so two weeks stack; only the third box needs the second column.
  assert.deepEqual(addBox({ rows: 1, cols: 1, count: 1 }), { rows: 2, cols: 1, count: 2 });
  assert.deepEqual(addBox({ rows: 2, cols: 1, count: 2 }), { rows: 2, cols: 2, count: 3 });
  assert.deepEqual(addBox({ rows: 2, cols: 2, count: 3 }), { rows: 2, cols: 2, count: 4 });
});

test('the + button stops at four', () => {
  const full = { rows: 2, cols: 2, count: 4 };
  assert.deepEqual(addBox(full), full);
});

test('the − button shrinks the grid with the count', () => {
  assert.deepEqual(removeBox({ rows: 2, cols: 2, count: 4 }), { rows: 2, cols: 2, count: 3 });
  assert.deepEqual(removeBox({ rows: 2, cols: 2, count: 3 }), { rows: 2, cols: 1, count: 2 });
  assert.deepEqual(removeBox({ rows: 2, cols: 1, count: 2 }), { rows: 1, cols: 1, count: 1 });
});

test('2x2 is the ceiling — the picker never offers a third row or column', () => {
  // A week card any smaller than a quarter page is unreadable, so the picker is
  // a 2×2 grid rather than a bigger one with most cells greyed out.
  assert.equal(MAX_ROWS, 2);
  assert.equal(MAX_COLS, 2);
  assert.equal(MAX_BOXES, 4);
  assert.deepEqual(normalizeLayout({ rows: 4, cols: 1, count: 4 }), { rows: 2, cols: 1, count: 2 });
  assert.deepEqual(normalizeLayout({ rows: 1, cols: 3, count: 3 }), { rows: 1, cols: 2, count: 2 });
});

test('the − button stops at one', () => {
  const one = { rows: 1, cols: 1, count: 1 };
  assert.deepEqual(removeBox(one), one);
});

/* ===================== packing ===================== */

test('N weeks per page, for every N up to four', () => {
  const weeks = Array.from({ length: 9 }, (_, i) => normal(i + 1));
  for (let n = 1; n <= 4; n += 1) {
    const layout = setCount(n);
    assert.equal(pageCount(weeks, layout), Math.ceil(9 / n), `count ${n}`);
  }
});

test('a cancelled week does not consume a box', () => {
  // The exception the whole feature hinges on: two real weeks still share the
  // page, and the notice rides along with them.
  const weeks = [normal(1), cancelled(2), normal(3), normal(4)];
  const pages = paginate(weeks, { rows: 2, cols: 1, count: 2 });
  assert.equal(pages.length, 2);
  assert.deepEqual(pages[0].bands, [
    { kind: 'weeks', items: [0] },
    { kind: 'notice', item: 1 },
    { kind: 'weeks', items: [2] },
  ]);
  assert.deepEqual(pages[1].bands, [{ kind: 'weeks', items: [3] }]);
});

test('a run of only cancelled weeks still prints one page', () => {
  const pages = paginate([cancelled(1), cancelled(2)], DEFAULT_LAYOUT);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].bands.length, 2);
});

test('side-by-side columns fill a band before starting the next', () => {
  const weeks = Array.from({ length: 4 }, (_, i) => normal(i + 1));
  const [page] = paginate(weeks, { rows: 2, cols: 2, count: 4 });
  assert.deepEqual(page.bands, [
    { kind: 'weeks', items: [0, 1] },
    { kind: 'weeks', items: [2, 3] },
  ]);
});

test('no weeks, no pages', () => {
  assert.deepEqual(paginate([], DEFAULT_LAYOUT), []);
  assert.deepEqual(paginate(undefined, DEFAULT_LAYOUT), []);
});

/* ===================== placement ===================== */

const within = (r) => (
  r.x >= MARGIN - 0.01
  && r.y >= MARGIN - 0.01
  && r.x + r.w <= A4_PT.w - MARGIN + 0.01
  && r.y + r.h <= A4_PT.h - MARGIN + 0.01
);

const overlaps = (a, b) => (
  a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01
  && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01
);

test('cells stay inside the margins and never overlap', () => {
  const weeks = Array.from({ length: 6 }, (_, i) => (i === 2 ? cancelled(i + 1) : normal(i + 1)));
  const sizes = Object.fromEntries(weeks.map((_, i) => [i, { width: 960, height: 1400 }]));
  for (const layout of [setCount(1), setCount(2), setCount(3), setCount(4), { rows: 1, cols: 2, count: 2 }]) {
    for (const page of paginate(weeks, layout)) {
      const rects = placeCells(page, layout, sizes);
      rects.forEach((r) => assert.ok(within(r), `count ${layout.count}: ${JSON.stringify(r)} escapes the page`));
      for (let i = 0; i < rects.length; i += 1) {
        for (let j = i + 1; j < rects.length; j += 1) {
          assert.ok(!overlaps(rects[i], rects[j]), `count ${layout.count}: cells ${i} and ${j} overlap`);
        }
      }
    }
  }
});

test('a card keeps its aspect ratio', () => {
  const weeks = [normal(1), normal(2)];
  const sizes = { 0: { width: 800, height: 1200 }, 1: { width: 1600, height: 400 } };
  const [page] = paginate(weeks, DEFAULT_LAYOUT);
  const rects = placeCells(page, DEFAULT_LAYOUT, sizes);
  rects.forEach((r) => {
    const source = sizes[r.item];
    assert.ok(
      Math.abs((r.w / r.h) - (source.width / source.height)) < 0.001,
      `week ${r.item} was distorted: ${r.w}×${r.h} from ${source.width}×${source.height}`,
    );
  });
});

test('a notice spans the page only in a single-column layout', () => {
  const weeks = [normal(1), cancelled(2)];
  const [page] = paginate(weeks, DEFAULT_LAYOUT);
  const notice = placeCells(page, DEFAULT_LAYOUT, {}).find((r) => r.kind === 'notice');
  assert.equal(notice.w, A4_PT.w - 2 * MARGIN);
  assert.equal(notice.h, NOTICE_H);
  assert.equal(notice.x, MARGIN);
});

test('with two columns the notice is one column wide, not the whole page', () => {
  // Stretched across a two-column grid it cut the page in half and read as a
  // section divider rather than as one of the weeks.
  const weeks = [normal(1), normal(2), cancelled(3), normal(4)];
  const layout = setCount(4);
  const [page] = paginate(weeks, layout);
  const notice = placeCells(page, layout, {}).find((r) => r.kind === 'notice');
  const cellW = (A4_PT.w - 2 * MARGIN - GAP) / 2;
  assert.ok(Math.abs(notice.w - cellW) < 0.01, `notice is ${notice.w}pt, a column is ${cellW}pt`);
  assert.equal(notice.x, MARGIN);
});

test('a notice image is fitted inside its band, not stretched to it', () => {
  // The notice is a capture of the collapsed card, so it must keep its shape.
  const weeks = [normal(1), cancelled(2)];
  const [page] = paginate(weeks, DEFAULT_LAYOUT);
  const sizes = { 1: { width: 960, height: 200 } };
  const notice = placeCells(page, DEFAULT_LAYOUT, sizes).find((r) => r.kind === 'notice');
  assert.ok(Math.abs((notice.w / notice.h) - (960 / 200)) < 0.001);
  assert.ok(notice.h <= NOTICE_H + 0.01);
  assert.ok(notice.x >= MARGIN - 0.01);
});

test('the notice stays a THIN band, never a card-sized block', () => {
  // A cancelled week carries one line of text. Giving it a block the size of a
  // week card put a slab in the middle of the page.
  const weeks = [normal(1), cancelled(2), normal(3)];
  const layout = setCount(2);
  const sizes = {
    0: { width: 960, height: 1400 },
    1: { width: 960, height: 96 }, // the collapsed one-line strip
    2: { width: 960, height: 1400 },
  };
  const [page] = paginate(weeks, layout);
  const rects = placeCells(page, layout, sizes);
  const notice = rects.find((r) => r.kind === 'notice');
  const week = rects.find((r) => r.kind === 'week');

  assert.ok(notice.h <= NOTICE_H + 0.01, `notice is ${notice.h}pt`);
  assert.ok(notice.h < week.h / 3, `notice (${notice.h}pt) is not thin beside a week (${week.h}pt)`);
});

test('VISUAL UNITY: every block on a page shares one width and one left edge', () => {
  // The failure this pins: the week cards were shrunk to fit the page height
  // while the notice kept the full page width, so a one-line cancelled-week band
  // came out WIDER than the week cards above it.
  const cases = [
    // [layout count, week aspect] — the tall case is the one that forces a shrink
    [2, { width: 960, height: 1400 }],
    [2, { width: 960, height: 370 }],
    [4, { width: 960, height: 370 }],
    [1, { width: 960, height: 1400 }],
  ];
  for (const [count, weekSize] of cases) {
    const weeks = [normal(1), normal(2), cancelled(3), normal(4)];
    const layout = setCount(count);
    const sizes = {
      0: weekSize, 1: weekSize, 2: { width: 960, height: 96 }, 3: weekSize,
    };
    for (const page of paginate(weeks, layout)) {
      const rects = placeCells(page, layout, sizes);
      const widths = rects.map((r) => r.w);
      assert.ok(
        Math.max(...widths) - Math.min(...widths) < 0.01,
        `count ${count}: widths differ — ${widths.map((w) => w.toFixed(1)).join(', ')}`,
      );
      // Left edges line up: every block starts at a column origin, and the
      // notice always uses the first one.
      const lefts = [...new Set(rects.map((r) => Math.round(r.x * 100) / 100))].sort((a, b) => a - b);
      assert.ok(lefts.length <= layout.cols, `count ${count}: ${lefts.length} distinct left edges`);
      const notice = rects.find((r) => r.kind === 'notice');
      if (notice) assert.equal(Math.round(notice.x * 100) / 100, lefts[0]);
    }
  }
});

test('a week with no captured image still reserves its cell', () => {
  // Otherwise one failed capture shuffles every later card into the wrong box.
  const weeks = [normal(1), normal(2)];
  const [page] = paginate(weeks, DEFAULT_LAYOUT);
  const rects = placeCells(page, DEFAULT_LAYOUT, { 0: { width: 960, height: 1400 } });
  assert.equal(rects.length, 2);
  assert.deepEqual(rects.map((r) => r.item), [0, 1]);
  assert.ok(rects[1].w > 0 && rects[1].h > 0);
});

test('bands are sized to the cards, not split into equal slabs', () => {
  // A week card is much wider than it is tall, so in a two-column cell it is
  // width-constrained. Equal bands left a 2×2 page mostly white; bands should
  // hug the cards and the block should sit centred.
  const weeks = Array.from({ length: 4 }, (_, i) => normal(i + 1));
  const layout = { rows: 2, cols: 2, count: 4 };
  const sizes = Object.fromEntries(weeks.map((_, i) => [i, { width: 960, height: 370 }]));
  const [page] = paginate(weeks, layout);
  const rects = placeCells(page, layout, sizes);

  const cellW = (A4_PT.w - 2 * MARGIN - GAP) / 2;
  const expectedH = (cellW * 370) / 960;
  rects.forEach((r) => assert.ok(Math.abs(r.h - expectedH) < 0.01, `card is ${r.h}pt, natural is ${expectedH}pt`));

  // Centred: the gap above the first row equals the gap below the last.
  const top = Math.max(...rects.map((r) => r.y + r.h));
  const bottom = Math.min(...rects.map((r) => r.y));
  assert.ok(Math.abs((A4_PT.h - top) - bottom) < 0.01, 'block is not vertically centred');
});

test('cards too tall for the page are shrunk to fit, still in aspect', () => {
  const weeks = Array.from({ length: 4 }, (_, i) => normal(i + 1));
  const layout = setCount(2);
  const sizes = Object.fromEntries(weeks.map((_, i) => [i, { width: 400, height: 2000 }]));
  const [page] = paginate(weeks, layout);
  const rects = placeCells(page, layout, sizes);
  const used = rects.reduce((t, r) => t + r.h, 0) + (rects.length - 1) * GAP;
  assert.ok(used <= A4_PT.h - 2 * MARGIN + 0.01, `content is ${used}pt tall`);
  rects.forEach((r) => assert.ok(Math.abs((r.w / r.h) - (400 / 2000)) < 0.001));
});

test('notices shrink the week bands rather than pushing them off the page', () => {
  const weeks = [normal(1), cancelled(2), normal(3)];
  const [page] = paginate(weeks, DEFAULT_LAYOUT);
  const rects = placeCells(page, DEFAULT_LAYOUT, {});
  const used = rects.reduce((total, r) => total + r.h, 0) + (rects.length - 1) * GAP;
  assert.ok(used <= A4_PT.h - 2 * MARGIN + 0.01, `content is ${used}pt tall`);
});
