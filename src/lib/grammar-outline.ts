/**
 * Authoritative outline of the grammar reference library (A2–B1).
 * The AI drafts content for each entry (scripts/generate-grammar-points.ts);
 * it never decides WHAT to cover — only this file does.
 *
 * taxonomySubcategories map each point to ERROR_TAXONOMY leaf keys so the
 * detail page can surface "your errors on this point". Empty = no mapping.
 */
import type { ErrorSubcategory } from "@/lib/taxonomy";

export const GRAMMAR_CATEGORIES = [
  "Nouns & Articles",
  "Adjectives & Agreement",
  "Pronouns",
  "Verb Tenses",
  "Moods",
  "Negation & Questions",
  "Prepositions",
  "Sentence Structure & Discourse",
] as const;

export type GrammarCategory = (typeof GRAMMAR_CATEGORIES)[number];

export type GrammarOutlineEntry = {
  slug: string;
  name: string;
  level: "A2" | "B1";
  category: GrammarCategory;
  orderIndex: number;
  taxonomySubcategories: ErrorSubcategory[];
};

const e = (
  category: GrammarCategory,
  orderIndex: number,
  slug: string,
  name: string,
  level: "A2" | "B1",
  taxonomySubcategories: ErrorSubcategory[] = [],
): GrammarOutlineEntry => ({ slug, name, level, category, orderIndex, taxonomySubcategories });

