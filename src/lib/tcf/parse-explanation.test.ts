import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseExplanationFile,
  parseExplanationBody,
  expectedFileName,
  explanationLocatorLabel,
} from "./parse-explanation";

const SAMPLE = `---
test: 1
skill: reading
question: 5
written: 2026-08-13
---

## 全文翻译

**Question** — What is Julien's favorite hobby?

**Options** — A. Reading · B. Cycling · C. Painting · D. Cooking

## 题干

Quel est le passe-temps préféré de Julien ?

**答案：B**
`;

test("parses the frontmatter locator", () => {
  const p = parseExplanationFile(SAMPLE);
  assert.equal(p.test, 1);
  assert.equal(p.skill, "reading");
  assert.equal(p.question, 5);
});

test("body starts after the frontmatter and keeps the whole explanation", () => {
  const p = parseExplanationFile(SAMPLE);
  assert.ok(p.body.startsWith("## 全文翻译"));
  assert.ok(p.body.includes("**答案：B**"));
  assert.ok(!p.body.includes("written:"));
});

test("extracts the 全文翻译 section, stopping at the next heading", () => {
  const p = parseExplanationFile(SAMPLE);
  assert.ok(p.translationEn !== null);
  assert.ok(p.translationEn.startsWith("**Question**"));
  assert.ok(p.translationEn.includes("D. Cooking"));
  assert.ok(!p.translationEn.includes("题干"));
});

test("translationEn is null when the section is absent", () => {
  const raw = `---
test: 2
skill: listening
question: 30
written: 2026-08-13
---

## 题干

Rien à traduire.
`;
  assert.equal(parseExplanationFile(raw).translationEn, null);
});

test("throws when frontmatter is missing", () => {
  assert.throws(() => parseExplanationFile("## 题干\nfoo\n"), /frontmatter/i);
});

test("throws on an unknown skill", () => {
  const raw = `---
test: 1
skill: speaking
question: 5
written: 2026-08-13
---

## 题干
foo
`;
  assert.throws(() => parseExplanationFile(raw), /skill/i);
});

test("throws when a locator field is missing", () => {
  const raw = `---
test: 1
skill: reading
written: 2026-08-13
---

## 题干
foo
`;
  assert.throws(() => parseExplanationFile(raw), /question/i);
});

test("expectedFileName builds the CE/CO convention", () => {
  assert.equal(expectedFileName({ test: 1, skill: "reading", question: 5 }), "CE-T1-Q5.md");
  assert.equal(expectedFileName({ test: 13, skill: "listening", question: 30 }), "CO-T13-Q30.md");
});

test("keeps a subheading nested inside 全文翻译 instead of treating it as the section end", () => {
  const raw = `---
test: 1
skill: reading
question: 5
written: 2026-08-13
---

## 全文翻译

### Question

What is Julien's favorite hobby?

### Options

A. Reading · B. Cycling

## 题干

Quel est le passe-temps préféré de Julien ?
`;
  const p = parseExplanationFile(raw);
  assert.ok(p.translationEn !== null);
  assert.ok(p.translationEn.includes("### Question"));
  assert.ok(p.translationEn.includes("What is Julien's favorite hobby?"));
  assert.ok(p.translationEn.includes("### Options"));
  assert.ok(p.translationEn.includes("A. Reading"));
  assert.ok(!p.translationEn.includes("题干"));
});

test("tolerates a leading blank line before the frontmatter", () => {
  const raw = `\n---\ntest: 1\nskill: reading\nquestion: 5\nwritten: 2026-08-13\n---\n\n## 全文翻译\n\nSome text.\n`;
  const p = parseExplanationFile(raw);
  assert.equal(p.test, 1);
  assert.equal(p.skill, "reading");
  assert.equal(p.question, 5);
});

test("strips a single pair of matching quotes from frontmatter scalars", () => {
  const raw = `---\ntest: "1"\nskill: "reading"\nquestion: '5'\nwritten: 2026-08-13\n---\n\n## 题干\nfoo\n`;
  const p = parseExplanationFile(raw);
  assert.equal(p.test, 1);
  assert.equal(p.skill, "reading");
  assert.equal(p.question, 5);
});

test("matches the translation heading exactly, not as a substring", () => {
  const raw = `---
test: 1
skill: reading
question: 5
written: 2026-08-13
---

## 关于全文翻译对照表的说明

This is not the translation section.

## 题干

foo
`;
  const p = parseExplanationFile(raw);
  assert.equal(p.translationEn, null);
});

test("parseExplanationBody returns a null locator when frontmatter is absent", () => {
  const raw = "## 全文翻译\n\nSome text.\n\n## 题干\n\nfoo\n";
  const p = parseExplanationBody(raw);
  assert.equal(p.locator, null);
  assert.ok(p.body.startsWith("## 全文翻译"));
  assert.equal(p.translationEn, "Some text.");
});

test("parseExplanationBody returns the locator when frontmatter is present", () => {
  const p = parseExplanationBody(SAMPLE);
  assert.deepEqual(p.locator, { test: 1, skill: "reading", question: 5 });
  assert.ok(p.body.startsWith("## 全文翻译"));
});

test("parseExplanationBody still rejects an invalid skill", () => {
  const raw = `---\ntest: 1\nskill: speaking\nquestion: 5\n---\n\n## 题干\nfoo\n`;
  assert.throws(() => parseExplanationBody(raw), /skill/i);
});

test("parseExplanationBody still rejects an incomplete locator", () => {
  const raw = `---\ntest: 1\nskill: reading\n---\n\n## 题干\nfoo\n`;
  assert.throws(() => parseExplanationBody(raw), /question/i);
});

test("explanationLocatorLabel builds the CE/CO label without the extension", () => {
  assert.equal(explanationLocatorLabel({ test: 1, skill: "reading", question: 5 }), "CE-T1-Q5");
  assert.equal(
    explanationLocatorLabel({ test: 13, skill: "listening", question: 30 }),
    "CO-T13-Q30",
  );
});

test("reports the frontmatter problem, not the empty body, when a file has both", () => {
  const raw = "---\ntest: 1\nskill: bogus\n---\n";
  assert.throws(() => parseExplanationFile(raw), /skill/i);
  assert.throws(() => parseExplanationBody(raw), /skill/i);
});

test("reports an empty body when there is no frontmatter to blame", () => {
  assert.throws(() => parseExplanationFile(""), /empty body/i);
});
