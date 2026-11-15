import { readFile } from 'node:fs/promises';
import { pdfToText } from '../app/lib/pdfText.js';
import { parseHubInventoryReport } from '../app/lib/literatureInventory.mjs';

const buffer = await readFile(process.argv[2]);
console.log(JSON.stringify(parseHubInventoryReport(await pdfToText(buffer)), null, 2));
