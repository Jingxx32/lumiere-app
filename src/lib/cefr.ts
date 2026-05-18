export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

/** Soft tints used in chips throughout the UI. Tailwind utility classes. */
export const CEFR_CHIP_CLASSES: Record<CefrLevel, string> = {
  A1: "bg-emerald-50 text-emerald-700 ring-emerald-200/60",
  A2: "bg-emerald-50 text-emerald-700 ring-emerald-200/60",
  B1: "bg-sky-50 text-sky-700 ring-sky-200/60",
  B2: "bg-amber-50 text-amber-700 ring-amber-200/60",
  C1: "bg-rose-50 text-rose-700 ring-rose-200/60",
  C2: "bg-rose-50 text-rose-700 ring-rose-200/60",
};

/** Fallback heuristic used when the LLM estimator is unavailable. */
export function naiveLevelEstimate(text: string): CefrLevel {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "B1";
  const avgWordLen =
    words.reduce((sum, w) => sum + w.length, 0) / words.length;
  // Crude buckets — good enough until S2 adds a real estimator.
  if (avgWordLen < 4.2) return "A2";
  if (avgWordLen < 4.8) return "B1";
  if (avgWordLen < 5.4) return "B2";
  return "C1";
}

export function countWords(text: string): number {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean).length;
}
