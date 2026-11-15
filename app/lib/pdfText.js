import { extractText } from 'unpdf';

export async function pdfToText(arrayBuffer) {
  const { text } = await extractText(new Uint8Array(arrayBuffer), { mergePages: false });
  return text.join('\n');
}
