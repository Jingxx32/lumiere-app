/**
 * Seed the rules knowledge base with one row per taxonomy subcategory.
 * Idempotent — skips rows whose id already exists.
 *
 *   npm run db:seed-rules
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/lib/db/schema";
import { rules } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";

type RuleSeed = typeof rules.$inferInsert;

const SEEDS: RuleSeed[] = [
  // ─── Grammar ─────────────────────────────────────────────────────────────
  {
    id: "conjugation_present",
    category: "Grammar",
    subcategory: "conjugation_present",
    name: "Present tense conjugation",
    descriptionEn:
      "Regular -er verbs drop -er and add -e, -es, -e, -ons, -ez, -ent. Regular -ir verbs add -is, -is, -it, -issons, -issez, -issent. Many common verbs are irregular (être, avoir, aller, faire) and must be memorised.",
    examples: ["Je parle, tu parles, il parle, nous parlons.", "Je finis, tu finis, il finit, nous finissons."],
  },
  {
    id: "conjugation_passe_compose",
    category: "Grammar",
    subcategory: "conjugation_passe_compose",
    name: "Passé composé conjugation",
    descriptionEn:
      "Passé composé = auxiliary (avoir or être in present tense) + past participle. Most verbs use avoir. Verbs of motion/state change and all reflexives use être. With être, the past participle agrees with the subject.",
    examples: ["J'ai mangé une pomme. (avoir)", "Elle est partie ce matin. (être — agreement)"],
  },
  {
    id: "auxiliary_choice",
    category: "Grammar",
    subcategory: "auxiliary_choice",
    name: "Auxiliary verb choice (être / avoir)",
    descriptionEn:
      "Use être with the DR MRS VANDERTRAMP verbs (aller, venir, partir, arriver, naître, mourir, etc.) and all reflexive verbs. Use avoir with all other verbs. This choice affects past-participle agreement.",
    examples: ["Il est allé au marché. (être)", "Elle s'est levée tôt. (reflexive — être)"],
  },
  {
    id: "tense_choice",
    category: "Grammar",
    subcategory: "tense_choice",
    name: "Tense choice",
    descriptionEn:
      "Choosing the right tense conveys whether an action is happening now, was completed in the past, or is continuous/habitual. Using présent in a past context (or vice versa) breaks temporal consistency and confuses the reader.",
    examples: ["Hier, il est arrivé à midi. (passé composé — completed past)", "Chaque jour il se lève tôt. (présent — habitual)"],
  },
  {
    id: "pc_vs_imparfait",
    category: "Grammar",
    subcategory: "pc_vs_imparfait",
    name: "Passé composé vs imparfait",
    descriptionEn:
      "Use passé composé for completed, punctual or bounded actions in the past. Use imparfait for ongoing states, background description, repeated/habitual actions, or interrupted actions. The two often appear together: imparfait sets the scene, passé composé advances the narrative.",
    examples: [
      "Quand j'étais petit, j'allais à l'école à pied. (imparfait — habitual)",
      "Il faisait beau quand nous sommes arrivés. (imparfait background + passé composé event)",
      "Hier soir, j'ai regardé un film. (passé composé — single completed event)",
    ],
  },
  {
    id: "past_participle_agreement",
    category: "Grammar",
    subcategory: "past_participle_agreement",
    name: "Past participle agreement",
    descriptionEn:
      "With être, the past participle always agrees with the subject. With avoir, the past participle agrees with a direct object (COD) that precedes the verb — this includes relative clauses and object pronouns placed before the verb.",
    examples: ["Les fleurs qu'il a cueillies. (COD 'fleurs' precedes avoir)", "Elles se sont levées tôt. (être — agreement with subject)"],
  },
  {
    id: "subjonctif_basic",
    category: "Grammar",
    subcategory: "subjonctif_basic",
    name: "Subjunctive mood (basic triggers)",
    descriptionEn:
      "The subjunctive is required in subordinate clauses after expressions of obligation (il faut que), desire (vouloir que), emotion (être content que), doubt (douter que), and after conjunctions such as bien que, pour que, avant que, à moins que.",
    examples: [
      "Il faut que tu sois patient.",
      "Je veux qu'il vienne demain.",
      "Bien qu'il fasse froid, elle sort sans manteau.",
    ],
  },
  {
    id: "futur_vs_conditionnel",
    category: "Grammar",
    subcategory: "futur_vs_conditionnel",
    name: "Futur simple vs conditionnel",
    descriptionEn:
      "Use futur simple for events that will certainly happen. Use conditionnel for hypotheticals, polite requests, reported future speech, and the result clause in si-conditionals.",
    examples: ["Demain, j'irai au marché. (futur — certain future)", "Je voudrais un café, s'il vous plaît. (conditionnel — polite)"],
  },

  // ─── GenderAgreement ─────────────────────────────────────────────────────
  {
    id: "noun_gender",
    category: "GenderAgreement",
    subcategory: "noun_gender",
    name: "Noun gender",
    descriptionEn:
      "Every French noun has a fixed grammatical gender — masculine or feminine. The article, adjective, and pronoun must all agree with the noun's gender. There is no reliable rule; memorise gender with every new noun.",
    examples: [
      "un problème (masc.) / une solution (fem.)",
      "le soleil (masc.) / la lune (fem.)",
      "C'est un bon livre. / C'est une bonne idée.",
    ],
  },
  {
    id: "adjective_agreement",
    category: "GenderAgreement",
    subcategory: "adjective_agreement",
    name: "Adjective gender/number agreement",
    descriptionEn:
      "Adjectives agree in both gender and number with the noun they describe. Typically add -e for feminine, -s for masculine plural, -es for feminine plural. Some adjectives have irregular feminine forms (beau → belle, vieux → vieille, etc.).",
    examples: [
      "un grand garçon / une grande fille",
      "des livres intéressants / des histoires intéressantes",
      "Elle est fatiguée. / Ils sont fatigués.",
    ],
  },
  {
    id: "adjective_position",
    category: "GenderAgreement",
    subcategory: "adjective_position",
    name: "Adjective placement (before/after noun)",
    descriptionEn:
      "Most adjectives follow the noun in French. A small set of common adjectives — BAGS (Beauty, Age, Goodness, Size): beau, joli, vieux, jeune, bon, mauvais, grand, petit, gros — precede the noun.",
    examples: ["Un grand homme / une jolie fleur. (before)", "Un livre intéressant / une idée brillante. (after)"],
  },
  {
    id: "article_noun_mismatch",
    category: "GenderAgreement",
    subcategory: "article_noun_mismatch",
    name: "Article and noun gender mismatch",
    descriptionEn:
      "The gender of the article (le/la/un/une) must match the grammatical gender of the noun it introduces. A mismatch signals a gender error on either the article or the noun.",
    examples: ["le problème (not *la problème)", "une solution (not *un solution)"],
  },

  // ─── Articles ─────────────────────────────────────────────────────────────
  {
    id: "definite_vs_indefinite",
    category: "Articles",
    subcategory: "definite_vs_indefinite",
    name: "Definite vs indefinite article",
    descriptionEn:
      "Use the definite article (le/la/les) for specific, known, or previously introduced referents, and for general concepts. Use the indefinite (un/une/des) for non-specific or newly introduced nouns.",
    examples: ["J'ai acheté un livre. Plus tard, le livre m'a déçu.", "Je préfère le café. / J'ai pris un café ce matin."],
  },
  {
    id: "partitive",
    category: "Articles",
    subcategory: "partitive",
    name: "Partitive article (du / de la / de l' / des)",
    descriptionEn:
      "Use the partitive article to express an unspecified quantity of a mass noun or uncountable substance. du = de + le (masculine), de la (feminine), de l' (before vowel/h). After negation, partitives become de/d'.",
    examples: [
      "Je bois du café. (some coffee)",
      "Elle mange de la salade. (some salad)",
      "Nous avons de l'eau. (some water)",
    ],
  },
  {
    id: "article_omission",
    category: "Articles",
    subcategory: "article_omission",
    name: "Missing or extra article",
    descriptionEn:
      "French generally requires an article before a noun in most contexts, unlike English. Omitting the article is a common anglicism. Conversely, some fixed expressions (être médecin, parler français) omit the article where English would include one.",
    examples: ["J'aime la musique. (not: *J'aime musique)", "Il est médecin. (no article after être + profession)"],
  },
  {
    id: "negation_de_rule",
    category: "Articles",
    subcategory: "negation_de_rule",
    name: "Article change in negation (de rule)",
    descriptionEn:
      "After ne...pas, ne...plus, ne...jamais, the indefinite articles un, une, des and the partitives du, de la, de l' all change to de (d' before a vowel). Definite articles le, la, les do NOT change after negation.",
    examples: [
      "J'ai une voiture. → Je n'ai pas de voiture.",
      "Il mange des pommes. → Il ne mange pas de pommes.",
      "J'aime le café. → Je n'aime pas le café. (definite — stays le)",
    ],
  },
  {
    id: "contraction",
    category: "Articles",
    subcategory: "contraction",
    name: "Obligatory contraction (à+le=au, de+le=du)",
    descriptionEn:
      "The prepositions à and de contract with the definite articles le and les. à + le = au, à + les = aux, de + le = du, de + les = des. They never contract with la or l'.",
    examples: ["Je vais au cinéma. (à + le)", "Il revient du marché. (de + le)"],
  },

  // ─── Prepositions ─────────────────────────────────────────────────────────
  {
    id: "verb_preposition",
    category: "Prepositions",
    subcategory: "verb_preposition",
    name: "Verb-preposition pairing",
    descriptionEn:
      "Many French verbs require a specific preposition before an infinitive or noun. These pairings must be memorised: penser à, rêver de, avoir besoin de, réussir à, apprendre à, essayer de, se souvenir de, profiter de, s'intéresser à.",
    examples: [
      "Je pense à mes amis. (penser à)",
      "Elle a besoin d'aide. (avoir besoin de)",
      "Il essaie de comprendre. (essayer de)",
    ],
  },
  {
    id: "place_preposition",
    category: "Prepositions",
    subcategory: "place_preposition",
    name: "Place prepositions (en / au / aux + country, à + city)",
    descriptionEn:
      "Use en for feminine countries and most regions; au for masculine countries; aux for plural countries; à for cities. Feminine country = most countries ending in -e (France, Espagne, Italie), except le Mexique.",
    examples: ["Je vis en France, au Japon, aux États-Unis.", "Elle habite à Paris."],
  },
  {
    id: "time_preposition",
    category: "Prepositions",
    subcategory: "time_preposition",
    name: "Time prepositions",
    descriptionEn:
      "Key time prepositions: depuis (ongoing duration from a past point), pendant (completed duration), pour (intended/planned duration), dans (future point from now), en (duration to complete something).",
    examples: ["Je travaille ici depuis deux ans. (depuis — ongoing)", "Dans une heure, je pars. (dans — future point)"],
  },
  {
    id: "general_preposition",
    category: "Prepositions",
    subcategory: "general_preposition",
    name: "General preposition error",
    descriptionEn:
      "A preposition error not covered by a more specific subcategory. This includes choosing the wrong preposition in contexts like topic (parler de vs sur), manner, or other non-verbal/non-place/non-time uses.",
    examples: ["Je suis intéressé par ce sujet. (not: *à)", "Dépendre de ses parents. (not: *sur)"],
  },

  // ─── Pronouns ─────────────────────────────────────────────────────────────
  {
    id: "subject_pronoun",
    category: "Pronouns",
    subcategory: "subject_pronoun",
    name: "Subject pronoun choice",
    descriptionEn:
      "Choose the correct subject pronoun for the person, number, and register. Key choices: tu (familiar singular) vs vous (formal or plural); on (informal 'we' or impersonal) can replace nous in spoken French.",
    examples: ["On peut utiliser 'on' pour 'nous' en français familier.", "Tu parles à un ami; vous parlez à quelqu'un que vous respectez."],
  },
  {
    id: "object_pronoun",
    category: "Pronouns",
    subcategory: "object_pronoun",
    name: "Direct/indirect object pronoun (COD/COI)",
    descriptionEn:
      "Direct object (COD) pronouns: me, te, le, la, nous, vous, les. Indirect object (COI) pronouns: me, te, lui, nous, vous, leur. Object pronouns are placed before the conjugated verb (or before the infinitive when it governs the object).",
    examples: ["Je le vois. (COD — le replaces a masc. noun)", "Je lui parle. (COI — lui replaces à + person)"],
  },
  {
    id: "y_en",
    category: "Pronouns",
    subcategory: "y_en",
    name: "Pronouns y and en",
    descriptionEn:
      "y replaces à + a non-person noun or a location previously mentioned. en replaces de + a non-person noun, or a quantity expression. Both are placed before the conjugated verb.",
    examples: ["J'y vais demain. (y = au marché)", "J'en veux deux. (en replaces 'des pommes' + quantity)"],
  },
  {
    id: "stressed_pronoun",
    category: "Pronouns",
    subcategory: "stressed_pronoun",
    name: "Stressed (disjunctive) pronouns",
    descriptionEn:
      "Stressed pronouns (moi, toi, lui, elle, nous, vous, eux, elles) are used after prepositions, in compound subjects, for emphasis, or in one-word answers. They cannot replace a subject immediately before the verb.",
    examples: ["C'est moi qui l'ai fait. (emphasis)", "Il travaille pour elle. (after preposition)"],
  },

  // ─── NegationQuestion ─────────────────────────────────────────────────────
  {
    id: "negation_structure",
    category: "NegationQuestion",
    subcategory: "negation_structure",
    name: "Negation structure (ne...pas etc.)",
    descriptionEn:
      "French negation wraps the conjugated verb: ne before, pas/plus/jamais/rien/personne after. In compound tenses, ne...pas surrounds the auxiliary. In informal speech, ne is often dropped — but in writing it must appear.",
    examples: ["Je ne sais pas. / Il ne mange plus de viande.", "Elle n'aime jamais les lundis."],
  },
  {
    id: "question_formation",
    category: "NegationQuestion",
    subcategory: "question_formation",
    name: "Question formation",
    descriptionEn:
      "Three main question strategies: (1) rising intonation — Tu viens ? (informal); (2) est-ce que — Est-ce que tu viens ? (neutral); (3) subject-verb inversion — Viens-tu ? (formal). Use a hyphen with inversion.",
    examples: ["Est-ce que tu viens avec nous ?", "Où habitez-vous ? (inversion)"],
  },

  // ─── Vocabulary ───────────────────────────────────────────────────────────
  {
    id: "wrong_word",
    category: "Vocabulary",
    subcategory: "wrong_word",
    name: "Wrong word (including faux amis)",
    descriptionEn:
      "Using a word that looks like the intended word but carries a different meaning. Faux amis (false friends) between English and French are a common source of error.",
    examples: ["'Actuellement' means 'currently', not 'actually' (= en fait).", "'Je suis embarrassé' means 'I am embarrassed/uncomfortable', not 'pregnant' (= enceinte)."],
  },
  {
    id: "anglicism",
    category: "Vocabulary",
    subcategory: "anglicism",
    name: "Anglicism or direct translation",
    descriptionEn:
      "A word, phrase, or construction copied directly from English that doesn't belong in standard French, including calque constructions that are grammatically possible but unidiomatic.",
    examples: ["prendre une décision (not: *faire une décision — calque of 'make a decision')", "envoyer un courriel / un e-mail (standard) — avoid verb *emailer"],
  },
  {
    id: "word_form",
    category: "Vocabulary",
    subcategory: "word_form",
    name: "Wrong word form (noun/verb/adjective confusion)",
    descriptionEn:
      "Using the wrong grammatical form of a word — a noun where a verb is needed, an adjective where an adverb is needed, etc. Make sure the part of speech matches the syntactic slot.",
    examples: ["parler rapidement (adverb) — not: *parler rapide (adjective)", "la décision (noun) / décider (verb) — match the required part of speech"],
  },

  // ─── Orthography ──────────────────────────────────────────────────────────
  {
    id: "accent",
    category: "Orthography",
    subcategory: "accent",
    name: "Accent marks (é/è/ê/à/î…)",
    descriptionEn:
      "French accents are part of the spelling and sometimes change meaning (a/à, ou/où). Omitting or using the wrong accent is a spelling error. Common accents: acute (é), grave (è/à/ù), circumflex (ê/î/â/ô/û), diaeresis (ë/ï).",
    examples: ["été (past participle) vs ete (incorrect)", "à (preposition) vs a (verb avoir)"],
  },
  {
    id: "cedilla",
    category: "Orthography",
    subcategory: "cedilla",
    name: "Missing cedilla (ç)",
    descriptionEn:
      "The cedilla (ç) softens the letter c to an [s] sound before the vowels a, o, u. Without it, c before a/o/u is pronounced [k]. It never appears before e or i (where c is already soft).",
    examples: ["Nous commençons. (ç before o)", "François, leçon, reçu."],
  },
  {
    id: "homophone",
    category: "Orthography",
    subcategory: "homophone",
    name: "Homophone confusion",
    descriptionEn:
      "French has many homophones — words that sound identical but are spelled differently and have different meanings. Context determines the correct spelling.",
    examples: ["a (avoir) vs à (preposition)", "ou (or) vs où (where)", "ces (demonstrative adj.) vs ses (possessive adj.)"],
  },
  {
    id: "liaison_elision",
    category: "Orthography",
    subcategory: "liaison_elision",
    name: "Elision (le/la/je/me/de/ne/que + vowel)",
    descriptionEn:
      "Elision is mandatory: drop the final vowel of le, la, je, me, te, se, de, ne, que before a word starting with a vowel sound or mute h, and replace it with an apostrophe.",
    examples: ["l'ami (not: *le ami)", "d'accord, j'ai, qu'il, s'il vous plaît"],
  },
  {
    id: "spelling",
    category: "Orthography",
    subcategory: "spelling",
    name: "General spelling error",
    descriptionEn:
      "A spelling error not covered by the more specific orthography subcategories (accents, cedilla, homophones, elision). This includes transposed letters, doubled consonants, and other misspellings.",
    examples: ["difficile (not: *difficille)", "appartement (not: *apartemant)"],
  },

  // ─── Syntax ───────────────────────────────────────────────────────────────
  {
    id: "word_order",
    category: "Syntax",
    subcategory: "word_order",
    name: "Word order issues",
    descriptionEn:
      "Standard French word order is Subject–Verb–Object. Adverbs of frequency generally follow the conjugated verb, not precede it (unlike English). Inversion in questions has specific rules.",
    examples: ["Je mange souvent au restaurant. (not: *Je souvent mange)", "Il parle bien français. (adverb after verb)"],
  },
  {
    id: "awkward_structure",
    category: "Syntax",
    subcategory: "awkward_structure",
    name: "Awkward or overly literal structure",
    descriptionEn:
      "A sentence that is grammatically possible in French but reads as a direct translation from English, sounding unnatural to a native speaker. Prefer idiomatic French constructions.",
    examples: ["J'ai décidé de partir. (not: *J'ai fait la décision de partir)", "Il est difficile de comprendre. (not: *C'est difficile à comprendre — register-sensitive)"],
  },
];

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client, { schema });

  let inserted = 0;
  let skipped = 0;

  for (const seed of SEEDS) {
    const existing = await db
      .select({ id: rules.id })
      .from(rules)
      .where(eq(rules.id, seed.id))
      .limit(1)
      .then((r) => r[0]);

    if (existing) {
      skipped += 1;
      continue;
    }

    await db.insert(rules).values(seed);
    inserted += 1;
  }

  console.log(`✓ Rules seed complete — inserted ${inserted}, skipped ${skipped}.`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