export const GRAMMAR_OUTLINE: GrammarOutlineEntry[] = [
  // ─── Nouns & Articles ────────────────────────────────────────────
  e("Nouns & Articles", 1, "noun-gender-patterns", "Noun gender and typical endings", "A2", ["noun_gender"]),
  e("Nouns & Articles", 2, "plural-of-nouns", "Plural of nouns (-s, -x, -aux)", "A2"),
  e("Nouns & Articles", 3, "definite-and-indefinite-articles", "Definite vs indefinite articles (le/la/les vs un/une/des)", "A2", ["definite_vs_indefinite", "article_noun_mismatch"]),
  e("Nouns & Articles", 4, "partitive-articles", "Partitive articles (du, de la, des)", "A2", ["partitive"]),
  e("Nouns & Articles", 5, "contracted-articles", "Contracted articles (au, aux, du, des)", "A2", ["contraction"]),
  e("Nouns & Articles", 6, "articles-in-negation", "Articles in negation (un/une/des → de)", "A2", ["negation_de_rule"]),
  e("Nouns & Articles", 7, "article-omission", "When to omit the article (professions, quantities, fixed expressions)", "B1", ["article_omission"]),

  // ─── Adjectives & Agreement ──────────────────────────────────────
  e("Adjectives & Agreement", 1, "adjective-agreement", "Adjective gender and number agreement", "A2", ["adjective_agreement"]),
  e("Adjectives & Agreement", 2, "adjective-position", "Adjective position (before / after the noun)", "A2", ["adjective_position"]),
  e("Adjectives & Agreement", 3, "possessive-adjectives", "Possessive adjectives (mon/ma/mes, son/sa/ses)", "A2", ["article_noun_mismatch"]),
  e("Adjectives & Agreement", 4, "demonstrative-adjectives", "Demonstrative adjectives (ce, cet, cette, ces)", "A2", ["article_noun_mismatch"]),
  e("Adjectives & Agreement", 5, "comparative-and-superlative", "Comparative and superlative (plus/moins/aussi… que, le plus…)", "A2"),
  e("Adjectives & Agreement", 6, "indefinite-adjectives", "Indefinite adjectives (chaque, quelques, plusieurs, tout)", "B1", ["adjective_agreement"]),

  // ─── Pronouns ────────────────────────────────────────────────────
  e("Pronouns", 1, "subject-pronouns-and-on", "Subject pronouns and 'on'", "A2", ["subject_pronoun"]),
  e("Pronouns", 2, "direct-object-pronouns", "Direct object pronouns (me, te, le, la, nous, vous, les)", "A2", ["object_pronoun"]),
  e("Pronouns", 3, "indirect-object-pronouns", "Indirect object pronouns (me, te, lui, nous, vous, leur)", "A2", ["object_pronoun"]),
  e("Pronouns", 4, "pronoun-y", "The pronoun y", "A2", ["y_en"]),
  e("Pronouns", 5, "pronoun-en", "The pronoun en", "A2", ["y_en"]),
  e("Pronouns", 6, "stressed-pronouns", "Stressed pronouns (moi, toi, lui, elle…)", "A2", ["stressed_pronoun"]),
  e("Pronouns", 7, "double-pronoun-order", "Order of double object pronouns", "B1", ["object_pronoun"]),
  e("Pronouns", 8, "relative-pronouns-qui-que-ou", "Relative pronouns qui, que, où", "B1"),
  e("Pronouns", 9, "relative-pronoun-dont-lequel", "Relative pronouns dont and lequel", "B1"),
  e("Pronouns", 10, "demonstrative-pronouns", "Demonstrative pronouns (celui, celle, ceux; ceci/cela/ça)", "B1"),
  e("Pronouns", 11, "possessive-pronouns", "Possessive pronouns (le mien, la tienne…)", "B1"),
  e("Pronouns", 12, "indefinite-pronouns", "Indefinite pronouns (quelqu'un, personne, rien, chacun)", "B1", ["negation_structure"]),

  // ─── Verb Tenses ─────────────────────────────────────────────────
  e("Verb Tenses", 1, "present-tense-regular", "Present tense: regular -er / -ir / -re verbs", "A2", ["conjugation_present"]),
  e("Verb Tenses", 2, "present-tense-irregular", "Present tense: key irregular verbs (être, avoir, aller, faire, venir…)", "A2", ["conjugation_present"]),
  e("Verb Tenses", 3, "pronominal-verbs", "Pronominal (reflexive) verbs", "A2", ["conjugation_present", "auxiliary_choice"]),
  e("Verb Tenses", 4, "passe-compose-with-avoir", "Passé composé with avoir", "A2", ["conjugation_passe_compose", "auxiliary_choice"]),
  e("Verb Tenses", 5, "passe-compose-with-etre", "Passé composé with être", "A2", ["conjugation_passe_compose", "auxiliary_choice", "past_participle_agreement"]),
  e("Verb Tenses", 6, "imparfait", "The imparfait", "A2", ["pc_vs_imparfait"]),
  e("Verb Tenses", 7, "passe-compose-vs-imparfait", "Passé composé vs imparfait", "B1", ["pc_vs_imparfait", "tense_choice"]),
  e("Verb Tenses", 8, "plus-que-parfait", "The plus-que-parfait", "B1", ["tense_choice"]),
  e("Verb Tenses", 9, "futur-proche", "Futur proche (aller + infinitive)", "A2", ["tense_choice"]),
  e("Verb Tenses", 10, "futur-simple", "Futur simple", "A2", ["tense_choice", "futur_vs_conditionnel"]),
  e("Verb Tenses", 11, "venir-de-recent-past", "Recent past (venir de + infinitive)", "A2", ["tense_choice"]),
  e("Verb Tenses", 12, "etre-en-train-de", "Ongoing action (être en train de + infinitive)", "A2"),
  e("Verb Tenses", 13, "past-participle-agreement-avoir", "Past participle agreement with avoir (preceding direct object)", "B1", ["past_participle_agreement"]),
  e("Verb Tenses", 14, "depuis-pendant-il-y-a", "Time markers with tenses (depuis, pendant, il y a)", "B1", ["time_preposition", "tense_choice"]),

  // ─── Moods ───────────────────────────────────────────────────────
  e("Moods", 1, "imperative", "The imperative", "A2"),
  e("Moods", 2, "conditionnel-present", "Conditionnel présent (politeness, wishes, suggestions)", "A2", ["futur_vs_conditionnel"]),
  e("Moods", 3, "si-clauses", "Hypotheses with si (si + présent / si + imparfait)", "B1", ["futur_vs_conditionnel", "tense_choice"]),
  e("Moods", 4, "subjunctive-formation", "Subjunctive: formation", "B1", ["subjonctif_basic"]),
  e("Moods", 5, "subjunctive-triggers", "Subjunctive: common triggers (il faut que, vouloir que, avant que…)", "B1", ["subjonctif_basic"]),
  e("Moods", 6, "subjunctive-vs-indicative", "Subjunctive vs indicative (penser que vs ne pas penser que…)", "B1", ["subjonctif_basic"]),
  e("Moods", 7, "gerund-en-participe-present", "Gérondif (en + -ant) and the present participle", "B1"),
  e("Moods", 8, "infinitive-constructions", "Infinitive constructions (verb + infinitive, avant de, pour…)", "B1", ["verb_preposition"]),

  // ─── Negation & Questions ────────────────────────────────────────
  e("Negation & Questions", 1, "basic-negation", "Basic negation (ne… pas)", "A2", ["negation_structure"]),
  e("Negation & Questions", 2, "negation-variants", "Negation variants (ne… plus / jamais / rien / personne)", "A2", ["negation_structure"]),
  e("Negation & Questions", 3, "negation-compound-tenses", "Negation in compound tenses and with pronouns", "B1", ["negation_structure"]),
  e("Negation & Questions", 4, "restriction-ne-que", "Restriction with ne… que", "B1", ["negation_structure"]),
  e("Negation & Questions", 5, "yes-no-questions", "Yes/no questions (intonation, est-ce que)", "A2", ["question_formation"]),
  e("Negation & Questions", 6, "information-questions", "Information questions (où, quand, comment, pourquoi, quel, lequel)", "A2", ["question_formation"]),
  e("Negation & Questions", 7, "inversion-questions", "Questions with inversion", "B1", ["question_formation"]),

  // ─── Prepositions ────────────────────────────────────────────────
  e("Prepositions", 1, "prepositions-of-place", "Prepositions of place (dans, sur, sous, devant, chez…)", "A2", ["place_preposition"]),
  e("Prepositions", 2, "prepositions-with-places", "Prepositions with cities and countries (à, en, au, aux)", "A2", ["place_preposition"]),
  e("Prepositions", 3, "prepositions-of-time", "Prepositions of time (à, en, dans, depuis, pendant, pour)", "A2", ["time_preposition"]),
  e("Prepositions", 4, "verbs-with-preposition-a", "Verbs followed by à (penser à, réussir à…)", "B1", ["verb_preposition"]),
  e("Prepositions", 5, "verbs-with-preposition-de", "Verbs followed by de (avoir besoin de, essayer de…)", "B1", ["verb_preposition"]),
  e("Prepositions", 6, "a-vs-de-before-infinitive", "à vs de before an infinitive", "B1", ["verb_preposition"]),

  // ─── Sentence Structure & Discourse ──────────────────────────────
  e("Sentence Structure & Discourse", 1, "word-order-basics", "Basic word order (SVO, pronoun placement)", "A2", ["word_order"]),
  e("Sentence Structure & Discourse", 2, "adverbs-formation-placement", "Adverbs: formation (-ment) and placement", "A2", ["word_order"]),
  e("Sentence Structure & Discourse", 3, "impersonal-expressions", "Impersonal expressions (il faut, il y a, il fait…)", "A2"),
  e("Sentence Structure & Discourse", 4, "connectors-time-sequence", "Time and sequence connectors (d'abord, ensuite, puis, enfin…)", "B1"),
  e("Sentence Structure & Discourse", 5, "connectors-cause-consequence", "Cause and consequence connectors (parce que, comme, donc, alors…)", "B1"),
  e("Sentence Structure & Discourse", 6, "indirect-speech", "Indirect speech (dire que, demander si…)", "B1", ["tense_choice"]),
  e("Sentence Structure & Discourse", 7, "emphasis-cest-qui-que", "Emphasis with c'est… qui / c'est… que", "B1", ["awkward_structure"]),
  e("Sentence Structure & Discourse", 8, "passive-voice-intro", "The passive voice (introduction)", "B1"),
];
