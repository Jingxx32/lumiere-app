/**
 * Deterministic parser for TCF Compréhension écrite MHTML exports
 * (RÉUSSIR TCF CANADA, a WP-Pro-Quiz page saved as a "Webpage, Single File").
 * No AI, no network — pure DOM parsing + inline image extraction.
 *
 * Each test is one .mhtml file with 39 single-choice questions. The reading
 * passage + prompt are baked into a per-question PNG (so questionText is a
 * generic instruction); the four options are real text and exactly one option
 * carries the `wpProQuiz_answerCorrectIncomplete` class = the correct answer.
 *
 * MHTML structure: a multipart/related MIME container. The first text/html
 * part is quoted-printable; image parts are base64, keyed by Content-Location
 * (the same absolute URL used in <img src>).
 */
import * as cheerio from "cheerio";
import type { Element } from "domhandler";

export interface ParsedReadingQuestion {
  orderIndex: number;
  options: string[];
  answer: number;
  /** Absolute URL of the question image (key into MhtmlArchive.resources) */
  imageUrl: string | null;
}

export interface MhtmlResource {
  buffer: Buffer;
  contentType: string;
}

export interface MhtmlArchive {
  html: string;
  /** Content-Location (absolute URL) → decoded resource bytes */
  resources: Map<string, MhtmlResource>;
}

/** Decode a quoted-printable body (used for the text/html part). */
function decodeQuotedPrintable(body: string): string {
  const bytes = body
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
  return Buffer.from(bytes, "latin1").toString("utf8");
}

/** Split an MHTML buffer into its HTML document and a map of embedded resources. */
export function parseMhtml(raw: Buffer): MhtmlArchive {
  const text = raw.toString("latin1");

  const boundaryMatch = text.match(/boundary="([^"]+)"/);
  if (!boundaryMatch) throw new Error("MHTML: no MIME boundary found");
  const boundary = "--" + boundaryMatch[1];

  const parts = text.split(boundary);
  let html = "";
  const resources = new Map<string, MhtmlResource>();

  for (const part of parts) {
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const headers = part.slice(0, headerEnd);
    const body = part.slice(headerEnd + 4);

    const contentType = (headers.match(/Content-Type:\s*([^\r\n;]+)/i)?.[1] ?? "").trim().toLowerCase();
    const encoding = (headers.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i)?.[1] ?? "").trim().toLowerCase();
    const location = headers.match(/Content-Location:\s*([^\r\n]+)/i)?.[1]?.trim();

    if (contentType === "text/html") {
      // The main document is the first text/html part; later ones are embedded
      // (blank) iframes that would otherwise clobber it.
      if (!html) html = decodeQuotedPrintable(body);
    } else if (contentType.startsWith("image/") && location) {
      let buffer: Buffer;
      if (encoding === "base64") {
        buffer = Buffer.from(body.replace(/\s+/g, ""), "base64");
      } else if (encoding === "quoted-printable") {
        buffer = Buffer.from(decodeQuotedPrintable(body), "binary");
      } else {
        buffer = Buffer.from(body, "latin1");
      }
      resources.set(location, { buffer, contentType });
    }
  }

  if (!html) throw new Error("MHTML: no text/html part found");
  return { html, resources };
}

/** Collapse the WP-Pro-Quiz option markup down to its real French text. */
function optionText($: cheerio.CheerioAPI, li: Element): string {
  const label = $(li).find("label").first().clone();
  // The visible text is a bare text node after decorative <span>/<input> nodes
  // (hidden "N." numbering, the A/B/C/D letter, an invisible "88" filler).
  label.find("span, input").remove();
  return label.text().replace(/\s+/g, " ").trim();
}

/** Parse one decoded MHTML document into 39 reading questions. */
export function parseReadingMhtml(html: string): ParsedReadingQuestion[] {
  const $ = cheerio.load(html);
  const questions: ParsedReadingQuestion[] = [];

  $("li.wpProQuiz_listItem").each((domIdx, li) => {
    // Question number — prefer the rendered "N. Question" label, fall back to DOM order.
    const numText = $(li).find(".lqc-question-list-1 .lqc-number").first().text().trim();
    const orderIndex = parseInt(numText, 10) || domIdx + 1;

    const items = $(li).find("ul.wpProQuiz_questionList > li.wpProQuiz_questionListItem");
    const options: string[] = [];
    let answer = 0;
    items.each((pos, item) => {
      const dataPos = parseInt($(item).attr("data-pos") ?? String(pos), 10);
      options[dataPos] = optionText($, item);
      if ($(item).hasClass("wpProQuiz_answerCorrectIncomplete")) answer = dataPos;
    });

    const imageUrl = $(li).find(".wpProQuiz_question_text img").first().attr("src") ?? null;

    questions.push({ orderIndex, options, answer, imageUrl });
  });

  return questions;
}
