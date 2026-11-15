import { readFile } from 'node:fs/promises';
import { pdfToText } from '../app/lib/pdfText.js';
import { parsePackingSlip } from '../app/lib/literatureShipments.mjs';
const buffer = await readFile(process.argv[2]);
console.log(JSON.stringify(parsePackingSlip(await pdfToText(buffer)), null, 2));
