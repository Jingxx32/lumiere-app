import type { FrenchVocabEntry, TenseBlock } from "@/lib/ai/enrich";

export const LEVEL_ORDER: Record<string, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

/** Tense keys visible at the learner's level, in canonical order, focus first-flagged. */
export function visibleTenses(
  entry: FrenchVocabEntry,
  learnerLevel: string,
): { key: string; focus: boolean }[] {
  if (!entry.verb) return [];
  const ceil = LEVEL_ORDER[learnerLevel] ?? 1;
  const focus = new Set(entry.verb.focus_tenses);
  return (Object.entries(entry.verb.tenses) as [string, TenseBlock | null][])
    .filter(
      (e): e is [string, TenseBlock] =>
        e[1] != null && (LEVEL_ORDER[e[1].level] ?? 99) <= ceil,
    )
    .sort((a, b) => (LEVEL_ORDER[a[1].level] ?? 99) - (LEVEL_ORDER[b[1].level] ?? 99))
    .map(([key]) => ({ key, focus: focus.has(key) }));
}
