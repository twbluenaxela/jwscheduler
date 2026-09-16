// A minimal PDF writer: pages of placed JPEG images, no external library.
//
// Extracted from midweekExport.js so the N-weeks-per-page export can put SEVERAL
// images on one page. The old writer hard-coded a stride of three objects per
// page (page, content, one image), which only works at one image per page — with
// a grid the object numbers have to be allocated as they are written, or the
// xref table points at the wrong bytes and readers reject the file.

const enc = new TextEncoder();

function dataUrlToUint8(dataUrl) {
  const base64 = String(dataUrl).split(',')[1] || '';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export { dataUrlToUint8 };

/**
 * Writes a PDF.
 *
 * @param pages [{ w, h, images: [{ img, x, y, w, h }] }] — page size and image
 *   placements in PDF points, origin bottom-left. `img` is
 *   { bytes, width, height } as returned by jpegDataUrlToImage.
 * @param background optional [r, g, b] 0–1, painted behind each page's images.
 */
export function writePdf(pages, background = null) {
  const chunks = [];
  let offset = 0;
  const offsets = [];

  const push = (data) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    chunks.push(bytes);
    offset += bytes.length;
  };

  // Objects are numbered as they are allocated, not by a fixed stride, so a page
  // may carry any number of images.
  let nextObj = 3; // 1 = catalog, 2 = page tree
  const alloc = () => { const n = nextObj; nextObj += 1; return n; };
  const startObj = (n) => { offsets[n] = offset; push(`${n} 0 obj\n`); };

  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  // Lay out the object numbers first so the page tree can name its kids.
  const plan = pages.map((page) => ({
    page,
    pageNum: alloc(),
    contentNum: alloc(),
    imageNums: (page.images ?? []).map(() => alloc()),
  }));

  startObj(1);
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  startObj(2);
  push(`<< /Type /Pages /Kids [${plan.map((p) => `${p.pageNum} 0 R`).join(' ')}] /Count ${plan.length} >>\nendobj\n`);

  plan.forEach(({ page, pageNum, contentNum, imageNums }) => {
    const images = page.images ?? [];
    const pageW = page.w;
    const pageH = page.h;
    const xobjects = imageNums.map((n, i) => `/Im${i} ${n} 0 R`).join(' ');

    startObj(pageNum);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Resources << /XObject << ${xobjects} >> >> /Contents ${contentNum} 0 R >>\nendobj\n`);

    const ops = [];
    if (background) {
      const [r, g, b] = background;
      ops.push(`${r} ${g} ${b} rg 0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)} re f`);
    }
    images.forEach((placed, i) => {
      // `cm` maps the image's unit square onto its rectangle, so width/height go
      // on the diagonal and x/y in the translation slots.
      ops.push(`q ${placed.w.toFixed(2)} 0 0 ${placed.h.toFixed(2)} ${placed.x.toFixed(2)} ${placed.y.toFixed(2)} cm /Im${i} Do Q`);
    });
    const content = ops.join('\n');

    startObj(contentNum);
    push(`<< /Length ${enc.encode(content).length} >>\nstream\n`);
    push(content);
    push('\nendstream\nendobj\n');

    images.forEach((placed, i) => {
      const { img } = placed;
      startObj(imageNums[i]);
      push(`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`);
      push(img.bytes);
      push('\nendstream\nendobj\n');
    });
  });

  const totalObjs = nextObj - 1;
  const xrefOffset = offset;
  const objCount = totalObjs + 1;
  push(`xref\n0 ${objCount}\n`);
  push('0000000000 65535 f \n');
  for (let n = 1; n <= totalObjs; n += 1) {
    push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${objCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

// The original one-image-per-page behaviour, unchanged: A4 width, page height
// following the image's aspect ratio so the card fills the page edge to edge
// with no letterboxing. Used by the meetings page, the 匯出 page's per-week PDF
// and the 指派分布 export.
export const PAGE_W = 595.28;

export function singleImagePages(images) {
  return (images ?? []).map((img) => {
    const w = PAGE_W;
    const h = PAGE_W * (img.height / img.width);
    return { w, h, images: [{ img, x: 0, y: 0, w, h }] };
  });
}
