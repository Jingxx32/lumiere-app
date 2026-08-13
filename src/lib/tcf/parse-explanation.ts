/**
 * Parse one TCF explanation markdown file.
 *
 * Layout (see docs/superpowers/specs/2026-08-13-tcf-explanations-design.md §4):
 *
 *   ---
 *   test: 1
 *   skill: reading
 *   question: 5
 *   written: 2026-08-13
 *   ---
 *
 *   ## 全文翻译
 *   …
 *   ## 题干
 *   …
 *
 * Pure: no IO, no DB. `written` is informational and deliberately not returned.
 */

export interface ParsedExplanation {
  test: number;
  skill: "reading" | "listening";
  question: number;
  /** Everything after the frontmatter, trimmed — written verbatim to `explanation`. */
  body: string;
  /** Body of the "## 全文翻译" section, or null when the file has none. */
  translationEn: string | null;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const TRANSLATION_HEADING = "全文翻译";

function readField(fm: Record<string, string>, key: string): string {
  const value = fm[key];
  if (value === undefined || value === "") {
    throw new Error(`explanation frontmatter is missing "${key}"`);
  }
  return value;
}

function readNumber(fm: Record<string, string>, key: string): number {
  const raw = readField(fm, key);
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`explanation frontmatter "${key}" must be a positive integer, got "${raw}"`);
  }
  return n;
}

/** Content of the first `## <heading>` section, up to the next heading of any level. */
function sectionBody(body: string, heading: string): string | null {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{1,6}\s/.test(l) && l.includes(heading));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{1,6}\s/.test(l));
  const picked = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
  return picked === "" ? null : picked;
}

export function parseExplanationFile(raw: string): ParsedExplanation {
  const match = FRONTMATTER.exec(raw);
  if (!match) {
    throw new Error("explanation file has no --- frontmatter --- block");
  }

  const fm: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    fm[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
  }

  const skill = readField(fm, "skill");
  if (skill !== "reading" && skill !== "listening") {
    throw new Error(`explanation frontmatter "skill" must be reading or listening, got "${skill}"`);
  }

  const body = raw.slice(match[0].length).trim();
  if (body === "") {
    throw new Error("explanation file has an empty body");
  }

  return {
    test: readNumber(fm, "test"),
    skill,
    question: readNumber(fm, "question"),
    body,
    translationEn: sectionBody(body, TRANSLATION_HEADING),
  };
}

/** Canonical file name for a locator — CE = compréhension écrite, CO = orale. */
export function expectedFileName(
  p: Pick<ParsedExplanation, "test" | "skill" | "question">,
): string {
  const prefix = p.skill === "reading" ? "CE" : "CO";
  return `${prefix}-T${p.test}-Q${p.question}.md`;
}
