'use client';

// THE one place that turns rendered DOM into images and images into a
// downloaded PDF. Nothing else in the app may import `html-to-image` or write
// PDF bytes — `printPdf.guard.test.mjs` fails the build if it does.
//
// Every visual export is a screenshot of REAL markup placed on paper, so the
// print output always matches what the component draws. This module owns the
// capture settings, the capture→bytes conversion and the download; the geometry
// lives in `pdfLayout.mjs` (`planCapturePages` / `paginate` / `placeCells`, pure
// and unit-tested) and the file bytes in `pdfWriter.mjs` (`writePdf`). Those two
// are low-level helpers: only this module imports `writePdf`/`singleImagePages`.

import { planCapturePages } from './pdfLayout.mjs';
import { dataUrlToUint8, singleImagePages, writePdf } from './pdfWriter.mjs';

/**
 * The off-screen container every PDF capture must come from. Defined here (and
 * not only in the React component) so the guard below can be used from plain
 * modules; `PrintStage.js` renders the matching element.
 */
export const PRINT_STAGE_SELECTOR = '.print-stage';

/* ===================== capture ===================== */

// Pin html-to-image to the element's real rendered box so the capture has no
// extra whitespace on the right (mobile screenshots were padded out otherwise).
export function captureBox(node) {
  const rect = node.getBoundingClientRect();
  return { width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
}

// The ONLY set of html-to-image options. `background` is what gets painted
// behind the capture — white for a print sheet, the page colour for a chat
// image, omitted for the live card (which paints its own).
async function capture(node, { format = 'jpeg', background, quality = 0.95 } = {}) {
  const opts = { pixelRatio: 2, skipFonts: false, ...captureBox(node) };
  if (background) opts.backgroundColor = background;
  if (format === 'png') {
    const { toPng } = await import('html-to-image');
    return toPng(node, opts);
  }
  const { toJpeg } = await import('html-to-image');
  return toJpeg(node, { ...opts, quality });
}

export function nodeToJpegDataUrl(node, background) {
  return capture(node, { format: 'jpeg', background });
}

export function nodeToPngDataUrl(node, background) {
  return capture(node, { format: 'png', background });
}

// One node → one encoded image, ready for a download, a zip entry or the
// clipboard.
export async function nodeToImageBlob(node, opts) {
  const dataUrl = await capture(node, opts);
  return (await fetch(dataUrl)).blob();
}

export async function downloadNodeImage(node, filename, opts = {}) {
  const blob = await nodeToImageBlob(node, opts);
  triggerDownload(blob, filename);
}

export async function copyNodeImageToClipboard(node, opts = {}) {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('目前瀏覽器不支援圖片剪貼簿。');
  }
  const blob = await nodeToImageBlob(node, { format: 'png', ...opts });
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

/* ===================== download / image reading ===================== */

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Reads a JPEG data URL into { bytes, width, height } (used for DOM screenshots
// where we don't already have the source canvas dimensions).
export async function jpegDataUrlToImage(dataUrl) {
  const bytes = dataUrlToUint8(dataUrl);
  const dims = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('無法讀取圖片尺寸。'));
    img.src = dataUrl;
  });
  return { bytes, width: dims.width, height: dims.height };
}

/* ===================== stage guard ===================== */

// Throws unless every node is inside a PrintStage, so an export can never
// quietly screenshot the live card (the phone layout at ≤720px, carrying edit
// controls in edit mode). DOM-free callers pass nodes only; the check uses
// Element.closest.
export function ensurePrintStage(nodes) {
  const list = (nodes ?? []).filter(Boolean);
  if (!list.length) throw new Error('沒有可匯出的內容。');
  const outside = list.filter((node) => !node.closest?.(PRINT_STAGE_SELECTOR));
  if (outside.length) {
    throw new Error('PDF 匯出必須使用列印區（.print-stage）的內容。');
  }
  return list;
}

/* ===================== the PDF export ===================== */

/**
 * Captures every node and downloads them as one PDF.
 *
 * @param nodes   rendered DOM nodes to screenshot, in page order.
 * @param filename what the download is called.
 * @param perPage captures per A4 page (default 1). Each is contain-fitted inside
 *                the printable margin and never drawn larger than its natural
 *                size on paper.
 * @param pageFit 'a4' (default) fills every page to A4; 'fill' sizes each page to
 *                its capture's aspect ratio at A4 width, edge to edge with no
 *                margin (the 指派分布 export).
 * @param layout / subjects / isNotice  the 版面 grid: packs week cards N per
 *                page through `planCapturePages`, with a cancelled week riding
 *                along as a full-width notice band (`isNotice(week)`).
 */
