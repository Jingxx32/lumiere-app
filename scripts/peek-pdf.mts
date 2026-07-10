import { PDFParse } from 'pdf-parse';
import { readFileSync } from 'fs';
const buf = readFileSync('<TCF_LISTENING_DIR>/Compréhension orale test 1 (Member) - 题库.pdf');
const parser = new PDFParse({ data: new Uint8Array(buf) });
const result = await parser.getText();
const lines = result.text.split('\n');
lines.slice(200, 450).forEach((l, i) => console.log(String(i+201).padStart(3), JSON.stringify(l)));
await parser.destroy();
