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

/** 唯一确定一道题的三元组。 */
export interface ExplanationLocator {
  test: number;
  skill: "reading" | "listening";
  question: number;
}

export interface ParsedExplanation extends ExplanationLocator {
  /** Everything after the frontmatter, trimmed — written verbatim to `explanation`. */
  body: string;
  /** Body of the "## 全文翻译" section, or null when the file has none. */
  translationEn: string | null;
}

/** 与 ParsedExplanation 的区别：没有 frontmatter 时 locator 为 null 而不是抛错。 */
export interface ParsedExplanationBody {
  locator: ExplanationLocator | null;
  body: string;
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

/**
 * Content of the first `## <heading>` section, up to the next heading of the
 * same or higher level (fewer or equal `#` marks). Deeper headings (more `#`
 * marks) are nested content and stay in the returned text.
 */
function sectionBody(body: string, heading: string): string | null {
  const lines = body.split(/\r?\n/);
  const headingLine = /^(#{1,6})\s+(.*)$/;
  const start = lines.findIndex((l) => {
    const m = headingLine.exec(l);
    return m !== null && m[2].trim() === heading;
  });
  if (start === -1) return null;
  const level = headingLine.exec(lines[start])![1].length;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => {
    const m = headingLine.exec(l);
    return m !== null && m[1].length <= level;
  });
  const picked = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
  return picked === "" ? null : picked;
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * Parse an explanation whose frontmatter is optional.
 *
 * The HTTP write endpoint accepts bodies with no frontmatter (the locator then
 * comes from the URL), so frontmatter absence is a valid state here rather than
 * an error. `parseExplanationFile` is the stricter wrapper used by the file-based
 * sync script.
 */
export function parseExplanationBody(raw: string): ParsedExplanationBody {
  const trimmed = raw.replace(/^\s+/, "");
  const match = FRONTMATTER.exec(trimmed);

  const body = (match ? trimmed.slice(match[0].length) : trimmed).trim();
  if (body === "") {
    throw new Error("explanation file has an empty body");
  }

  let locator: ExplanationLocator | null = null;
  if (match) {
    const fm: Record<string, string> = {};
    for (const line of match[1].split(/\r?\n/)) {
      const sep = line.indexOf(":");
      if (sep === -1) continue;
      fm[line.slice(0, sep).trim()] = unquote(line.slice(sep + 1).trim());
    }

    const skill = readField(fm, "skill");
    if (skill !== "reading" && skill !== "listening") {
      throw new Error(
        `explanation frontmatter "skill" must be reading or listening, got "${skill}"`,
      );
    }

    locator = {
      test: readNumber(fm, "test"),
      skill,
      question: readNumber(fm, "question"),
    };
  }

  return { locator, body, translationEn: sectionBody(body, TRANSLATION_HEADING) };
}

export function parseExplanationFile(raw: string): ParsedExplanation {
  const parsed = parseExplanationBody(raw);
  if (parsed.locator === null) {
    throw new Error("explanation file has no --- frontmatter --- block");
  }
  return {
    ...parsed.locator,
    body: parsed.body,
    translationEn: parsed.translationEn,
  };
}

/** Canonical label for a locator — CE = compréhension écrite, CO = orale. */
export function explanationLocatorLabel(p: ExplanationLocator): string {
  const prefix = p.skill === "reading" ? "CE" : "CO";
  return `${prefix}-T${p.test}-Q${p.question}`;
}

export function expectedFileName(p: ExplanationLocator): string {
  return `${explanationLocatorLabel(p)}.md`;
}
