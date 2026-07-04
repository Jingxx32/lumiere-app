/**
 * Split a generated script into practicable sentences.
 * Scripts are generated one sentence per line, but users can edit freely,
 * so also split on sentence-ending punctuation within a line.
 */
export function splitSentences(script: string): string[] {
  return script
    .split("\n")
    .flatMap((line) => line.split(/(?<=[.!?…])\s+/))
    .map((s) => s.replace(/^[-•\d.)\s]+/, "").trim())
    .filter((s) => s.length > 1);
}
