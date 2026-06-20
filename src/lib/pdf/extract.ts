import { PDFParse } from "pdf-parse";

export type PdfExtract = {
  text: string;
  /** Almost no selectable text per page → likely a scanned/image PDF */
  looksScanned: boolean;
};

/** Below this many non-whitespace chars per page we assume a scan. */
const MIN_CHARS_PER_PAGE = 80;

export async function extractPdfText(buf: Buffer): Promise<PdfExtract> {
  try {
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    try {
      const result = await parser.getText();
      const text = result.text ?? "";
      const pages = Math.max(result.total, 1);
      const denseLength = text.replace(/\s/g, "").length;
      return { text, looksScanned: denseLength / pages < MIN_CHARS_PER_PAGE };
    } finally {
      await parser.destroy();
    }
  } catch (err) {
    console.error("PDF extraction failed:", err);
    return { text: "", looksScanned: true };
  }
}
