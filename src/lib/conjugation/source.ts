/**
 * Deterministic conjugation source (D-7) — a thin wrapper over the
 * `french-verbs` library + LEFFF lexicon data. The answer key for every drill
 * comes from here; AI never generates or validates a form (W-4 decided).
 */
import {
  getConjugation,
  alwaysAuxEtre,
  type Tense as LibTense,
} from "french-verbs";
import type { VerbsInfo } from "french-verbs-lefff";
import Lefff from "french-verbs-lefff/dist/conjugations.json";

/** The 6 drill tenses (S10 scope — more later). */
export const DRILL_TENSES = [
  "présent",
  "passé composé",
  "imparfait",
  "futur simple",
  "subjonctif présent",
  "conditionnel présent",
] as const;

export type DrillTense = (typeof DRILL_TENSES)[number];

const TENSE_TO_LIB: Record<DrillTense, LibTense> = {
  "présent": "PRESENT",
  "passé composé": "PASSE_COMPOSE",
  "imparfait": "IMPARFAIT",
  "futur simple": "FUTUR",
  "subjonctif présent": "SUBJONCTIF_PRESENT",
  "conditionnel présent": "CONDITIONNEL_PRESENT",
};

/** Person index 0–5 → display pronoun. */
export const PERSON_LABELS = [
  "je",
  "tu",
  "il / elle",
  "nous",
  "vous",
  "ils / elles",
] as const;

/** "se lever" / "s'asseoir" → { verb: "lever", pronominal: true } */
export function parseInfinitive(infinitive: string): {
  verb: string;
  pronominal: boolean;
} {
  const trimmed = infinitive.trim().toLowerCase();
  if (trimmed.startsWith("se ")) {
    return { verb: trimmed.slice(3), pronominal: true };
  }
  if (trimmed.startsWith("s'") || trimmed.startsWith("s’")) {
    return { verb: trimmed.slice(2), pronominal: true };
  }
  return { verb: trimmed, pronominal: false };
}

/**
 * Conjugate `infinitive` at `tense` for `person` (0–5 = je…ils/elles).
 * Pronominal forms include the reflexive pronoun ("me suis levé").
 * For être-auxiliary compound tenses the participle agrees with the subject
 * (`gender`, defaults to masculine; number follows the person).
 */
export function conjugate(
  infinitive: string,
  tense: DrillTense,
  person: number,
  opts?: { gender?: "M" | "F" },
): string {
  const { verb, pronominal } = parseInfinitive(infinitive);
  const useEtre = pronominal || alwaysAuxEtre(verb);

  return getConjugation(
    Lefff as VerbsInfo,
    verb,
    TENSE_TO_LIB[tense],
    person,
    {
      aux: useEtre ? "ETRE" : "AVOIR",
      // With avoir the participle never agrees with the subject; with être it does.
      agreeGender: useEtre ? (opts?.gender ?? "M") : "M",
      agreeNumber: useEtre && person >= 3 ? "P" : "S",
    },
    pronominal,
    undefined,
    undefined,
    "Act",
  );
}

/**
 * All spellings accepted as correct for a drill: the masculine form plus, for
 * être-auxiliary compounds where the subject's gender is the learner's choice
 * (je/tu/nous/vous), the feminine agreement variant. Deterministic — both
 * variants come from the library (D-7).
 */
export function acceptedForms(
  infinitive: string,
  tense: DrillTense,
  person: number,
): string[] {
  const masculine = conjugate(infinitive, tense, person, { gender: "M" });
  const feminine = conjugate(infinitive, tense, person, { gender: "F" });
  return feminine === masculine ? [masculine] : [masculine, feminine];
}

/** True when the LEFFF lexicon knows this verb (drills must skip unknowns). */
export function isKnownVerb(infinitive: string): boolean {
  const { verb } = parseInfinitive(infinitive);
  return Object.prototype.hasOwnProperty.call(Lefff, verb);
}
