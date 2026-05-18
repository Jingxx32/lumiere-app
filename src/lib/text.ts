/**
 * Extract the sentence surrounding a character-offset span from a French text.
 * Searches backwards from `start` and forwards from `end` for sentence
 * terminators (. ! ? \n). Returns the raw slice plus the relative offsets of
 * the error within it, so callers can bold/underline the span.
 *
 * Defensively clamps all offsets to [0, content.length].
 */
export function extractSentence(
  content: string,
  start: number,
  end: number,
): { sentence: string; errorStart: number; errorEnd: number } {
  const cStart = Math.max(0, Math.min(start, content.length));
  const cEnd = Math.max(cStart, Math.min(end, content.length));

  // Search backwards from cStart for a sentence terminator
  let sentStart = cStart;
  while (sentStart > 0) {
    const prev = content[sentStart - 1];
    if (prev === "." || prev === "!" || prev === "?" || prev === "\n") break;
    sentStart--;
  }

  // Search forwards from cEnd for a sentence terminator (include it)
  let sentEnd = cEnd;
  while (sentEnd < content.length) {
    const curr = content[sentEnd];
    sentEnd++;
    if (curr === "." || curr === "!" || curr === "?" || curr === "\n") break;
  }

  const sentence = content.slice(sentStart, sentEnd);
  return {
    sentence,
    errorStart: cStart - sentStart,
    errorEnd: cEnd - sentStart,
  };
}
