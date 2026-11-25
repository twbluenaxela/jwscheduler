// Pure helpers for the 週末 print/PDF capture.
//
// The weekend table is taller than one A4 page once a service year is loaded, so
// the export renders it as page-sized chunks — each its own table with the
// header repeated — and puts one capture on each page. The split lives here (and
// not in the component) so the e2e test can compute the expected page count from
// the same function the export uses instead of hard-coding a number.

// A chunk of this many rows prints at a comfortable size: the capture is 960 px
// wide, which is scaled to A4's text column, and a full sheet holds roughly 26
// rows plus the repeated title and header before the table has to be shrunk to
// fit the page. Below that the page keeps white space at the bottom for nothing;
// above it the whole table gets smaller — including the type.
export const WEEKEND_PRINT_ROWS_PER_PAGE = 26;

export function weekendPrintChunks(rows, perPage = WEEKEND_PRINT_ROWS_PER_PAGE) {
  const list = rows ?? [];
  const size = Math.max(1, Math.round(perPage));
  const chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  return chunks;
}
