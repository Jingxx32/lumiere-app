import type { ErrorCategory } from "@/lib/taxonomy";

export type CategoryStyle = {
  chip: string;
  mark: string;
  chartColor: string;
};

// Full static class strings so Tailwind's content scanner picks them all up.
export const CATEGORY_STYLES: Record<ErrorCategory, CategoryStyle> = {
  Grammar: {
    chip: "bg-amber-100 text-amber-800",
    mark: "bg-amber-100",
    chartColor: "#F59E0B",
  },
  GenderAgreement: {
    chip: "bg-rose-100 text-rose-800",
    mark: "bg-rose-100",
    chartColor: "#F43F5E",
  },
  Articles: {
    chip: "bg-violet-100 text-violet-800",
    mark: "bg-violet-100",
    chartColor: "#8B5CF6",
  },
  Prepositions: {
    chip: "bg-red-100 text-red-800",
    mark: "bg-red-100",
    chartColor: "#EF4444",
  },
  Pronouns: {
    chip: "bg-emerald-100 text-emerald-800",
    mark: "bg-emerald-100",
    chartColor: "#10B981",
  },
  NegationQuestion: {
    chip: "bg-cyan-100 text-cyan-800",
    mark: "bg-cyan-100",
    chartColor: "#06B6D4",
  },
  Vocabulary: {
    chip: "bg-blue-100 text-blue-800",
    mark: "bg-blue-100",
    chartColor: "#3B82F6",
  },
  Orthography: {
    chip: "bg-stone-100 text-stone-800",
    mark: "bg-stone-100",
    chartColor: "#78716C",
  },
  Syntax: {
    chip: "bg-fuchsia-100 text-fuchsia-800",
    mark: "bg-fuchsia-100",
    chartColor: "#D946EF",
  },
};

export const SUPERSCRIPTS = ["¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];

export function superscript(n: number): string {
  return SUPERSCRIPTS[n] ?? `(${n + 1})`;
}
