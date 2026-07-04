import type { CefrLevel } from "@/lib/cefr";
import type { ErrorCategory } from "@/lib/taxonomy";

export type WeakGrammarEntry = {
  category: ErrorCategory;
  subcategory: string;
  count: number;
  trend: "improving" | "stable" | "worsening";
};

export type LearnerProfile = {
  cefrLevel: CefrLevel;
  totalSubmissions: number;
  totalErrors: number;

  /** Top weak subcategories by raw count (descending). Capped to top 8. */
  weakGrammar: WeakGrammarEntry[];

  /** Subcategories the learner has NOT erred on in the last 90 days — candidates for harder targets. */
  strongGrammar: string[];

  /** Truthy when there's enough signal to influence prompts. Below threshold → profile is ignored. */
  hasEnoughSignal: boolean;
};

/** Minimum signal required before the profile influences task generation. */
export const PROFILE_MIN_SUBMISSIONS = 3;
export const PROFILE_MIN_ERRORS = 5;