export async function exportCapturesPdf(nodes, {
  filename,
  perPage = 1,
  background = '#ffffff',
  pageFit = 'a4',
  layout,
  subjects,
  isNotice,
} = {}) {
  const list = nodes ?? [];
  if (!list.some(Boolean)) throw new Error('沒有可匯出的內容。');

  const images = {};
  for (let i = 0; i < list.length; i += 1) {
    const node = list[i];
    if (!node) continue;
    // eslint-disable-next-line no-await-in-loop
    images[i] = await jpegDataUrlToImage(await nodeToJpegDataUrl(node, background));
  }

  const captured = Object.keys(images);
  if (!captured.length) throw new Error('沒有可匯出的內容。');

  let pages;
  if (pageFit === 'fill') {
    // One card per page, page height following the card (指派分布).
    pages = singleImagePages(captured.map((i) => images[i]));
  } else {
    // Original node indices are kept: `subjects` is index-aligned with `nodes`,
    // so a failed capture must leave a gap, not shift the later cards.
    const sizes = Object.fromEntries(
      captured.map((i) => [i, { width: images[i].width, height: images[i].height }]),
    );
    pages = planCapturePages(sizes, { perPage, layout, subjects, isSuspended: isNotice }).map((page) => ({
      w: page.w,
      h: page.h,
      images: page.cells
        .filter((cell) => images[cell.item])
        .map((cell) => ({ img: images[cell.item], x: cell.x, y: cell.y, w: cell.w, h: cell.h })),
    }));
  }
  if (!pages.length) throw new Error('沒有可匯出的內容。');
  // Paper white behind the images, not the app's warm background.
  const blob = new Blob([writePdf(pages, [1, 1, 1])], { type: 'application/pdf' });
  triggerDownload(blob, filename ?? 'export.pdf');
}

// The same export, refusing anything that is not in a PrintStage. The meetings
// page (週中 / 週末) and the 服務 / 書刊 sheets use this.
export async function exportStagePdf(nodes, options = {}) {
  return exportCapturesPdf(ensurePrintStage(nodes), options);
}

/* ===================== print windows (列印) ===================== */

// The ONE place a print window is opened. Callers never touch window.open.
function openPrintWindow(html) {
  // No `noopener`/`noreferrer`: those make window.open() return null, so there is
  // no handle to write the document into and the window opens blank.
  const popup = window.open('', '_blank', 'width=1000,height=900');
  if (!popup) throw new Error('瀏覽器阻擋了列印視窗。');
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  return popup;
}

// One A4 page per capture, for 列印 on the 匯出 page. The capture is the stage
// card, exactly like the PDF, so the printed page and the downloaded PDF match.
export async function printCaptures(nodes) {
  const list = (nodes ?? []).filter(Boolean);
  if (!list.length) throw new Error('沒有可列印的週次。');
  const urls = [];
  for (const node of list) {
    // eslint-disable-next-line no-await-in-loop
    urls.push(await nodeToJpegDataUrl(node, '#ffffff'));
  }
  const imgs = urls.map((u) => `<section class="page"><img src="${u}" /></section>`).join('');
  return openPrintWindow(`<!doctype html><html><head><meta charset="utf-8"><title>週中</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      @page { size: A4 portrait; margin: 0; }
      body { background: #ecebe7; }
      .page { width: 210mm; height: 297mm; padding: 8mm; display: flex; align-items: center; justify-content: center; overflow: hidden; break-after: page; page-break-after: always; background: #fff; }
      .page:last-child { break-after: auto; page-break-after: auto; }
      img { display: block; max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; }
      @media screen { .page { margin: 12px auto; box-shadow: 0 2px 12px #0002; } }
    </style></head><body>${imgs}
    <script>setTimeout(() => print(), 250);<\/script>
    </body></html>`);
}

// Prints LIVE markup (a long table the browser should paginate itself, like the
// 書刊 S-28 sheet) in a window that reuses the app's own stylesheets, so the
// printed page looks exactly like the one on screen. Elements marked
// `data-print-hide` (toolbars, back buttons) are dropped first.
export function printNodes(nodes, { title } = {}) {
  const list = (nodes ?? []).filter(Boolean);
  if (!list.length) throw new Error('沒有可列印的內容。');
  // The popup is about:blank, so relative stylesheet hrefs have to be made
  // absolute or the app's CSS never loads and the printed page is unstyled.
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')]
    .map((el) => (el.tagName === 'LINK'
      ? `<link rel="stylesheet" href="${new URL(el.getAttribute('href'), document.baseURI).href}">`
      : el.outerHTML))
    .join('\n');
  const markup = list.map((node) => {
    const clone = node.cloneNode(true);
    clone.querySelectorAll('[data-print-hide]').forEach((el) => el.remove());
    return clone.outerHTML;
  }).join('');
  return openPrintWindow(`<!doctype html><html><head><meta charset="utf-8">
    <title>${title ?? document.title}</title>${styles}</head>
    <body>${markup}
    <script>setTimeout(() => print(), 250);<\/script>
    </body></html>`);
}

