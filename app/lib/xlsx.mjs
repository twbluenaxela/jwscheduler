// Low-level XLSX (OOXML) writing shared by the midweek and weekend exporters.
//
// `.mjs` so Node can load it: the styled midweek workbook's pagination is
// unit-tested and verified against a real spreadsheet renderer, which means the
// whole file has to be buildable outside the browser.

import JSZip from 'jszip';

export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function cellRef(colIndex, rowIndex) {
  let n = colIndex;
  let letters = '';
  while (n > 0) {
    const mod = (n - 1) % 26;
    letters = String.fromCharCode(65 + mod) + letters;
    n = Math.floor((n - mod) / 26);
  }
  return `${letters}${rowIndex}`;
}

/* ===================== Plain XLSX (used by the weekend export) ===================== */

export function buildPlainSheetXml(rows, cols = [18, 18, 48, 36, 22, 18]) {
  let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  xml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ';
  xml += 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
  xml += '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  xml += '<sheetFormatPr defaultRowHeight="20"/>';
  xml += '<cols>';
  cols.forEach((width, idx) => {
    xml += `<col min="${idx + 1}" max="${idx + 1}" width="${width}" customWidth="1"/>`;
  });
  xml += '</cols>';
  xml += '<sheetData>';

  rows.forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    xml += `<row r="${rowNumber}">`;
    row.forEach((cell, colIndex) => {
      if (cell === '' || cell === null || cell === undefined) return;
      const ref = cellRef(colIndex + 1, rowNumber);
      xml += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell)}</t></is></c>`;
    });
    xml += '</row>';
  });

  xml += '</sheetData></worksheet>';
  return xml;
}

export function zipXlsx(sheetXml, stylesXml, sheetName = '週中') {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  zip.file('xl/styles.xml', stylesXml);
  zip.file('xl/worksheets/sheet1.xml', sheetXml);
  // Tag the blob with the real spreadsheet MIME type. Without it the download
  // carries no content-type and mobile file handlers open it as a raw zip of
  // XML parts instead of in a spreadsheet app.
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

const PLAIN_STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`;

export function buildXlsxBuffer(rows, { sheetName = '週中', cols } = {}) {
  return zipXlsx(buildPlainSheetXml(rows, cols), PLAIN_STYLES_XML, sheetName);
}

